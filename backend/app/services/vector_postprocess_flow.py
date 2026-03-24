from __future__ import annotations

import json
import re
from typing import Any, Callable

from app.core.config import settings
from app.services.context_budget_observability import build_budget_observability


def parse_vector_source_order(*, all_sources: list[str]) -> list[str] | None:
    raw = str(getattr(settings, "vector_source_order", "") or "").strip()
    if not raw:
        return None
    parts = [part.strip().lower() for part in re.split(r"[\s,|;]+", raw) if part.strip()]
    out: list[str] = []
    for part in parts:
        if part not in all_sources:
            continue
        if part in out:
            continue
        out.append(part)
    return out or None


def parse_vector_source_weights(*, all_sources: list[str]) -> dict[str, float] | None:
    raw = str(getattr(settings, "vector_source_weights_json", "") or "").strip()
    if not raw:
        return None
    try:
        value = json.loads(raw)
    except Exception:
        return None
    if not isinstance(value, dict):
        return None
    out: dict[str, float] = {}
    for key, raw_weight in value.items():
        source = str(key or "").strip().lower()
        if source not in all_sources:
            continue
        try:
            weight = float(raw_weight)
        except Exception:
            continue
        if weight <= 0:
            continue
        out[source] = weight
    return out or None


def super_sort_final_chunks(
    final_chunks: list[dict[str, Any]],
    *,
    all_sources: list[str],
    super_sort: dict[str, Any] | None = None,
) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    before_ids = [str(chunk.get("id") or "") for chunk in final_chunks if isinstance(chunk, dict)]

    requested = super_sort if isinstance(super_sort, dict) else None
    override_enabled: bool | None = None
    override_order: list[str] | None = None
    override_weights: dict[str, float] | None = None

    if requested is not None:
        if "enabled" in requested:
            override_enabled = bool(requested.get("enabled"))

        raw_order = requested.get("source_order")
        if isinstance(raw_order, str):
            parts = [part.strip().lower() for part in re.split(r"[\s,|;]+", raw_order) if part.strip()]
        elif isinstance(raw_order, list):
            parts = [str(part or "").strip().lower() for part in raw_order if str(part or "").strip()]
        else:
            parts = []
        if parts:
            order: list[str] = []
            for part in parts:
                if part not in all_sources:
                    continue
                if part in order:
                    continue
                order.append(part)
            override_order = order or None

        raw_weights = requested.get("source_weights")
        if isinstance(raw_weights, dict):
            weights: dict[str, float] = {}
            for key, raw_weight in raw_weights.items():
                source = str(key or "").strip().lower()
                if source not in all_sources:
                    continue
                try:
                    weight = float(raw_weight)
                except Exception:
                    continue
                if weight <= 0:
                    continue
                weights[source] = weight
            override_weights = weights or None

    order_cfg = override_order if override_order is not None else parse_vector_source_order(all_sources=all_sources)
    weights_cfg = override_weights if override_weights is not None else parse_vector_source_weights(all_sources=all_sources)
    enabled = bool(order_cfg or weights_cfg)
    if override_enabled is False:
        enabled = False

    base_obs: dict[str, Any] = {
        "enabled": bool(enabled),
        "applied": False,
        "reason": "disabled" if not enabled else None,
        "override_enabled": override_enabled,
        "requested": requested,
        "source_order": order_cfg,
        "source_weights": weights_cfg,
        "before": before_ids,
        "after": list(before_ids),
    }
    if not enabled or len(final_chunks) <= 1:
        if enabled:
            base_obs["reason"] = "noop"
        return list(final_chunks), base_obs

    if order_cfg:
        order = list(order_cfg)
        for source in all_sources:
            if source not in order:
                order.append(source)
    else:
        weights_for_sort = weights_cfg or {}
        order = sorted(all_sources, key=lambda source: (-float(weights_for_sort.get(source, 1.0)), source))

    weights_for_all = {source: float((weights_cfg or {}).get(source, 1.0)) for source in all_sources}
    order_index = {source: idx for idx, source in enumerate(order)}

    grouped: dict[str, list[dict[str, Any]]] = {}
    for chunk in final_chunks:
        if not isinstance(chunk, dict):
            continue
        meta = chunk.get("metadata") if isinstance(chunk.get("metadata"), dict) else {}
        source = str(meta.get("source") or "")
        grouped.setdefault(source, []).append(chunk)

    def _natural_key(source: str, chunk: dict[str, Any]) -> tuple[Any, ...]:
        meta = chunk.get("metadata") if isinstance(chunk.get("metadata"), dict) else {}
        try:
            chunk_index = int(meta.get("chunk_index") or 0)
        except Exception:
            chunk_index = 0
        source_id = str(meta.get("source_id") or "")
        cid = str(chunk.get("id") or "")
        if source == "chapter":
            try:
                chapter_number = int(meta.get("chapter_number") or 0)
            except Exception:
                chapter_number = 0
            return (chapter_number, chunk_index, source_id, cid)
        title = str(meta.get("title") or "")
        return (title, chunk_index, source_id, cid)

    for source, items in grouped.items():
        items.sort(key=lambda chunk: _natural_key(source, chunk))

    pos = {source: 0 for source in grouped.keys()}
    taken = {source: 0 for source in grouped.keys()}
    out: list[dict[str, Any]] = []
    while True:
        available = [source for source in grouped.keys() if pos.get(source, 0) < len(grouped[source])]
        if not available:
            break

        def _pick_key(source: str) -> tuple[float, int, str]:
            weight = float(weights_for_all.get(source, 1.0))
            if weight <= 0:
                weight = 1.0
            ratio = float(taken.get(source, 0)) / weight
            return (ratio, int(order_index.get(source, 999)), source)

        selected_source = min(available, key=_pick_key)
        out.append(grouped[selected_source][pos[selected_source]])
        pos[selected_source] = int(pos.get(selected_source, 0)) + 1
        taken[selected_source] = int(taken.get(selected_source, 0)) + 1

    after_ids = [str(chunk.get("id") or "") for chunk in out if isinstance(chunk, dict)]
    obs = dict(base_obs)
    obs.update(
        {
            "applied": after_ids != before_ids,
            "reason": "ok",
            "source_order_effective": order,
            "source_weights_effective": weights_for_all,
            "after": after_ids,
            "by_source": {source: len(grouped[source]) for source in sorted(grouped.keys())},
        }
    )
    return out, obs


