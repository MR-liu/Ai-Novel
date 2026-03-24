from __future__ import annotations

import json
import unittest
from types import SimpleNamespace
from unittest.mock import patch

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from starlette.testclient import TestClient

from app.api.routes import chapters as chapters_routes
from app.core.errors import AppError
from app.llm.messages import ChatMessage
from app.main import app_error_handler, validation_error_handler
from app.services.chapter_generation_flow import PreparedPromptBundle, PreparedChapterGenerateRequest
from app.services.generation_service import PreparedLlmCall


class _DummySession:
    def close(self) -> None:
        return None


def _make_test_app() -> FastAPI:
    app = FastAPI()

    @app.middleware("http")
    async def _test_user_middleware(request: Request, call_next):  # type: ignore[no-untyped-def]
        request.state.request_id = "rid-test"
        user_id = request.headers.get("X-Test-User")
        request.state.user_id = user_id
        request.state.authenticated_user_id = user_id
        request.state.session_expire_at = None
        request.state.auth_source = "test"
        return await call_next(request)

    app.add_exception_handler(AppError, app_error_handler)
    app.add_exception_handler(RequestValidationError, validation_error_handler)
    app.include_router(chapters_routes.router, prefix="/api")
    return app


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


def _make_prepared_request() -> PreparedChapterGenerateRequest:
    return PreparedChapterGenerateRequest(
        chapter=SimpleNamespace(id="c1"),
        project=SimpleNamespace(id="p1"),
        settings_row=None,
        project_id="p1",
        resolved_api_key="sk-test",
        llm_call=_make_llm_call(),
        render_values={"instruction": "继续扩写", "user": {"instruction": "继续扩写"}},
        base_instruction="继续扩写",
        requirements_obj=None,
        style_resolution={"style_name": "默认风格"},
        memory_pack={"worldbook": ["设定A"]},
        memory_injection_config={"query_text": "继续扩写"},
        memory_retrieval_log_json={"enabled": True},
        run_params_extra_json={
            "prompt_inspector": {"prompt_overridden": True},
            "mcp_research": {"enabled": True, "warnings": []},
        },
        chapter_prompt=PreparedPromptBundle(
            prompt_system="system-prepared",
            prompt_user="user-prepared",
            prompt_messages=[ChatMessage(role="system", content="system-prepared"), ChatMessage(role="user", content="user-prepared")],
            prompt_render_log_json='{"task":"chapter_generate"}',
            render_log={"task": "chapter_generate"},
        ),
        plan_prompt=None,
    )


def _parse_sse_events(body: str) -> list[tuple[str, dict[str, object]]]:
    events: list[tuple[str, dict[str, object]]] = []
    for block in body.split("\n\n"):
        block = block.strip()
        if not block or block.startswith(":"):
            continue
        event_name = ""
        data_payload: dict[str, object] | None = None
        for line in block.splitlines():
            if line.startswith("event: "):
                event_name = line[len("event: ") :].strip()
            elif line.startswith("data: "):
                data_payload = json.loads(line[len("data: ") :])
        if event_name and data_payload is not None:
            events.append((event_name, data_payload))
    return events


class TestChapterGenerateEndpoints(unittest.TestCase):
    def setUp(self) -> None:
        self.app = _make_test_app()

    def test_generate_precheck_returns_shared_preparation_payload(self) -> None:
        client = TestClient(self.app)
        prepared = _make_prepared_request()

        with patch("app.api.routes.chapters.SessionLocal", side_effect=lambda: _DummySession()), patch(
            "app.api.routes.chapters.prepare_chapter_generate_request",
            return_value=prepared,
        ) as prepare_request:
            response = client.post(
                "/api/chapters/c1/generate-precheck",
                headers={"X-Test-User": "u_owner"},
                json={"mode": "replace", "instruction": "继续扩写"},
            )

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertTrue(payload.get("ok"))
        precheck = (payload.get("data") or {}).get("precheck") or {}
        self.assertEqual(precheck.get("task"), "chapter_generate")
        self.assertEqual(precheck.get("prompt_system"), "system-prepared")
        self.assertEqual(precheck.get("messages")[1]["content"], "user-prepared")
        self.assertEqual(precheck.get("style_resolution"), {"style_name": "默认风格"})
        self.assertEqual(precheck.get("memory_pack"), {"worldbook": ["设定A"]})
        self.assertTrue(precheck.get("prompt_overridden"))
        self.assertEqual(precheck.get("mcp_research"), {"enabled": True, "warnings": []})
        prepare_request.assert_called_once()

    def test_generate_stream_emits_result_event_from_prepared_context(self) -> None:
        client = TestClient(self.app)
        prepared = _make_prepared_request()
        stream_state = SimpleNamespace(finish_reason="stop", dropped_params=[], latency_ms=123)
        parser = SimpleNamespace(
            parse=lambda raw_output, finish_reason=None: SimpleNamespace(
                data={"content_md": raw_output},
                warnings=[],
                parse_error=None,
            )
        )

        with patch("app.api.routes.chapters.SessionLocal", side_effect=lambda: _DummySession()), patch(
            "app.api.routes.chapters.prepare_chapter_generate_request",
            return_value=prepared,
        ), patch(
            "app.api.routes.chapters.call_llm_stream_messages",
            return_value=(iter(["第一段", "第二段"]), stream_state),
        ), patch(
            "app.api.routes.chapters.contract_for_task",
            return_value=parser,
        ), patch(
            "app.api.routes.chapters.write_generation_run",
            return_value="run-stream-1",
        ):
            with client.stream(
                "POST",
                "/api/chapters/c1/generate-stream",
                headers={"X-Test-User": "u_owner"},
                json={"mode": "replace", "instruction": "继续扩写"},
            ) as response:
                body = "".join(response.iter_text())

        self.assertEqual(response.status_code, 200)
        events = _parse_sse_events(body)
        event_names = [name for name, _ in events]
        self.assertIn("start", event_names)
        self.assertIn("token", event_names)
        self.assertIn("result", event_names)
        self.assertIn("done", event_names)

        result_event = next(payload for name, payload in events if name == "result")
        result_data = result_event.get("data") or {}
        self.assertEqual(result_data.get("content_md"), "第一段第二段")
        self.assertEqual(result_data.get("generation_run_id"), "run-stream-1")
        self.assertEqual(result_data.get("finish_reason"), "stop")
        self.assertEqual(result_data.get("latency_ms"), 123)


if __name__ == "__main__":
    unittest.main()
