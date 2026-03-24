from __future__ import annotations

import json
import logging
from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import require_chapter_editor, require_project_viewer
from app.core.errors import AppError
from app.llm.messages import ChatMessage, coalesce_system, flatten_messages
from app.llm.redaction import redact_text
from app.models.chapter import Chapter
from app.models.character import Character
from app.models.outline import Outline
from app.models.project import Project
from app.models.project_settings import ProjectSettings
from app.schemas.chapter_generate import ChapterGenerateRequest
from app.schemas.chapter_plan import ChapterPlanRequest
from app.services.chapter_context_service import build_chapter_generate_render_values
from app.services.generation_pipeline import run_mcp_research_step
from app.services.generation_service import PreparedLlmCall
from app.services.llm_task_preset_resolver import resolve_task_llm_config
from app.services.mcp.service import McpResearchConfig as McpResearchConfigSvc
from app.services.mcp.service import McpToolCall as McpToolCallSvc
from app.services.memory_query_service import normalize_query_text, parse_query_preprocessing_config
from app.services.memory_retrieval_service import build_memory_retrieval_log_json, retrieve_memory_context_pack
from app.services.prompt_presets import ensure_default_plan_preset, render_preset_for_task
from app.services.prompt_store import format_characters

PREVIOUS_CHAPTER_ENDING_CHARS = 1000
CURRENT_DRAFT_TAIL_CHARS = 1200
MAX_MACRO_SEED_CHARS = 256


@dataclass(frozen=True, slots=True)
class ChapterMemoryPreparation:
    memory_pack: dict[str, object] | None
    memory_injection_config: dict[str, object] | None
    memory_retrieval_log_json: dict[str, object] | None


@dataclass(frozen=True, slots=True)
class PreparedPromptBundle:
    prompt_system: str
    prompt_user: str
    prompt_messages: list[ChatMessage]
    prompt_render_log_json: str | None
    render_log: dict | None


@dataclass(frozen=True, slots=True)
class PreparedPlanPromptBundle:
    api_key: str
    llm_call: PreparedLlmCall
    prompt_system: str
    prompt_user: str
    prompt_messages: list[ChatMessage]
    prompt_render_log_json: str | None


@dataclass(frozen=True, slots=True)
class PreparedChapterPlanRequest:
    project_id: str
    resolved_api_key: str
    llm_call: PreparedLlmCall
    prompt_system: str
    prompt_user: str
    prompt_messages: list[ChatMessage]
    prompt_render_log_json: str | None


@dataclass(frozen=True, slots=True)
class PreparedChapterGenerateRequest:
    chapter: Chapter
    project: Project
    settings_row: ProjectSettings | None
    project_id: str
    resolved_api_key: str
    llm_call: PreparedLlmCall
    render_values: dict[str, object]
    base_instruction: str
    requirements_obj: object | None
    style_resolution: dict[str, object]
    memory_pack: dict[str, object] | None
    memory_injection_config: dict[str, object] | None
    memory_retrieval_log_json: dict[str, object] | None
    run_params_extra_json: dict[str, object] | None
    chapter_prompt: PreparedPromptBundle | None
    plan_prompt: PreparedPlanPromptBundle | None


def resolve_macro_seed(*, request_id: str, body: object) -> str:
    seed = str(getattr(body, "macro_seed", "") or "").strip()
    if not seed:
        return request_id
    return seed[:MAX_MACRO_SEED_CHARS]


