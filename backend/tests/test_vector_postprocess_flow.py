from __future__ import annotations

import unittest

from app.core.config import settings
from app.services.vector_postprocess_flow import (
    build_vector_budget_observability,
    build_vector_query_counts,
    parse_vector_source_order,
    parse_vector_source_weights,
)


class TestVectorPostprocessFlow(unittest.TestCase):
    def test_parse_vector_source_order_dedupes_and_filters(self) -> None:
        orig = getattr(settings, "vector_source_order", "")
        try:
            settings.vector_source_order = "chapter, worldbook, invalid, chapter"
            out = parse_vector_source_order(all_sources=["worldbook", "outline", "chapter", "story_memory"])
            self.assertEqual(out, ["chapter", "worldbook"])
        finally:
            settings.vector_source_order = orig

    def test_parse_vector_source_weights_ignores_invalid_entries(self) -> None:
        orig = getattr(settings, "vector_source_weights_json", "")
        try:
            settings.vector_source_weights_json = '{"chapter": 2, "outline": 0, "invalid": 3, "worldbook": "x"}'
            out = parse_vector_source_weights(all_sources=["worldbook", "outline", "chapter", "story_memory"])
            self.assertEqual(out, {"chapter": 2.0})
        finally:
            settings.vector_source_weights_json = orig

    def test_build_vector_query_counts_aggregates_unique_sources_and_drop_reasons(self) -> None:
        counts = build_vector_query_counts(
            candidates_total=4,
            returned_candidates=[
                {"metadata": {"source": "chapter", "source_id": "c1"}},
                {"metadata": {"source": "chapter", "source_id": "c1"}},
                {"metadata": {"source": "outline", "source_id": "o1"}},
            ],
            final_selected=2,
            dropped=[{"reason": "budget"}, {"reason": "budget"}, {"reason": "duplicate_chunk"}],
            candidate_key_fn=lambda candidate: (
                str((candidate.get("metadata") or {}).get("source") or ""),
                str((candidate.get("metadata") or {}).get("source_id") or ""),
            ),
        )

        self.assertEqual(counts["unique_sources"], 2)
        self.assertEqual(counts["dropped_by_reason"], {"budget": 2, "duplicate_chunk": 1})

    def test_build_vector_budget_observability_preserves_limits(self) -> None:
        obs = build_vector_budget_observability(
            top_k=20,
            max_chunks=6,
            per_source_max_chunks=1,
            char_limit=6000,
            dropped=[{"id": "c1", "reason": "budget"}],
            reason_explain={"budget": "budget hit"},
        )

        limits = obs.get("limits") or {}
        self.assertEqual(limits.get("max_candidates"), 20)
        self.assertEqual(limits.get("final_max_chunks"), 6)
        self.assertEqual(limits.get("per_source_max_chunks"), 1)


if __name__ == "__main__":
    unittest.main()
