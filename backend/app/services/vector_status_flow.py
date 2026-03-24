from __future__ import annotations

from typing import Any, Callable

from app.core.config import settings
from app.services.vector_query_flow import build_rerank_observation
from app.services.vector_models import VectorSource


def resolve_rerank_config(rerank: dict[str, Any] | None) -> tuple[bool, str, int, float]:
    enabled = bool(getattr(settings, "vector_rerank_enabled", False))
    method = "auto"
    top_k = int(getattr(settings, "vector_max_candidates", 20) or 20)
    hybrid_alpha = 0.0
    if rerank is None:
        return enabled, method, max(1, min(int(top_k), 1000)), float(hybrid_alpha)

    if "enabled" in rerank:
        enabled = bool(rerank.get("enabled"))
    raw_method = str(rerank.get("method") or "").strip()
    if raw_method:
        method = raw_method

    provider_raw = str(rerank.get("provider") or "").strip()
    if method == "auto" and provider_raw == "external_rerank_api":
        method = "external_rerank_api"
    if "top_k" in rerank and rerank.get("top_k") is not None:
        try:
            top_k = int(rerank.get("top_k"))
        except Exception:
            pass
    if "hybrid_alpha" in rerank and rerank.get("hybrid_alpha") is not None:
        try:
            hybrid_alpha = float(rerank.get("hybrid_alpha"))
        except Exception:
            hybrid_alpha = 0.0
    hybrid_alpha = max(0.0, min(float(hybrid_alpha), 1.0))
    return enabled, method, max(1, min(int(top_k), 1000)), float(hybrid_alpha)


def resolve_rerank_external_config(rerank: dict[str, Any] | None) -> dict[str, Any] | None:
    if rerank is None or not isinstance(rerank, dict):
        return None

    out: dict[str, Any] = {}

    base_url = str(rerank.get("base_url") or "").strip()
    if base_url:
        out["base_url"] = base_url

    model = str(rerank.get("model") or "").strip()
    if model:
        out["model"] = model

    api_key = str(rerank.get("api_key") or "").strip()
    if api_key:
        out["api_key"] = api_key

    timeout_seconds = rerank.get("timeout_seconds")
    if timeout_seconds is not None:
        out["timeout_seconds"] = timeout_seconds

    return out or None


def _build_status_rerank_observation(
    *,
    rerank_enabled: bool,
    rerank_method: str,
    rerank_top_k: int,
    rerank_hybrid_alpha: float,
    rerank_external: dict[str, Any] | None,
) -> dict[str, Any]:
    rerank_provider: str | None = None
    rerank_model: str | None = None
    rerank_method_effective: str | None = None
    if rerank_enabled:
        rerank_method_effective = str(rerank_method or "").strip() or None
        if rerank_method_effective == "external_rerank_api":
            rerank_provider = "external_rerank_api"
            rerank_model_raw = (rerank_external or {}).get("model")
            rerank_model = str(rerank_model_raw or "").strip() or None
        else:
            rerank_provider = "local"

    return build_rerank_observation(
        enabled=bool(rerank_enabled),
        applied=False,
        requested_method=rerank_method,
        method=rerank_method_effective,
        provider=rerank_provider,
        model=rerank_model,
        top_k=int(rerank_top_k),
        hybrid_alpha=float(rerank_hybrid_alpha),
        hybrid_applied=False,
        after_rerank=[],
        reason="disabled" if not rerank_enabled else "status_only",
        error_type=None,
        before=[],
        after=[],
        timing_ms=0,
        errors=[],
    )


def build_vector_status_payload(
    *,
    project_id: str,
    sources: list[VectorSource],
    enabled: bool,
    disabled_reason: str | None,
    rerank: dict[str, Any] | None,
    build_counts_fn: Callable[..., dict[str, Any]],
    prefer_pgvector_fn: Callable[[], bool],
) -> dict[str, Any]:
    rerank_enabled, rerank_method, rerank_top_k, rerank_hybrid_alpha = resolve_rerank_config(rerank)
    rerank_external = resolve_rerank_external_config(rerank)
    rerank_obs = _build_status_rerank_observation(
        rerank_enabled=rerank_enabled,
        rerank_method=rerank_method,
        rerank_top_k=rerank_top_k,
        rerank_hybrid_alpha=rerank_hybrid_alpha,
        rerank_external=rerank_external,
    )

    return {
        "enabled": bool(enabled),
        "disabled_reason": disabled_reason,
        "query_text": "",
        "filters": {"project_id": project_id, "sources": list(sources)},
        "timings_ms": {"rerank": 0},
        "candidates": [],
        "final": {"chunks": [], "text_md": "", "truncated": False},
        "dropped": [],
        "counts": build_counts_fn(candidates_total=0, returned_candidates=[], final_selected=0, dropped=[]),
        "prompt_block": {"identifier": "sys.memory.vector_rag", "role": "system", "text_md": ""},
        "backend_preferred": "pgvector" if prefer_pgvector_fn() else "chroma",
        "hybrid_enabled": bool(getattr(settings, "vector_hybrid_enabled", True)),
        "rerank": rerank_obs,
    }