def apply_prompt_override(
    *,
    prompt_system: str,
    prompt_user: str,
    prompt_messages: list[ChatMessage],
    body: ChapterGenerateRequest,
) -> tuple[str, str, list[ChatMessage], bool]:
    override = body.prompt_override
    if override is None:
        return prompt_system, prompt_user, prompt_messages, False

    override_messages: list[ChatMessage] = []
    for item in override.messages or []:
        role = str(item.role or "user").strip() or "user"
        content = str(item.content or "")
        name = str(item.name).strip() if isinstance(item.name, str) and item.name.strip() else None
        override_messages.append(ChatMessage(role=role, content=content, name=name))
    if override_messages:
        system, non_system = coalesce_system(override_messages)
        user = flatten_messages(non_system)
        return system, user, override_messages, True

    next_system = prompt_system if override.system is None else str(override.system or "")
    next_user = prompt_user if override.user is None else str(override.user or "")
    next_messages: list[ChatMessage] = []
    if next_system.strip():
        next_messages.append(ChatMessage(role="system", content=next_system))
    if next_user.strip():
        next_messages.append(ChatMessage(role="user", content=next_user))
    return next_system, next_user, next_messages, True


def redact_prompt_override_for_params(body: ChapterGenerateRequest) -> dict[str, object] | None:
    override = body.prompt_override
    if override is None:
        return None
    data = override.model_dump()
    if isinstance(data.get("system"), str):
        data["system"] = redact_text(data["system"])
    if isinstance(data.get("user"), str):
        data["user"] = redact_text(data["user"])

    messages = data.get("messages")
    if isinstance(messages, list):
        for item in messages:
            if not isinstance(item, dict):
                continue
            if isinstance(item.get("content"), str):
                item["content"] = redact_text(item["content"])
    return data


def redact_prompt_preview_for_params(
    *, prompt_system: str, prompt_user: str, prompt_messages: list[ChatMessage]
) -> dict[str, object]:
    return {
        "system": redact_text(prompt_system or ""),
        "user": redact_text(prompt_user or ""),
        "messages": [{"role": m.role, "content": redact_text(m.content or ""), "name": m.name} for m in prompt_messages],
    }


def build_prompt_inspector_params(
    *,
    macro_seed: str,
    prompt_overridden: bool,
    body: ChapterGenerateRequest,
    precheck_prompt_system: str,
    precheck_prompt_user: str,
    precheck_prompt_messages: list[ChatMessage],
    final_prompt_system: str,
    final_prompt_user: str,
    final_prompt_messages: list[ChatMessage],
) -> dict[str, object]:
    out: dict[str, object] = {
        "macro_seed": macro_seed,
        "prompt_overridden": bool(prompt_overridden),
        "precheck": redact_prompt_preview_for_params(
            prompt_system=precheck_prompt_system,
            prompt_user=precheck_prompt_user,
            prompt_messages=precheck_prompt_messages,
        ),
        "final": redact_prompt_preview_for_params(
            prompt_system=final_prompt_system,
            prompt_user=final_prompt_user,
            prompt_messages=final_prompt_messages,
        ),
    }
    override = redact_prompt_override_for_params(body)
    if override is not None:
        out["override"] = override
    return out


def build_mcp_research_config(body: ChapterGenerateRequest) -> McpResearchConfigSvc:
    cfg = getattr(body, "mcp_research", None)
    if cfg is None:
        return McpResearchConfigSvc(enabled=False, allowlist=[], calls=[])

    calls: list[McpToolCallSvc] = []
    for item in getattr(cfg, "calls", None) or []:
        tool_name = str(getattr(item, "tool_name", "") or "").strip()
        if not tool_name:
            continue
        args = getattr(item, "args", None)
        calls.append(McpToolCallSvc(tool_name=tool_name, args=args if isinstance(args, dict) else {}))

    allowlist = list(getattr(cfg, "allowlist", None) or [])
    return McpResearchConfigSvc(
        enabled=bool(getattr(cfg, "enabled", False)),
        allowlist=[str(x).strip() for x in allowlist if isinstance(x, str) and str(x).strip()],
        calls=calls,
        timeout_seconds=getattr(cfg, "timeout_seconds", None),
        max_output_chars=getattr(cfg, "max_output_chars", None),
    )


