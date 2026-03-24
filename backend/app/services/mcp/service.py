from __future__ import annotations

import json
import time
from concurrent.futures import ThreadPoolExecutor, TimeoutError as FuturesTimeoutError
from dataclasses import dataclass
from typing import Any, Callable

from app.api.deps import require_project_viewer
from app.db.session import SessionLocal
from app.llm.redaction import redact_text
from app.models.project_settings import ProjectSettings
from app.services.graph_context_service import query_graph_context
from app.services.memory_query_service import normalize_query_text, parse_query_preprocessing_config
from app.services.run_store import write_generation_run
from app.services.search_index_service import query_project_search
from app.services.vector_embedding_overrides import vector_embedding_overrides
from app.services.vector_kb_service import resolve_query_kbs as resolve_vector_query_kbs
from app.services.vector_rag_service import VectorSource, query_project
from app.services.vector_rerank_overrides import vector_rerank_overrides

_DEFAULT_TIMEOUT_SECONDS = 6.0
_DEFAULT_MAX_OUTPUT_CHARS = 6000
_MAX_TOOL_CALLS = 6


@dataclass(frozen=True, slots=True)
class McpToolSpec:
    name: str
    description: str
    args_schema: dict[str, object]


@dataclass(frozen=True, slots=True)
class McpToolCall:
    tool_name: str
    args: dict[str, object]


@dataclass(frozen=True, slots=True)
class McpToolCallResult:
    run_id: str
    tool_name: str
    ok: bool
    output_text: str
    error_code: str | None
    error_message: str | None
    latency_ms: int
    truncated: bool


@dataclass(frozen=True, slots=True)
class McpResearchConfig:
    enabled: bool
    allowlist: list[str]
    calls: list[McpToolCall]
    timeout_seconds: float | None = None
    max_output_chars: int | None = None


@dataclass(frozen=True, slots=True)
class _ToolRuntimeContext:
    actor_user_id: str
    project_id: str
    chapter_id: str | None


_ToolRunner = Callable[[_ToolRuntimeContext, dict[str, object]], str]


@dataclass(frozen=True, slots=True)
class _Tool:
    spec: McpToolSpec
    run: _ToolRunner


def _json_safe(value: object) -> object:
    if value is None:
        return None
    if isinstance(value, (str, int, float, bool)):
        return value
    if isinstance(value, list):
        return [_json_safe(item) for item in value[:200]]
    if isinstance(value, dict):
        out: dict[str, object] = {}
        for k, v in list(value.items())[:200]:
            out[str(k)] = _json_safe(v)
        return out
    return str(value)


def _redact_obj(value: object) -> object:
    if value is None:
        return None
    if isinstance(value, str):
        return redact_text(value)
    if isinstance(value, list):
        return [_redact_obj(item) for item in value]
    if isinstance(value, dict):
        return {str(k): _redact_obj(v) for k, v in value.items()}
    return value


def _safe_text_arg(args: dict[str, object], key: str, *, default: str = "", max_length: int = 8000) -> str:
    raw = args.get(key)
    if raw is None:
        return default
    value = str(raw).strip()
    return value[:max_length]


def _safe_int_arg(args: dict[str, object], key: str, *, default: int, min_value: int, max_value: int) -> int:
    raw = args.get(key)
    try:
        value = int(raw) if raw is not None else default
    except Exception:
        value = default
    return max(min_value, min(value, max_value))


def _safe_float_arg(
    args: dict[str, object],
    key: str,
    *,
    default: float | None,
    min_value: float,
    max_value: float,
) -> float | None:
    raw = args.get(key)
    if raw is None:
        return default
    try:
        value = float(raw)
    except Exception:
        return default
    return max(min_value, min(value, max_value))


def _safe_str_list_arg(
    args: dict[str, object],
    key: str,
    *,
    max_items: int,
    max_length: int,
) -> list[str]:
    raw = args.get(key)
    if not isinstance(raw, list):
        return []
    out: list[str] = []
    for item in raw[:max_items]:
        text = str(item or "").strip()
        if not text:
            continue
        out.append(text[:max_length])
    return out


