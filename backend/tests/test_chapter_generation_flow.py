from __future__ import annotations

import unittest
from types import SimpleNamespace
from unittest.mock import Mock, patch

from app.llm.messages import ChatMessage
from app.schemas.chapter_generate import ChapterGenerateRequest
from app.services.chapter_generation_flow import (
    ChapterMemoryPreparation,
    PreparedPlanPromptBundle,
    PreparedPromptBundle,
    prepare_chapter_generate_request,
)
from app.services.generation_service import PreparedLlmCall


def _make_llm_call() -> PreparedLlmCall:
    return PreparedLlmCall(
        provider="openai",
        model="gpt-test",
        base_url="https://example.invalid/v1",
        timeout_seconds=30,
        params={"temperature": 0.7},
        params_json='{"temperature":0.7}',
        extra={},
    )


class TestChapterGenerationFlow(unittest.TestCase):
    def _make_db(self) -> Mock:
        db = Mock()
        project = SimpleNamespace(id="p1", name="Project 1", genre="fantasy", logline="logline")
        settings_row = SimpleNamespace(context_optimizer_enabled=True)

        def _get(model, key):  # type: ignore[no-untyped-def]
            model_name = getattr(model, "__name__", "")
            if model_name == "Project":
                return project
            if model_name == "ProjectSettings":
                return settings_row
            return None

        db.get.side_effect = _get
        return db

    def _make_chapter(self) -> SimpleNamespace:
        return SimpleNamespace(
            id="c1",
            project_id="p1",
            outline_id="o1",
            number=2,
            title="Chapter 2",
            plan="旧计划",
            content_md="旧正文",
        )

    def _make_render_values(self) -> dict[str, object]:
        return {
            "instruction": "继续扩写",
            "user": {"instruction": "继续扩写", "requirements": None},
            "story": {"chapter_title": "Chapter 2"},
        }

    def test_prepare_chapter_generate_request_builds_chapter_prompt_bundle(self) -> None:
        db = self._make_db()
        chapter = self._make_chapter()
        llm_call = _make_llm_call()
        chapter_prompt = PreparedPromptBundle(
            prompt_system="system-prepared",
            prompt_user="user-prepared",
            prompt_messages=[ChatMessage(role="system", content="system-prepared"), ChatMessage(role="user", content="user-prepared")],
            prompt_render_log_json='{"task":"chapter_generate"}',
            render_log={"task": "chapter_generate"},
        )
        memory_preparation = ChapterMemoryPreparation(
            memory_pack={"worldbook": ["设定A"]},
            memory_injection_config={"query_text": "继续扩写"},
            memory_retrieval_log_json={"enabled": True},
        )
        mcp_cfg = SimpleNamespace(enabled=True, allowlist=["search"])
        mcp_step = SimpleNamespace(applied=True, context_md="资料A", tool_runs=[SimpleNamespace(run_id="mcp-run-1")], warnings=["tool_warn"])

        with patch("app.services.chapter_generation_flow.require_chapter_editor", return_value=chapter), patch(
            "app.services.chapter_generation_flow.resolve_task_llm_for_call",
            return_value=SimpleNamespace(llm_call=llm_call, api_key="sk-test"),
        ), patch(
            "app.services.chapter_generation_flow.build_chapter_generate_render_values",
            return_value=(self._make_render_values(), "继续扩写", None, {"style_name": "默认风格"}),
        ), patch(
            "app.services.chapter_generation_flow.prepare_chapter_memory_injection",
            return_value=memory_preparation,
        ), patch(
            "app.services.chapter_generation_flow.build_memory_run_params_extra_json",
            return_value={"memory_injection_enabled": True},
        ), patch(
            "app.services.chapter_generation_flow.build_mcp_research_config",
            return_value=mcp_cfg,
        ), patch(
            "app.services.chapter_generation_flow.run_mcp_research_step",
            return_value=mcp_step,
        ), patch(
            "app.services.chapter_generation_flow.mcp_research_params",
            return_value={"enabled": True, "tool_run_ids": ["mcp-run-1"], "warnings": ["tool_warn"]},
        ), patch(
            "app.services.chapter_generation_flow.render_chapter_prompt_bundle",
            return_value=(chapter_prompt, {"prompt_inspector": {"prompt_overridden": True}}),
        ) as render_prompt, patch(
            "app.services.chapter_generation_flow.build_plan_prompt_bundle"
        ) as build_plan_prompt:
            result = prepare_chapter_generate_request(
                db=db,
                chapter_id="c1",
                body=ChapterGenerateRequest(mode="replace", instruction="继续扩写", memory_injection_enabled=True),
                user_id="u1",
                request_id="rid-1",
                logger=Mock(),
                x_llm_provider=None,
                x_llm_api_key=None,
            )

        self.assertIs(result.chapter_prompt, chapter_prompt)
        self.assertIsNone(result.plan_prompt)
        self.assertEqual(result.memory_pack, {"worldbook": ["设定A"]})
        self.assertEqual(result.run_params_extra_json.get("prompt_inspector"), {"prompt_overridden": True})
        self.assertEqual(result.run_params_extra_json.get("mcp_research", {}).get("tool_run_ids"), ["mcp-run-1"])
        self.assertEqual(result.render_values.get("mcp_research"), "资料A")
        render_prompt.assert_called_once()
        build_plan_prompt.assert_not_called()

    def test_prepare_chapter_generate_request_builds_plan_prompt_when_plan_first_enabled(self) -> None:
        db = self._make_db()
        chapter = self._make_chapter()
        llm_call = _make_llm_call()
        plan_prompt = PreparedPlanPromptBundle(
            api_key="sk-plan",
            llm_call=llm_call,
            prompt_system="plan-system",
            prompt_user="plan-user",
            prompt_messages=[ChatMessage(role="system", content="plan-system"), ChatMessage(role="user", content="plan-user")],
            prompt_render_log_json='{"task":"plan_chapter"}',
        )

        with patch("app.services.chapter_generation_flow.require_chapter_editor", return_value=chapter), patch(
            "app.services.chapter_generation_flow.resolve_task_llm_for_call",
            return_value=SimpleNamespace(llm_call=llm_call, api_key="sk-test"),
        ), patch(
            "app.services.chapter_generation_flow.build_chapter_generate_render_values",
            return_value=(self._make_render_values(), "继续扩写", None, {"style_name": "默认风格"}),
        ), patch(
            "app.services.chapter_generation_flow.prepare_chapter_memory_injection",
            return_value=ChapterMemoryPreparation(memory_pack=None, memory_injection_config=None, memory_retrieval_log_json=None),
        ), patch(
            "app.services.chapter_generation_flow.build_memory_run_params_extra_json",
            return_value={"memory_injection_enabled": False},
        ), patch(
            "app.services.chapter_generation_flow.build_mcp_research_config",
            return_value=SimpleNamespace(enabled=False, allowlist=[]),
        ), patch(
            "app.services.chapter_generation_flow.run_mcp_research_step",
            return_value=SimpleNamespace(applied=False, context_md="", tool_runs=[], warnings=[]),
        ), patch(
            "app.services.chapter_generation_flow.build_plan_prompt_bundle",
            return_value=plan_prompt,
        ) as build_plan_prompt, patch(
            "app.services.chapter_generation_flow.render_chapter_prompt_bundle"
        ) as render_prompt:
            result = prepare_chapter_generate_request(
                db=db,
                chapter_id="c1",
                body=ChapterGenerateRequest(mode="replace", instruction="继续扩写", plan_first=True),
                user_id="u1",
                request_id="rid-1",
                logger=Mock(),
                x_llm_provider=None,
                x_llm_api_key=None,
            )

        self.assertIsNone(result.chapter_prompt)
        self.assertIs(result.plan_prompt, plan_prompt)
        self.assertEqual(result.run_params_extra_json, {"memory_injection_enabled": False})
        build_plan_prompt.assert_called_once()
        render_prompt.assert_not_called()


if __name__ == "__main__":
    unittest.main()