def inject_mcp_research_into_values(*, values: dict[str, object], context_md: str) -> None:
    text = str(context_md or "").strip()
    if not text:
        return

    base_instruction = str(values.get("instruction") or "").rstrip()
    user_obj = values.get("user")
    if isinstance(user_obj, dict):
        base = str(user_obj.get("instruction") or "").rstrip()
        user_obj["instruction"] = (base + "\n\n【资料收集 - 参考资料】\n" + text).strip()
    values["instruction"] = (base_instruction + "\n\n【资料收集 - 参考资料】\n" + text).strip()
    values["mcp_research"] = text


def mcp_research_params(
    *, cfg: McpResearchConfigSvc, applied: bool, tool_run_ids: list[str], warnings: list[str]
) -> dict[str, object]:
    return {
        "enabled": bool(cfg.enabled),
        "applied": bool(applied),
        "allowlist": list(cfg.allowlist or []),
        "tool_run_ids": list(tool_run_ids),
        "warnings": list(warnings or []),
    }


def resolve_memory_modules(raw_modules: dict[str, bool]) -> dict[str, bool]:
    return {
        "worldbook": bool(raw_modules.get("worldbook", True)),
        "story_memory": bool(raw_modules.get("story_memory", True)),
        "semantic_history": bool(raw_modules.get("semantic_history", False)),
        "foreshadow_open_loops": bool(raw_modules.get("foreshadow_open_loops", False)),
        "structured": bool(raw_modules.get("structured", True)),
        "tables": bool(raw_modules.get("tables", True)),
        "vector_rag": bool(raw_modules.get("vector_rag", True)),
        "graph": bool(raw_modules.get("graph", True)),
        "fractal": bool(raw_modules.get("fractal", True)),
    }


def prepare_chapter_memory_injection(
    *,
    db: Session,
    project_id: str,
    chapter: Chapter,
    body: ChapterGenerateRequest,
    settings_row: ProjectSettings | None,
    base_instruction: str,
    values: dict[str, object],
) -> ChapterMemoryPreparation:
    if not body.memory_injection_enabled:
        return ChapterMemoryPreparation(memory_pack=None, memory_injection_config=None, memory_retrieval_log_json=None)

    memory_query_text = ""
    query_text_source = "auto"
    requested_query_text = str(body.memory_query_text or "").strip()
    if requested_query_text:
        memory_query_text = requested_query_text[:5000]
        query_text_source = "user"
    else:
        memory_query_text = base_instruction
        if chapter.plan:
            memory_query_text = f"{memory_query_text}\n\n{chapter.plan}".strip()
        memory_query_text = memory_query_text[:5000]

    memory_modules = resolve_memory_modules(body.memory_modules or {})
    raw_query_text = memory_query_text
    qp_cfg = parse_query_preprocessing_config(
        (settings_row.query_preprocessing_json or "").strip() if settings_row is not None else None
    )
    memory_query_text, preprocess_obs = normalize_query_text(query_text=raw_query_text, config=qp_cfg)

    pack = None
    pack_errors = None
    try:
        pack = retrieve_memory_context_pack(
            db=db,
            project_id=project_id,
            query_text=memory_query_text,
            section_enabled=memory_modules,
        )
    except Exception:
        pack = None
        pack_errors = ["memory_pack_error"]

    memory_pack = pack.model_dump() if pack is not None else None
    if memory_pack is not None:
        values["memory"] = memory_pack

    memory_injection_config: dict[str, object] = {
        "query_text": memory_query_text,
        "query_text_source": query_text_source,
        "modules": memory_modules,
        "raw_query_text": raw_query_text,
        "normalized_query_text": memory_query_text,
        "preprocess_obs": preprocess_obs,
    }
    memory_retrieval_log_json = build_memory_retrieval_log_json(
        enabled=True,
        query_text=memory_query_text,
        pack=pack,
        errors=pack_errors,
    )
    return ChapterMemoryPreparation(
        memory_pack=memory_pack,
        memory_injection_config=memory_injection_config,
        memory_retrieval_log_json=memory_retrieval_log_json,
    )