def _format_search_result(*, query_text: str, result: dict[str, object]) -> str:
    items = result.get("items")
    item_list = items if isinstance(items, list) else []
    if not item_list:
        return f"Query: {query_text}\nNo results."

    lines = [f"Query: {query_text}", f"Mode: {str(result.get('mode') or 'unknown')}"]
    for index, item in enumerate(item_list[:5], start=1):
        if not isinstance(item, dict):
            continue
        source_type = str(item.get("source_type") or "unknown")
        source_id = str(item.get("source_id") or "").strip()
        title = str(item.get("title") or "").strip() or source_id or "Untitled"
        snippet = str(item.get("snippet") or "").strip().replace("\n", " ")
        jump_url = str(item.get("jump_url") or "").strip()

        lines.append(f"{index}. [{source_type}] {title}")
        if snippet:
            lines.append(f"   {snippet}")
        if jump_url:
            lines.append(f"   jump: {jump_url}")
    return "\n".join(lines)


def _format_vector_result(*, query_text: str, result: dict[str, object]) -> str:
    if not bool(result.get("enabled")):
        return f"Query: {query_text}\nVector disabled: {str(result.get('disabled_reason') or 'unknown')}"

    final = result.get("final")
    final_obj = final if isinstance(final, dict) else {}
    text_md = str(final_obj.get("text_md") or "").strip()
    if text_md:
        return f"Query: {query_text}\n{text_md}"

    chunks = final_obj.get("chunks")
    chunk_list = chunks if isinstance(chunks, list) else []
    if not chunk_list:
        return f"Query: {query_text}\nNo vector hits."

    lines = [f"Query: {query_text}", "Top vector hits:"]
    for index, chunk in enumerate(chunk_list[:4], start=1):
        if not isinstance(chunk, dict):
            continue
        source = str(chunk.get("source") or chunk.get("source_type") or "unknown")
        title = str(chunk.get("title") or "").strip() or str(chunk.get("source_id") or "").strip() or "Untitled"
        snippet = str(chunk.get("text_md") or "").strip().replace("\n", " ")
        lines.append(f"{index}. [{source}] {title}")
        if snippet:
            lines.append(f"   {snippet[:240]}")
    return "\n".join(lines)


def _format_graph_result(*, query_text: str, result: dict[str, object]) -> str:
    if not bool(result.get("enabled")):
        return f"Query: {query_text}\nGraph disabled: {str(result.get('disabled_reason') or 'unknown')}"

    prompt_block = result.get("prompt_block")
    prompt_obj = prompt_block if isinstance(prompt_block, dict) else {}
    text_md = str(prompt_obj.get("text_md") or "").strip()
    if text_md:
        return f"Query: {query_text}\n{text_md}"

    matched = result.get("matched")
    matched_obj = matched if isinstance(matched, dict) else {}
    names = matched_obj.get("entity_names")
    entity_names = [str(name).strip() for name in names if str(name).strip()] if isinstance(names, list) else []
    lines = [f"Query: {query_text}"]
    if entity_names:
        lines.append(f"Matched entities: {', '.join(entity_names[:8])}")
    else:
        lines.append("No graph matches.")
    return "\n".join(lines)


def _tool_project_search(ctx: _ToolRuntimeContext, args: dict[str, object]) -> str:
    query_text = _safe_text_arg(args, "q", max_length=200)
    if not query_text:
        raise ValueError("q is required")
    sources = _safe_str_list_arg(args, "sources", max_items=20, max_length=64)
    limit = _safe_int_arg(args, "limit", default=5, min_value=1, max_value=20)
    offset = _safe_int_arg(args, "offset", default=0, min_value=0, max_value=1000)

    db = SessionLocal()
    try:
        require_project_viewer(db, project_id=ctx.project_id, user_id=ctx.actor_user_id)
        result = query_project_search(
            db=db,
            project_id=ctx.project_id,
            q=query_text,
            sources=sources,
            limit=limit,
            offset=offset,
        )
    finally:
        db.close()
    return _format_search_result(query_text=query_text, result=result)


