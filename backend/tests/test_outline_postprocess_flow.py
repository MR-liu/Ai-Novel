from __future__ import annotations

import logging
import unittest
from unittest.mock import patch

from app.core.errors import AppError
from app.services.generation_service import PreparedLlmCall, RecordedLlmResult
from app.services.outline_postprocess_flow import (
    apply_outline_generation_result_fields,
    compact_outline_stream_result_data,
    try_fix_outline_generate_parse_error,
)
from app.services.output_contracts import OutputParseResult


class _FakeOutlineContract:
    def __init__(self, parsed: OutputParseResult) -> None:
        self._parsed = parsed
        self.calls: list[tuple[str, str | None]] = []

    def parse(self, text: str, *, finish_reason: str | None = None) -> OutputParseResult:
        self.calls.append((text, finish_reason))
        return self._parsed


class TestOutlinePostprocessFlow(unittest.TestCase):
    def setUp(self) -> None:
        self.logger = logging.getLogger("test-outline-postprocess")
        self.llm_call = PreparedLlmCall(
            provider="openai",
            model="gpt-test",
            base_url="",
            timeout_seconds=30,
            params={"temperature": 0.7, "max_tokens": 2048},
            params_json='{"temperature":0.7,"max_tokens":2048}',
            extra={},
        )

    def test_try_fix_outline_generate_parse_error_repairs_with_llm(self) -> None:
        contract = _FakeOutlineContract(
            OutputParseResult(
                data={
                    "outline_md": "# fixed",
                    "chapters": [{"number": 1, "title": "开篇", "beats": ["开始"]}],
                    "raw_json": '{"chapters":[{"number":1}]}',
                },
                warnings=["repair_warning"],
                parse_error=None,
            )
        )

        with patch(
            "app.services.outline_postprocess_flow.build_repair_prompt_for_task",
            return_value=("fix-system", "fix-user", "outline_fix_json"),
        ), patch(
            "app.services.outline_postprocess_flow.call_llm_and_record",
            return_value=RecordedLlmResult(
                text='{"chapters":[{"number":1}]}',
                finish_reason=None,
                latency_ms=12,
                dropped_params=[],
                run_id="run-fix",
            ),
        ):
            data, warnings, parse_error = try_fix_outline_generate_parse_error(
                logger=self.logger,
                request_id="rid-test",
                actor_user_id="u1",
                project_id="p1",
                api_key="sk-test",
                llm_call=self.llm_call,
                run_params_extra_json={"trace": "yes"},
                contract=contract,
                raw_output="broken json",
                data={"outline_md": "", "chapters": [], "raw_output": "broken json"},
                warnings=["parse_failed"],
                parse_error={"code": "OUTLINE_PARSE_ERROR", "message": "bad json"},
            )

        self.assertIsNone(parse_error)
        self.assertEqual(warnings, ["parse_failed", "json_fixed_via_llm", "repair_warning"])
        self.assertEqual(contract.calls, [('{"chapters":[{"number":1}]}', None)])
        self.assertEqual(data.get("raw_output"), "broken json")
        self.assertEqual(data.get("fixed_json"), '{"chapters":[{"number":1}]}')

    def test_try_fix_outline_generate_parse_error_appends_warning_on_fix_failure(self) -> None:
        contract = _FakeOutlineContract(
            OutputParseResult(
                data={"outline_md": "", "chapters": []},
                warnings=[],
                parse_error={"code": "OUTLINE_PARSE_ERROR", "message": "bad json"},
            )
        )
        original_data = {"outline_md": "", "chapters": [], "raw_output": "broken json"}
        original_warnings = ["parse_failed"]
        original_error = {"code": "OUTLINE_PARSE_ERROR", "message": "bad json"}

        with patch(
            "app.services.outline_postprocess_flow.build_repair_prompt_for_task",
            return_value=("fix-system", "fix-user", "outline_fix_json"),
        ), patch(
            "app.services.outline_postprocess_flow.call_llm_and_record",
            side_effect=AppError(code="LLM_ERROR", message="fix failed", status_code=502),
        ):
            data, warnings, parse_error = try_fix_outline_generate_parse_error(
                logger=self.logger,
                request_id="rid-test",
                actor_user_id="u1",
                project_id="p1",
                api_key="sk-test",
                llm_call=self.llm_call,
                run_params_extra_json=None,
                contract=contract,
                raw_output="broken json",
                data=original_data,
                warnings=original_warnings,
                parse_error=original_error,
            )

        self.assertIs(data, original_data)
        self.assertEqual(warnings, ["parse_failed", "outline_fix_json_failed"])
        self.assertEqual(parse_error, original_error)

    def test_apply_outline_generation_result_fields_and_compact_stream_payload(self) -> None:
        data = {
            "outline_md": "# outline",
            "chapters": [{"number": 1}],
            "raw_output": "raw text",
            "raw_json": '{"chapters":[{"number":1}]}',
            "fixed_json": '{"chapters":[{"number":1}]}',
        }

        result = apply_outline_generation_result_fields(
            data=data,
            warnings=["w1"],
            parse_error={"code": "OUTLINE_PARSE_ERROR", "message": "bad json"},
            finish_reason="length",
            latency_ms=321,
            dropped_params=["top_p"],
            generation_run_id="run-outline",
        )

        self.assertEqual(result.get("warnings"), ["w1"])
        self.assertEqual((result.get("parse_error") or {}).get("code"), "OUTLINE_PARSE_ERROR")
        self.assertEqual(result.get("finish_reason"), "length")
        self.assertEqual(result.get("latency_ms"), 321)
        self.assertEqual(result.get("dropped_params"), ["top_p"])
        self.assertEqual(result.get("generation_run_id"), "run-outline")

        compacted = compact_outline_stream_result_data(result)
        self.assertNotIn("raw_output", compacted)
        self.assertNotIn("raw_json", compacted)
        self.assertNotIn("fixed_json", compacted)
        self.assertEqual(compacted.get("generation_run_id"), "run-outline")


if __name__ == "__main__":
    unittest.main()