def build_memory_run_params_extra_json(
    *,
    style_resolution: dict[str, object],
    memory_injection_enabled: bool,
    memory_preparation: ChapterMemoryPreparation,
) -> dict[str, object]:
    params: dict[str, object] = {
        "style_resolution": style_resolution,
        "memory_injection_enabled": memory_injection_enabled,
    }
    if memory_injection_enabled and memory_preparation.memory_injection_config is not None:
        params["memory_injection_config"] = memory_preparation.memory_injection_config
        params["memory_retrieval_log_json"] = memory_preparation.memory_retrieval_log_json
    return params


def resolve_task_llm_for_call(
    *,
    db: Session,
    project: Project,
    user_id: str,
    task_key: str,
    x_llm_provider: str | None,
    x_llm_api_key: str | None,
):
    resolved = resolve_task_llm_config(
        db,
        project=project,
        user_id=user_id,
        task_key=task_key,
        header_api_key=x_llm_api_key,
    )
    if resolved is None:
        raise AppError(code="LLM_CONFIG_ERROR", message="请先在 Prompts 页保存 LLM 配置", status_code=400)
    if x_llm_api_key and x_llm_provider and resolved.llm_call.provider != x_llm_provider:
        raise AppError(code="LLM_CONFIG_ERROR", message="当前任务 provider 与请求头不一致，请先保存/切换", status_code=400)
    return resolved


def find_missing_prereq_numbers(
    db: Session,
    *,
    project_id: str,
    outline_id: str,
    chapter_number: int,
) -> list[int]:
    if chapter_number <= 1:
        return []

    rows = db.execute(
        select(Chapter.number, Chapter.content_md, Chapter.summary)
        .where(
            Chapter.project_id == project_id,
            Chapter.outline_id == outline_id,
            Chapter.number < chapter_number,
        )
        .order_by(Chapter.number.asc())
    ).all()

    existing: dict[int, tuple[str | None, str | None]] = {int(r[0]): (r[1], r[2]) for r in rows}
    missing: list[int] = []
    for n in range(1, int(chapter_number)):
        content_md, summary = existing.get(n, (None, None))
        if not ((content_md or "").strip() or (summary or "").strip()):
            missing.append(n)
    return missing


def load_previous_chapter_context(
    db: Session,
    *,
    project_id: str,
    outline_id: str,
    chapter_number: int,
    previous_chapter: str | None,
) -> tuple[str, str]:
    mode = previous_chapter or "none"
    if mode == "none" or chapter_number <= 1:
        return "", ""

    prev = (
        db.execute(
            select(Chapter).where(
                Chapter.project_id == project_id,
                Chapter.outline_id == outline_id,
                Chapter.number == (chapter_number - 1),
            )
        )
        .scalars()
        .first()
    )
    if prev is None:
        return "", ""

    if mode == "summary":
        return (prev.summary or "").strip(), ""
    if mode == "content":
        return (prev.content_md or "").strip(), ""
    if mode == "tail":
        raw = (prev.content_md or "").strip()
        if not raw:
            return "", ""
        tail = raw[-PREVIOUS_CHAPTER_ENDING_CHARS:].lstrip()
        return "", tail

    return "", ""


def resolve_current_draft_tail(*, chapter: Chapter, request_tail: str | None) -> str:
    if request_tail is not None and request_tail.strip():
        return request_tail.strip()[-CURRENT_DRAFT_TAIL_CHARS:].lstrip()
    raw = (chapter.content_md or "").strip()
    if not raw:
        return ""
    return raw[-CURRENT_DRAFT_TAIL_CHARS:].lstrip()