def _tool_project_vector_query(ctx: _ToolRuntimeContext, args: dict[str, object]) -> str:
    query_text_raw = _safe_text_arg(args, "query_text", max_length=8000)
    if not query_text_raw:
        raise ValueError("query_text is required")
    kb_ids = _safe_str_list_arg(args, "kb_ids", max_items=20, max_length=64)
    sources_raw = _safe_str_list_arg(args, "sources", max_items=10, max_length=64)
    rerank_hybrid_alpha = _safe_float_arg(args, "rerank_hybrid_alpha", default=None, min_value=0.0, max_value=1.0)

    db = SessionLocal()
    try:
        require_project_viewer(db, project_id=ctx.project_id, user_id=ctx.actor_user_id)
        settings_row = db.get(ProjectSettings, ctx.project_id)
        embedding = vector_embedding_overrides(settings_row)
        rerank = vector_rerank_overrides(settings_row)
        if rerank_hybrid_alpha is not None:
            rerank = dict(rerank)
            rerank["hybrid_alpha"] = rerank_hybrid_alpha

        selected_kbs = resolve_vector_query_kbs(db, project_id=ctx.project_id, requested_kb_ids=kb_ids or None)
        qp_cfg = parse_query_preprocessing_config(
            (settings_row.query_preprocessing_json or "").strip() if settings_row is not None else None
        )
        normalized_query_text, _obs = normalize_query_text(query_text=query_text_raw, config=qp_cfg)
        selected_kb_ids = [row.kb_id for row in selected_kbs]
        kb_weights = {row.kb_id: float(row.weight) for row in selected_kbs}
        kb_orders = {row.kb_id: int(row.order_index) for row in selected_kbs}
        kb_priority_groups = {row.kb_id: str(getattr(row, "priority_group", "normal") or "normal") for row in selected_kbs}
    finally:
        db.close()

    sources: list[VectorSource] = [
        source  # type: ignore[list-item]
        for source in sources_raw
        if source in ("worldbook", "outline", "chapter", "story_memory")
    ] or ["worldbook", "outline", "chapter", "story_memory"]
    result = query_project(
        project_id=ctx.project_id,
        kb_ids=selected_kb_ids,
        query_text=normalized_query_text,
        sources=sources,
        embedding=embedding,
        rerank=rerank,
        kb_weights=kb_weights,
        kb_orders=kb_orders,
        kb_priority_groups=kb_priority_groups,
    )
    return _format_vector_result(query_text=normalized_query_text, result=result)


def _tool_project_graph_query(ctx: _ToolRuntimeContext, args: dict[str, object]) -> str:
    query_text_raw = _safe_text_arg(args, "query_text", max_length=8000)
    if not query_text_raw:
        raise ValueError("query_text is required")
    hop = _safe_int_arg(args, "hop", default=1, min_value=0, max_value=1)
    max_nodes = _safe_int_arg(args, "max_nodes", default=12, min_value=1, max_value=200)
    max_edges = _safe_int_arg(args, "max_edges", default=20, min_value=0, max_value=500)

    db = SessionLocal()
    try:
        require_project_viewer(db, project_id=ctx.project_id, user_id=ctx.actor_user_id)
        settings_row = db.get(ProjectSettings, ctx.project_id)
        qp_cfg = parse_query_preprocessing_config(
            (settings_row.query_preprocessing_json or "").strip() if settings_row is not None else None
        )
        normalized_query_text, _obs = normalize_query_text(query_text=query_text_raw, config=qp_cfg)
        result = query_graph_context(
            db=db,
            project_id=ctx.project_id,
            query_text=normalized_query_text,
            hop=hop,
            max_nodes=max_nodes,
            max_edges=max_edges,
            enabled=True,
        )
    finally:
        db.close()
    return _format_graph_result(query_text=normalized_query_text, result=result)


