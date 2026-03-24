from __future__ import annotations

import unittest

from app.services.vector_query_flow import apply_vector_rerank, finalize_vector_query_candidates


class TestVectorQueryFlow(unittest.TestCase):
    def test_apply_vector_rerank_returns_disabled_observation_without_calling_provider(self) -> None:
        called = False

        def _rerank_provider(**kwargs):  # type: ignore[no-untyped-def]
            nonlocal called
            called = True
            return [], {}

        candidates = [
            {"id": "c1", "text": "alpha", "metadata": {}},
            {"id": "c2", "text": "beta", "metadata": {}},
        ]

        reranked, obs = apply_vector_rerank(
            query_text="dragon",
            candidates=candidates,
            rerank_enabled=False,
            rerank_method="auto",
            rerank_top_k=20,
            rerank_hybrid_alpha=0.0,
            rerank_external=None,
            rerank_candidates_fn=_rerank_provider,
        )

        self.assertFalse(called)
        self.assertEqual([c.get("id") for c in reranked], ["c1", "c2"])
        self.assertFalse(bool(obs.get("enabled")))
        self.assertEqual(obs.get("reason"), "disabled")
        self.assertEqual(obs.get("before"), ["c1", "c2"])
        self.assertEqual(obs.get("after"), ["c1", "c2"])

    def test_finalize_vector_query_candidates_enforces_duplicate_and_budget_rules(self) -> None:
        candidates = [
            {
                "id": "ch1-0",
                "text": "chapter 1 chunk 0",
                "metadata": {"source": "chapter", "source_id": "ch1", "chunk_index": 0},
            },
            {
                "id": "ch1-0-dup",
                "text": "chapter 1 chunk 0 duplicate",
                "metadata": {"source": "chapter", "source_id": "ch1", "chunk_index": 0},
            },
            {
                "id": "ch1-1",
                "text": "chapter 1 chunk 1",
                "metadata": {"source": "chapter", "source_id": "ch1", "chunk_index": 1},
            },
            {
                "id": "o1-0",
                "text": "outline chunk",
                "metadata": {"source": "outline", "source_id": "o1", "chunk_index": 0},
            },
            {
                "id": "wb1-0",
                "text": "worldbook chunk",
                "metadata": {"source": "worldbook", "source_id": "wb1", "chunk_index": 0},
            },
        ]

        finalized = finalize_vector_query_candidates(
            candidates_total=len(candidates),
            candidates=candidates,
            top_k=5,
            final_max_chunks=2,
            per_source_max_chunks=1,
            final_char_limit=1000,
            super_sort={"enabled": False},
            rerank_obs={"timing_ms": 7},
            embed_ms=11,
            query_ms=13,
            candidate_key_fn=lambda candidate: (
                str((candidate.get("metadata") or {}).get("source") or ""),
                str((candidate.get("metadata") or {}).get("source_id") or ""),
            ),
            candidate_chunk_key_fn=lambda candidate: (
                str((candidate.get("metadata") or {}).get("source") or ""),
                str((candidate.get("metadata") or {}).get("source_id") or ""),
                int((candidate.get("metadata") or {}).get("chunk_index") or 0),
            ),
            super_sort_fn=lambda chunks, super_sort: (
                list(chunks),
                {"enabled": bool((super_sort or {}).get("enabled")), "reason": "disabled"},
            ),
            format_text_fn=lambda chunks, char_limit: ("|".join(str(c.get("id") or "") for c in chunks), False),
            build_counts_fn=lambda candidates_total, returned_candidates, final_selected, dropped: {
                "candidates_total": candidates_total,
                "candidates_returned": len(returned_candidates),
                "final_selected": final_selected,
                "dropped_total": len(dropped),
            },
            build_budget_observability_fn=lambda top_k, max_chunks, per_source_max_chunks, char_limit, dropped: {
                "top_k": top_k,
                "max_chunks": max_chunks,
                "per_source_max_chunks": per_source_max_chunks,
                "char_limit": char_limit,
                "dropped_total": len(dropped),
            },
        )

        self.assertEqual([c.get("id") for c in finalized.trimmed_candidates], ["ch1-0", "ch1-0-dup", "ch1-1", "o1-0", "wb1-0"])
        self.assertEqual([c.get("id") for c in finalized.final_chunks], ["ch1-0", "o1-0"])
        self.assertEqual(
            [(item.get("id"), item.get("reason")) for item in finalized.dropped],
            [("ch1-0-dup", "duplicate_chunk"), ("ch1-1", "per_source_budget"), ("wb1-0", "budget")],
        )
        self.assertEqual(finalized.text_md, "ch1-0|o1-0")
        self.assertFalse(finalized.truncated)
        self.assertEqual(finalized.timings_ms.get("embed"), 11)
        self.assertEqual(finalized.timings_ms.get("query"), 13)
        self.assertEqual(finalized.timings_ms.get("rerank"), 7)
        self.assertEqual((finalized.counts or {}).get("final_selected"), 2)
        self.assertEqual((finalized.budget_observability or {}).get("dropped_total"), 3)


if __name__ == "__main__":
    unittest.main()