def build_plan_prompt_bundle(
    *,
    db: Session,
    project_id: str,
    user_id: str,
    project: Project,
    x_llm_provider: str | None,
    x_llm_api_key: str | None,
    values: dict[str, object],
    base_instruction: str,
    requirements_obj: object | None,
    macro_seed: str,
) -> PreparedPlanPromptBundle:
    resolved_plan = resolve_task_llm_for_call(
        db=db,
        project=project,
        user_id=user_id,
        task_key="plan_chapter",
        x_llm_provider=x_llm_provider,
        x_llm_api_key=x_llm_api_key,
    )
    ensure_default_plan_preset(db, project_id=project_id)
    plan_values = dict(values)
    plan_values["instruction"] = base_instruction
    plan_values["user"] = {"instruction": base_instruction, "requirements": requirements_obj}
    plan_prompt_system, plan_prompt_user, plan_prompt_messages, _, _, _, plan_render_log = render_preset_for_task(
        db,
        project_id=project_id,
        task="plan_chapter",
        values=plan_values,  # type: ignore[arg-type]
        macro_seed=f"{macro_seed}:plan",
        provider=resolved_plan.llm_call.provider,
    )
    return PreparedPlanPromptBundle(
        api_key=str(resolved_plan.api_key),
        llm_call=resolved_plan.llm_call,
        prompt_system=plan_prompt_system,
        prompt_user=plan_prompt_user,
        prompt_messages=plan_prompt_messages,
        prompt_render_log_json=json.dumps(plan_render_log, ensure_ascii=False),
    )


def render_chapter_prompt_bundle(
    *,
    db: Session,
    project_id: str,
    llm_call: PreparedLlmCall,
    values: dict[str, object],
    macro_seed: str,
    body: ChapterGenerateRequest,
) -> tuple[PreparedPromptBundle, dict[str, object]]:
    prompt_system, prompt_user, prompt_messages, _, _, _, render_log = render_preset_for_task(
        db,
        project_id=project_id,
        task="chapter_generate",
        values=values,  # type: ignore[arg-type]
        macro_seed=macro_seed,
        provider=llm_call.provider,
    )
    precheck_prompt_system = prompt_system
    precheck_prompt_user = prompt_user
    precheck_prompt_messages = prompt_messages
    prompt_system, prompt_user, prompt_messages, override_applied = apply_prompt_override(
        prompt_system=prompt_system,
        prompt_user=prompt_user,
        prompt_messages=prompt_messages,
        body=body,
    )
    return (
        PreparedPromptBundle(
            prompt_system=prompt_system,
            prompt_user=prompt_user,
            prompt_messages=prompt_messages,
            prompt_render_log_json=json.dumps(render_log, ensure_ascii=False),
            render_log=render_log,
        ),
        {
            "prompt_inspector": build_prompt_inspector_params(
                macro_seed=macro_seed,
                prompt_overridden=override_applied,
                body=body,
                precheck_prompt_system=precheck_prompt_system,
                precheck_prompt_user=precheck_prompt_user,
                precheck_prompt_messages=precheck_prompt_messages,
                final_prompt_system=prompt_system,
                final_prompt_user=prompt_user,
                final_prompt_messages=prompt_messages,
            )
        },
    )