_TOOLS: dict[str, _Tool] = {
    "project.search": _Tool(
        spec=McpToolSpec(
            name="project.search",
            description="Search project content across indexed sources and return concise hit summaries.",
            args_schema={
                "type": "object",
                "properties": {
                    "q": {"type": "string"},
                    "sources": {"type": "array", "items": {"type": "string"}},
                    "limit": {"type": "integer"},
                    "offset": {"type": "integer"},
                },
                "required": ["q"],
            },
        ),
        run=_tool_project_search,
    ),
    "project.vector_query": _Tool(
        spec=McpToolSpec(
            name="project.vector_query",
            description="Run vector retrieval for the current project and return top semantic matches.",
            args_schema={
                "type": "object",
                "properties": {
                    "query_text": {"type": "string"},
                    "kb_ids": {"type": "array", "items": {"type": "string"}},
                    "sources": {"type": "array", "items": {"type": "string"}},
                    "rerank_hybrid_alpha": {"type": "number"},
                },
                "required": ["query_text"],
            },
        ),
        run=_tool_project_vector_query,
    ),
    "project.graph_query": _Tool(
        spec=McpToolSpec(
            name="project.graph_query",
            description="Query the structured memory graph and return related entities and relations.",
            args_schema={
                "type": "object",
                "properties": {
                    "query_text": {"type": "string"},
                    "hop": {"type": "integer"},
                    "max_nodes": {"type": "integer"},
                    "max_edges": {"type": "integer"},
                },
                "required": ["query_text"],
            },
        ),
        run=_tool_project_graph_query,
    ),
}


def list_mcp_tools() -> list[McpToolSpec]:
    return [t.spec for t in _TOOLS.values()]


def _resolve_tool(tool_name: str) -> _Tool | None:
    return _TOOLS.get(tool_name)


def _run_with_timeout(*, fn: Callable[[], str], timeout_seconds: float) -> str:
    if timeout_seconds <= 0:
        timeout_seconds = _DEFAULT_TIMEOUT_SECONDS
    with ThreadPoolExecutor(max_workers=1) as ex:
        fut = ex.submit(fn)
        return fut.result(timeout=timeout_seconds)


def run_mcp_tool_call_and_record(
    *,
    request_id: str,
    actor_user_id: str,
    project_id: str,
    chapter_id: str | None,
    tool_name: str,
    args: dict[str, object] | None,
    allowlist: list[str] | None,
    timeout_seconds: float | None = None,
    max_output_chars: int | None = None,
    purpose: str | None = None,
) -> McpToolCallResult:
    tool_name = str(tool_name or "").strip()
    safe_allowlist = [str(x).strip() for x in (allowlist or []) if isinstance(x, str) and x.strip()]
    args_dict = args or {}
    safe_args = _json_safe(args_dict)
    ctx = _ToolRuntimeContext(actor_user_id=actor_user_id, project_id=project_id, chapter_id=chapter_id)

    err_code: str | None = None
    err_msg: str | None = None
    ok = False
    truncated = False
    output_text = ""
    latency_ms = 0

    timeout = float(timeout_seconds) if timeout_seconds is not None else _DEFAULT_TIMEOUT_SECONDS
    out_limit = int(max_output_chars) if max_output_chars is not None else _DEFAULT_MAX_OUTPUT_CHARS
    if out_limit < 0:
        out_limit = 0

    tool = _resolve_tool(tool_name)
    if not safe_allowlist:
        err_code, err_msg = "ALLOWLIST_REQUIRED", "allowlist is required"
    elif tool is None:
        err_code, err_msg = "TOOL_NOT_FOUND", "tool not found"
    elif tool_name not in safe_allowlist:
        err_code, err_msg = "TOOL_NOT_ALLOWED", "tool not in allowlist"
    else:
        start = time.monotonic()
        try:
            raw = _run_with_timeout(fn=lambda: tool.run(ctx, args_dict), timeout_seconds=timeout)
            output_text = str(raw or "")
            ok = True
        except FuturesTimeoutError:
            err_code, err_msg = "TOOL_TIMEOUT", f"timeout after {timeout}s"
        except Exception as exc:
            err_code, err_msg = "TOOL_ERROR", str(exc)[:200]
        finally:
            latency_ms = int((time.monotonic() - start) * 1000)

    output_text = redact_text(output_text or "")
    if out_limit == 0:
        truncated = bool(output_text.strip())
        output_text = ""
    elif len(output_text) > out_limit:
        output_text = output_text[:out_limit].rstrip() + "\n...[truncated]"
        truncated = True

    params_obj: dict[str, Any] = {
        "tool_name": tool_name,
        "args": _redact_obj(safe_args),
        "timeout_seconds": timeout,
        "max_output_chars": out_limit,
    }
    if purpose:
        params_obj["purpose"] = str(purpose)[:200]
    params_json = json.dumps(params_obj, ensure_ascii=False)

    error_json = None
    if not ok:
        error_json = json.dumps({"code": err_code or "TOOL_ERROR", "message": err_msg or "tool failed"}, ensure_ascii=False)

    run_id = write_generation_run(
        request_id=request_id,
        actor_user_id=actor_user_id,
        project_id=project_id,
        chapter_id=chapter_id,
        run_type="mcp_tool",
        provider=None,
        model=None,
        prompt_system="",
        prompt_user="",
        prompt_render_log_json=None,
        params_json=params_json,
        output_text=output_text if ok else None,
        error_json=error_json,
    )
    return McpToolCallResult(
        run_id=run_id,
        tool_name=tool_name,
        ok=ok,
        output_text=output_text,
        error_code=err_code,
        error_message=err_msg,
        latency_ms=latency_ms,
        truncated=truncated,
    )


