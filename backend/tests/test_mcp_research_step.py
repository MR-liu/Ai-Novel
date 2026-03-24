from __future__ import annotations

import json
import logging
import unittest
from concurrent.futures import TimeoutError as FuturesTimeoutError
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from app.services.generation_pipeline import run_mcp_research_step
from app.services.mcp.service import McpResearchConfig, McpToolCall, list_mcp_tools, run_mcp_tool_call_and_record


class TestMcpResearchStep(unittest.TestCase):
    def _mock_session(self) -> MagicMock:
        db = MagicMock()
        db.close = MagicMock()
        db.get = MagicMock(return_value=None)
        return db

    def test_lists_formal_tools(self) -> None:
        names = [tool.name for tool in list_mcp_tools()]
        self.assertEqual(names, ["project.search", "project.vector_query", "project.graph_query"])

    def test_disabled_noop(self) -> None:
        cfg = McpResearchConfig(enabled=False, allowlist=[], calls=[])
        with patch("app.services.mcp.service.write_generation_run") as write_mock:
            res = run_mcp_research_step(
                logger=logging.getLogger("test"),
                request_id="rid",
                actor_user_id="u",
                project_id="p",
                chapter_id=None,
                config=cfg,
            )
            self.assertFalse(res.applied)
            self.assertEqual(res.context_md, "")
            self.assertEqual(res.tool_runs, [])
            self.assertEqual(res.warnings, [])
            self.assertFalse(write_mock.called)

    def test_allowlist_required(self) -> None:
        cfg = McpResearchConfig(enabled=True, allowlist=[], calls=[McpToolCall(tool_name="project.search", args={"q": "hi"})])
        with patch("app.services.mcp.service.write_generation_run") as write_mock:
            res = run_mcp_research_step(
                logger=logging.getLogger("test"),
                request_id="rid",
                actor_user_id="u",
                project_id="p",
                chapter_id=None,
                config=cfg,
            )
            self.assertFalse(res.applied)
            self.assertEqual(res.tool_runs, [])
            self.assertIn("mcp_allowlist_required", res.warnings)
            self.assertFalse(write_mock.called)

    def test_project_search_tool_formats_results_and_redacts(self) -> None:
        secret = "sk-test-SECRET1234"
        db = self._mock_session()
        search_out = {
            "items": [
                {
                    "source_type": "chapter",
                    "source_id": "c1",
                    "title": "第 1 章",
                    "snippet": f"命中片段 {secret}",
                    "jump_url": "/projects/p1/writing?chapterId=c1",
                }
            ],
            "mode": "fts",
        }
        with (
            patch("app.services.mcp.service.SessionLocal", return_value=db),
            patch("app.services.mcp.service.require_project_viewer"),
            patch("app.services.mcp.service.query_project_search", return_value=search_out),
            patch("app.services.mcp.service.write_generation_run", return_value="run_search") as write_mock,
        ):
            res = run_mcp_tool_call_and_record(
                request_id="rid",
                actor_user_id="u1",
                project_id="p1",
                chapter_id="c1",
                tool_name="project.search",
                args={"q": "秘密", "limit": 5},
                allowlist=["project.search"],
                purpose="research",
            )

        self.assertTrue(res.ok)
        self.assertEqual(res.run_id, "run_search")
        self.assertIn("[chapter] 第 1 章", res.output_text)
        self.assertIn("jump:", res.output_text)
        self.assertNotIn(secret, res.output_text)
        self.assertIn("sk-***", res.output_text)
        self.assertTrue(write_mock.called)
        params = json.loads(write_mock.call_args.kwargs["params_json"])
        self.assertEqual(params["tool_name"], "project.search")
        self.assertEqual(params["purpose"], "research")

    def test_project_vector_query_tool_formats_prompt_block(self) -> None:
        db = self._mock_session()
        kb_rows = [SimpleNamespace(kb_id="default", weight=1.0, order_index=0, priority_group="normal")]
        vector_out = {
            "enabled": True,
            "final": {"text_md": "1. 世界书命中\n2. 大纲命中"},
        }
        with (
            patch("app.services.mcp.service.SessionLocal", return_value=db),
            patch("app.services.mcp.service.require_project_viewer"),
            patch("app.services.mcp.service.vector_embedding_overrides", return_value={}),
            patch("app.services.mcp.service.vector_rerank_overrides", return_value={}),
            patch("app.services.mcp.service.resolve_vector_query_kbs", return_value=kb_rows),
            patch("app.services.mcp.service.parse_query_preprocessing_config", return_value=None),
            patch("app.services.mcp.service.normalize_query_text", return_value=("归一化 query", {"enabled": False})),
            patch("app.services.mcp.service.query_project", return_value=vector_out),
            patch("app.services.mcp.service.write_generation_run", return_value="run_vector"),
        ):
            res = run_mcp_tool_call_and_record(
                request_id="rid",
                actor_user_id="u1",
                project_id="p1",
                chapter_id=None,
                tool_name="project.vector_query",
                args={"query_text": "原始 query"},
                allowlist=["project.vector_query"],
            )

        self.assertTrue(res.ok)
        self.assertIn("Query: 归一化 query", res.output_text)
        self.assertIn("世界书命中", res.output_text)

    def test_project_graph_query_tool_formats_prompt_block(self) -> None:
        db = self._mock_session()
        graph_out = {
            "enabled": True,
            "prompt_block": {"text_md": "实体：苍穹城\n关系：苍穹城 -> 镜海议会"},
        }
        with (
            patch("app.services.mcp.service.SessionLocal", return_value=db),
            patch("app.services.mcp.service.require_project_viewer"),
            patch("app.services.mcp.service.parse_query_preprocessing_config", return_value=None),
            patch("app.services.mcp.service.normalize_query_text", return_value=("苍穹城", {"enabled": False})),
            patch("app.services.mcp.service.query_graph_context", return_value=graph_out),
            patch("app.services.mcp.service.write_generation_run", return_value="run_graph"),
        ):
            res = run_mcp_tool_call_and_record(
                request_id="rid",
                actor_user_id="u1",
                project_id="p1",
                chapter_id=None,
                tool_name="project.graph_query",
                args={"query_text": "苍穹城"},
                allowlist=["project.graph_query"],
            )

        self.assertTrue(res.ok)
        self.assertIn("关系：苍穹城 -> 镜海议会", res.output_text)

    def test_timeout_is_recorded(self) -> None:
        with (
            patch("app.services.mcp.service._run_with_timeout", side_effect=FuturesTimeoutError),
            patch("app.services.mcp.service.write_generation_run", return_value="run_timeout") as write_mock,
        ):
            res = run_mcp_tool_call_and_record(
                request_id="rid",
                actor_user_id="u1",
                project_id="p1",
                chapter_id=None,
                tool_name="project.search",
                args={"q": "超时"},
                allowlist=["project.search"],
                timeout_seconds=0.1,
            )

        self.assertFalse(res.ok)
        self.assertEqual(res.error_code, "TOOL_TIMEOUT")
        self.assertEqual(write_mock.call_args.kwargs["run_type"], "mcp_tool")
        self.assertIsNotNone(write_mock.call_args.kwargs["error_json"])

    def test_output_truncation_is_recorded(self) -> None:
        db = self._mock_session()
        search_out = {
            "items": [
                {
                    "source_type": "chapter",
                    "source_id": "c1",
                    "title": "第 1 章",
                    "snippet": "A" * 300,
                    "jump_url": "/projects/p1/writing?chapterId=c1",
                }
            ],
            "mode": "fts",
        }
        with (
            patch("app.services.mcp.service.SessionLocal", return_value=db),
            patch("app.services.mcp.service.require_project_viewer"),
            patch("app.services.mcp.service.query_project_search", return_value=search_out),
            patch("app.services.mcp.service.write_generation_run", return_value="run_truncated"),
        ):
            res = run_mcp_tool_call_and_record(
                request_id="rid",
                actor_user_id="u1",
                project_id="p1",
                chapter_id=None,
                tool_name="project.search",
                args={"q": "长文本"},
                allowlist=["project.search"],
                max_output_chars=80,
            )

        self.assertTrue(res.ok)
        self.assertTrue(res.truncated)
        self.assertIn("...[truncated]", res.output_text)


if __name__ == "__main__":
    unittest.main()