def prepare_plan_chapter_request(
    *,
    db: Session,
    chapter_id: str,
    body: ChapterPlanRequest,
    user_id: str,
    request_id: str,
    x_llm_provider: str | None,
    x_llm_api_key: str | None,
) -> PreparedChapterPlanRequest:
    chapter = require_chapter_editor(db, chapter_id=chapter_id, user_id=user_id)
    project_id = chapter.project_id
    if body.context.require_sequential:
        missing_numbers = find_missing_prereq_numbers(
            db,
            project_id=project_id,
            outline_id=chapter.outline_id,
            chapter_number=int(chapter.number),
        )
        if missing_numbers:
            raise AppError(
                code="CHAPTER_PREREQ_MISSING",
                message=f"缺少前置章节内容：第 {', '.join(str(n) for n in missing_numbers)} 章",
                status_code=400,
                details={"missing_numbers": missing_numbers},
            )
    project = db.get(Project, project_id)
    if project is None:
        raise AppError.not_found()

    resolved_plan = resolve_task_llm_for_call(
        db=db,
        project=project,
        user_id=user_id,
        task_key="plan_chapter",
        x_llm_provider=x_llm_provider,
        x_llm_api_key=x_llm_api_key,
    )
    ensure_default_plan_preset(db, project_id=project_id)

    settings_row = db.get(ProjectSettings, project_id)
    outline_row = db.get(Outline, chapter.outline_id)

    world_setting = (settings_row.world_setting if settings_row else "") or ""
    style_guide = (settings_row.style_guide if settings_row else "") or ""
    constraints = (settings_row.constraints if settings_row else "") or ""

    if not body.context.include_world_setting:
        world_setting = ""
    if not body.context.include_style_guide:
        style_guide = ""
    if not body.context.include_constraints:
        constraints = ""

    outline_text = (outline_row.content_md if outline_row else "") or ""
    if not body.context.include_outline:
        outline_text = ""

    chars: list[Character] = []
    if body.context.character_ids:
        chars = (
            db.execute(
                select(Character).where(
                    Character.project_id == project_id,
                    Character.id.in_(body.context.character_ids),
                )
            )
            .scalars()
            .all()
        )
    characters_text = format_characters(chars)

    prev_text, prev_ending = load_previous_chapter_context(
        db,
        project_id=project_id,
        outline_id=chapter.outline_id,
        chapter_number=chapter.number,
        previous_chapter=body.context.previous_chapter,
    )

    values: dict[str, object] = {
        "project_name": project.name or "",
        "genre": project.genre or "",
        "logline": project.logline or "",
        "world_setting": world_setting,
        "style_guide": style_guide,
        "constraints": constraints,
        "characters": characters_text,
        "outline": outline_text,
        "chapter_number": str(chapter.number),
        "chapter_title": (chapter.title or ""),
        "chapter_plan": (chapter.plan or ""),
        "instruction": body.instruction.strip(),
        "previous_chapter": prev_text,
        "previous_chapter_ending": prev_ending,
    }
    values["project"] = {
        "name": project.name or "",
        "genre": project.genre or "",
        "logline": project.logline or "",
        "world_setting": world_setting,
        "style_guide": style_guide,
        "constraints": constraints,
        "characters": characters_text,
    }
    values["story"] = {
        "outline": outline_text,
        "chapter_number": int(chapter.number),
        "chapter_title": (chapter.title or ""),
        "chapter_plan": (chapter.plan or ""),
        "previous_chapter": prev_text,
        "previous_chapter_ending": prev_ending,
    }
    values["user"] = {"instruction": body.instruction.strip()}
    values["context_optimizer_enabled"] = bool(getattr(settings_row, "context_optimizer_enabled", False))

    prompt_system, prompt_user, prompt_messages, _, _, _, render_log = render_preset_for_task(
        db,
        project_id=project_id,
        task="plan_chapter",
        values=values,  # type: ignore[arg-type]
        macro_seed=f"{request_id}:plan",
        provider=resolved_plan.llm_call.provider,
    )
    return PreparedChapterPlanRequest(
        project_id=str(project_id),
        resolved_api_key=str(resolved_plan.api_key),
        llm_call=resolved_plan.llm_call,
        prompt_system=prompt_system,
        prompt_user=prompt_user,
        prompt_messages=prompt_messages,
        prompt_render_log_json=json.dumps(render_log, ensure_ascii=False),
    )


