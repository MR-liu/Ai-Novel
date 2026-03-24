from __future__ import annotations

import unittest

from app.core.config import settings
from app.services.vector_status_flow import (
    build_vector_status_payload,
    resolve_rerank_config,
    resolve_rerank_external_config,
)


class TestVectorStatusFlow(unittest.TestCase):
    def test_resolve_rerank_config_clamps_runtime_values(self) -> None:
        orig_enabled = getattr(settings, "vector_rerank_enabled", False)
        orig_max_candidates = getattr(settings, "vector_max_candidates", 20)
        try:
            settings.vector_rerank_enabled = False
            settings.vector_max_candidates = 20

            enabled, method, top_k, hybrid_alpha = resolve_rerank_config(
                {
                    "enabled": True,
                    "provider": "external_rerank_api",
                    "top_k": 5000,
                    "hybrid_alpha": 2.0,
                }
            )

            self.assertTrue(enabled)
            self.assertEqual(method, "external_rerank_api")
            self.assertEqual(top_k, 1000)
            self.assertEqual(hybrid_alpha, 1.0)
        finally:
            settings.vector_rerank_enabled = orig_enabled
            settings.vector_max_candidates = orig_max_candidates

    def test_resolve_rerank_external_config_ignores_empty_values(self) -> None:
        out = resolve_rerank_external_config({"base_url": " ", "model": "m1", "api_key": "", "timeout_seconds": 12})
        self.assertEqual(out, {"model": "m1", "timeout_seconds": 12})

    def test_build_vector_status_payload_uses_empty_counts_and_status_only_reason(self) -> None:
        result = build_vector_status_payload(
            project_id="p1",
            sources=["worldbook", "chapter"],
            enabled=True,
            disabled_reason=None,
            rerank={"enabled": True, "method": "external_rerank_api", "model": "rerank-mock"},
            build_counts_fn=lambda **kwargs: {"final_selected": kwargs["final_selected"], "candidates_total": kwargs["candidates_total"]},
            prefer_pgvector_fn=lambda: True,
        )

        self.assertTrue(result.get("enabled"))
        self.assertEqual((result.get("filters") or {}).get("sources"), ["worldbook", "chapter"])
        self.assertEqual((result.get("counts") or {}).get("candidates_total"), 0)
        rerank = result.get("rerank") or {}
        self.assertTrue(rerank.get("enabled"))
        self.assertEqual(rerank.get("reason"), "status_only")
        self.assertEqual(rerank.get("provider"), "external_rerank_api")
        self.assertEqual(rerank.get("model"), "rerank-mock")
        self.assertEqual(result.get("backend_preferred"), "pgvector")


if __name__ == "__main__":
    unittest.main()