def build_vector_query_counts(
    *,
    candidates_total: int,
    returned_candidates: list[dict[str, Any]],
    final_selected: int,
    dropped: list[dict[str, Any]],
    candidate_key_fn: Callable[[dict[str, Any]], tuple[str, str]],
) -> dict[str, Any]:
    unique_keys: set[tuple[str, str]] = set()
    for candidate in returned_candidates:
        if isinstance(candidate, dict):
            unique_keys.add(candidate_key_fn(candidate))

    dropped_by_reason: dict[str, int] = {}
    for item in dropped:
        if not isinstance(item, dict):
            continue
        reason = str(item.get("reason") or "")
        if not reason:
            continue
        dropped_by_reason[reason] = dropped_by_reason.get(reason, 0) + 1

    return {
        "candidates_total": int(candidates_total),
        "candidates_returned": int(len(returned_candidates)),
        "unique_sources": int(len(unique_keys)),
        "final_selected": int(final_selected),
        "dropped_total": int(len(dropped)),
        "dropped_by_reason": dropped_by_reason,
    }


def build_vector_budget_observability(
    *,
    top_k: int,
    max_chunks: int,
    per_source_max_chunks: int,
    char_limit: int,
    dropped: list[dict[str, Any]],
    reason_explain: dict[str, str],
) -> dict[str, Any]:
    return build_budget_observability(
        module="vector",
        limits={
            "max_candidates": int(top_k),
            "final_max_chunks": int(max_chunks),
            "per_source_max_chunks": int(per_source_max_chunks),
            "final_char_limit": int(char_limit),
        },
        dropped=dropped,
        reason_explain=reason_explain,
    )