def prepare_chapter_generate_request(
    *,
    db: Session,
    chapter_id: str,
    body: ChapterGenerateRequest,
    user_id: str,
    request_id: str,
    logger: logging.Logger,
    x_llm_provider: str | None,
    x_llm_api_key: str | None,
) -> PreparedChapterGenerateRequest:
    chapter = require_chapter_editor(db, chapter_id=chapter_id, user_id=user_id)
    project_id = chapter.project_id
    if body.context.require_sequential:
        missing_numbers = find_missing_prereq_numbers(
            db,
            project_id=project_id,
            outline_id=chapter.outline_id,
            chapter_number=int(chapter.number),
        )
        if missing_numbers:
            raise AppError(
                code="CHAPTER_PREREQ_MISSING",
                message=f"缺少前置章节内容：第 {', '.join(str(n) for n in missing_numbers)} 章",
                status_code=400,
                details={"missing_numbers": missing_numbers},
            )
    project = db.get(Project, project_id)
    if project is None:
        raise AppError.not_found()

    resolved_chapter = resolve_task_llm_for_call(
        db=db,
        project=project,
        user_id=user_id,
        task_key="chapter_generate",
        x_llm_provider=x_llm_provider,
        x_llm_api_key=x_llm_api_key,
    )
    llm_call = resolved_chapter.llm_call
    resolved_api_key = str(resolved_chapter.api_key)
    values, base_instruction, requirements_obj, style_resolution = build_chapter_generate_render_values(
        db,
        project=project,
        chapter=chapter,
        body=body,
        user_id=user_id,
    )
    settings_row = db.get(ProjectSettings, project_id)
    values["context_optimizer_enabled"] = bool(getattr(settings_row, "context_optimizer_enabled", False))
    memory_preparation = prepare_chapter_memory_injection(
        db=db,
        project_id=project_id,
        chapter=chapter,
        body=body,
        settings_row=settings_row,
        base_instruction=base_instruction,
        values=values,
    )
    run_params_extra_json = build_memory_run_params_extra_json(
        style_resolution=style_resolution,
        memory_injection_enabled=body.memory_injection_enabled,
        memory_preparation=memory_preparation,
    )

    mcp_cfg = build_mcp_research_config(body)
    mcp_step = run_mcp_research_step(
        logger=logger,
        request_id=request_id,
        actor_user_id=user_id,
        project_id=project_id,
        chapter_id=chapter_id,
        config=mcp_cfg,
    )
    inject_mcp_research_into_values(values=values, context_md=mcp_step.context_md)
    if mcp_cfg.enabled or mcp_step.warnings:
        run_params_extra_json = run_params_extra_json or {}
        run_params_extra_json["mcp_research"] = mcp_research_params(
            cfg=mcp_cfg,
            applied=mcp_step.applied,
            tool_run_ids=[r.run_id for r in mcp_step.tool_runs],
            warnings=mcp_step.warnings,
        )

    chapter_prompt = None
    plan_prompt = None
    macro_seed = resolve_macro_seed(request_id=request_id, body=body)
    if body.plan_first:
        plan_prompt = build_plan_prompt_bundle(
            db=db,
            project_id=project_id,
            user_id=user_id,
            project=project,
            x_llm_provider=x_llm_provider,
            x_llm_api_key=x_llm_api_key,
            values=values,
            base_instruction=base_instruction,
            requirements_obj=requirements_obj,
            macro_seed=macro_seed,
        )
    else:
        chapter_prompt, prompt_extra = render_chapter_prompt_bundle(
            db=db,
            project_id=project_id,
            llm_call=llm_call,
            values=values,
            macro_seed=macro_seed,
            body=body,
        )
        run_params_extra_json = {**(run_params_extra_json or {}), **prompt_extra}

    return PreparedChapterGenerateRequest(
        chapter=chapter,
        project=project,
        settings_row=settings_row,
        project_id=str(project_id),
        resolved_api_key=resolved_api_key,
        llm_call=llm_call,
        render_values=values,
        base_instruction=base_instruction,
        requirements_obj=requirements_obj,
        style_resolution=style_resolution,
        memory_pack=memory_preparation.memory_pack,
        memory_injection_config=memory_preparation.memory_injection_config,
        memory_retrieval_log_json=memory_preparation.memory_retrieval_log_json,
        run_params_extra_json=run_params_extra_json,
        chapter_prompt=chapter_prompt,
        plan_prompt=plan_prompt,
    )


def resolve_chapter_auto_update_token(*, chapter: Chapter, generation_run_id: str | None) -> str | None:
    run_id = str(generation_run_id or "").strip()
    if run_id:
        return run_id
    updated_at = getattr(chapter, "updated_at", None)
    if updated_at is not None:
        return updated_at.isoformat().replace("+00:00", "Z")
    return None