def replay_mcp_tool_call_and_record(
    *,
    request_id: str,
    actor_user_id: str,
    project_id: str,
    chapter_id: str | None,
    original_params_json: str,
    allowlist: list[str] | None,
) -> McpToolCallResult:
    try:
        params = json.loads(original_params_json or "{}")
    except Exception:
        params = {}
    tool_name = str((params or {}).get("tool_name") or "").strip()
    args = (params or {}).get("args")
    if not isinstance(args, dict):
        args = {}
    timeout = (params or {}).get("timeout_seconds")
    max_chars = (params or {}).get("max_output_chars")
    return run_mcp_tool_call_and_record(
        request_id=request_id,
        actor_user_id=actor_user_id,
        project_id=project_id,
        chapter_id=chapter_id,
        tool_name=tool_name,
        args=args,  # type: ignore[arg-type]
        allowlist=allowlist,
        timeout_seconds=float(timeout) if timeout is not None else None,
        max_output_chars=int(max_chars) if max_chars is not None else None,
        purpose="replay",
    )


def run_mcp_research_and_record(
    *,
    request_id: str,
    actor_user_id: str,
    project_id: str,
    chapter_id: str | None,
    config: McpResearchConfig,
) -> tuple[str, list[McpToolCallResult], list[str]]:
    if not config.enabled:
        return "", [], []

    allowlist = [str(x).strip() for x in (config.allowlist or []) if isinstance(x, str) and x.strip()]
    if not allowlist:
        return "", [], ["mcp_allowlist_required"]
    calls = list(config.calls or [])[:_MAX_TOOL_CALLS]
    warnings: list[str] = []
    if (config.calls or []) and len(config.calls) > _MAX_TOOL_CALLS:
        warnings.append("mcp_call_limit_truncated")

    results: list[McpToolCallResult] = []
    parts: list[str] = []
    for call in calls:
        name = str(call.tool_name or "").strip()
        if not name:
            warnings.append("mcp_call_invalid_tool_name")
            continue
        res = run_mcp_tool_call_and_record(
            request_id=request_id,
            actor_user_id=actor_user_id,
            project_id=project_id,
            chapter_id=chapter_id,
            tool_name=name,
            args=call.args,
            allowlist=allowlist,
            timeout_seconds=config.timeout_seconds,
            max_output_chars=config.max_output_chars,
            purpose="research",
        )
        results.append(res)
        if res.ok and res.output_text.strip():
            parts.append(f"【{res.tool_name}】\n{res.output_text.strip()}")
        if not res.ok:
            warnings.append(f"mcp_tool_failed:{res.tool_name}:{res.error_code or 'TOOL_ERROR'}")

    context = "\n\n".join(parts).strip()
    return context, results, warnings
