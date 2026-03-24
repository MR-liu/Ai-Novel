from __future__ import annotations

import time
from dataclasses import dataclass
from typing import Any, Callable


@dataclass(frozen=True, slots=True)
class FinalizedVectorQueryResult:
    trimmed_candidates: list[dict[str, Any]]
    final_chunks: list[dict[str, Any]]
    dropped: list[dict[str, Any]]
    super_sort_obs: dict[str, Any]
    text_md: str
    truncated: bool
    timings_ms: dict[str, int]
    counts: dict[str, Any]
    budget_observability: dict[str, Any]


def build_rerank_observation(
    *,
    enabled: bool,
    applied: bool,
    requested_method: str,
    method: str | None,
    provider: str | None,
    model: str | None,
    top_k: int,
    hybrid_alpha: float,
    hybrid_applied: bool,
    after_rerank: list[str],
    reason: str,
    error_type: str | None,
    before: list[str],
    after: list[str],
    timing_ms: int,
    errors: list[str],
) -> dict[str, Any]:
    return {
        "enabled": bool(enabled),
        "applied": bool(applied),
        "requested_method": requested_method,
        "method": method,
        "provider": provider,
        "model": model,
        "top_k": int(top_k),
        "hybrid_alpha": float(hybrid_alpha),
        "hybrid_applied": bool(hybrid_applied),
        "after_rerank": list(after_rerank),
        "reason": reason,
        "error_type": error_type,
        "before": list(before),
        "after": list(after),
        "timing_ms": int(timing_ms),
        "errors": list(errors),
    }


def apply_vector_rerank(
    *,
    query_text: str,
    candidates: list[dict[str, Any]],
    rerank_enabled: bool,
    rerank_method: str,
    rerank_top_k: int,
    rerank_hybrid_alpha: float,
    rerank_external: dict[str, Any] | None,
    rerank_candidates_fn: Callable[..., tuple[list[dict[str, Any]], dict[str, Any]]],
) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    trimmed_candidates = list(candidates)
    if not rerank_enabled:
        before_ids = [str(c.get("id") or "") for c in trimmed_candidates if isinstance(c, dict)]
        return trimmed_candidates, build_rerank_observation(
            enabled=False,
            applied=False,
            requested_method=rerank_method,
            method=None,
            provider=None,
            model=None,
            top_k=rerank_top_k,
            hybrid_alpha=rerank_hybrid_alpha,
            hybrid_applied=False,
            after_rerank=before_ids,
            reason="disabled",
            error_type=None,
            before=before_ids,
            after=before_ids,
            timing_ms=0,
            errors=[],
        )
    if not trimmed_candidates:
        return trimmed_candidates, build_rerank_observation(
            enabled=True,
            applied=False,
            requested_method=rerank_method,
            method=None,
            provider=None,
            model=None,
            top_k=rerank_top_k,
            hybrid_alpha=rerank_hybrid_alpha,
            hybrid_applied=False,
            after_rerank=[],
            reason="empty_candidates",
            error_type=None,
            before=[],
            after=[],
            timing_ms=0,
            errors=[],
        )
    return rerank_candidates_fn(
        query_text=query_text,
        candidates=trimmed_candidates,
        method=rerank_method,
        top_k=rerank_top_k,
        hybrid_alpha=rerank_hybrid_alpha,
        external=rerank_external,
    )


def finalize_vector_query_candidates(
    *,
    candidates_total: int,
    candidates: list[dict[str, Any]],
    top_k: int,
    final_max_chunks: int,
    per_source_max_chunks: int,
    final_char_limit: int,
    super_sort: dict[str, Any] | None,
    rerank_obs: dict[str, Any],
    embed_ms: int,
    query_ms: int,
    candidate_key_fn: Callable[[dict[str, Any]], tuple[str, str]],
    candidate_chunk_key_fn: Callable[[dict[str, Any]], tuple[str, str, int]],
    super_sort_fn: Callable[[list[dict[str, Any]], dict[str, Any] | None], tuple[list[dict[str, Any]], dict[str, Any]]],
    format_text_fn: Callable[[list[dict[str, Any]], int], tuple[str, bool]],
    build_counts_fn: Callable[[int, list[dict[str, Any]], int, list[dict[str, Any]]], dict[str, Any]],
    build_budget_observability_fn: Callable[[int, int, int, int, list[dict[str, Any]]], dict[str, Any]],
) -> FinalizedVectorQueryResult:
    trimmed_candidates = list(candidates[: max(0, int(top_k))])
    dropped: list[dict[str, Any]] = []
    final_chunks: list[dict[str, Any]] = []
    seen_chunk_keys: set[tuple[str, str, int]] = set()
    selected_by_source: dict[tuple[str, str], int] = {}
    max_chunks = max(1, min(int(final_max_chunks), 1000))
    per_source_limit = max(1, min(int(per_source_max_chunks), 1000))
    processed = 0

    for candidate in trimmed_candidates:
        processed += 1
        source_key = candidate_key_fn(candidate)
        chunk_key = candidate_chunk_key_fn(candidate)
        if chunk_key in seen_chunk_keys:
            dropped.append({"id": candidate.get("id"), "reason": "duplicate_chunk"})
            continue
        seen_chunk_keys.add(chunk_key)
        if selected_by_source.get(source_key, 0) >= per_source_limit:
            dropped.append({"id": candidate.get("id"), "reason": "per_source_budget"})
            continue
        final_chunks.append(candidate)
        selected_by_source[source_key] = selected_by_source.get(source_key, 0) + 1
        if len(final_chunks) >= max_chunks:
            break

    if len(final_chunks) >= max_chunks:
        for candidate in trimmed_candidates[processed:]:
            dropped.append({"id": candidate.get("id"), "reason": "budget"})

    post_start = time.perf_counter()
    final_chunks, super_sort_obs = super_sort_fn(final_chunks, super_sort)
    text_md, truncated = format_text_fn(final_chunks, int(final_char_limit))
    post_ms = int((time.perf_counter() - post_start) * 1000)

    return FinalizedVectorQueryResult(
        trimmed_candidates=trimmed_candidates,
        final_chunks=final_chunks,
        dropped=dropped,
        super_sort_obs=super_sort_obs,
        text_md=text_md,
        truncated=truncated,
        timings_ms={
            "embed": int(embed_ms),
            "query": int(query_ms),
            "post": int(post_ms),
            "rerank": int(rerank_obs.get("timing_ms") or 0),
        },
        counts=build_counts_fn(candidates_total, trimmed_candidates, len(final_chunks), dropped),
        budget_observability=build_budget_observability_fn(
            int(top_k),
            int(max_chunks),
            int(per_source_limit),
            int(final_char_limit),
            dropped,
        ),
    )
