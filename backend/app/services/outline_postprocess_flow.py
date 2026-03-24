from __future__ import annotations

import logging

from app.core.errors import AppError
from app.services.generation_service import PreparedLlmCall, call_llm_and_record, with_param_overrides
from app.services.output_contracts import OutputContract, build_repair_prompt_for_task

OUTLINE_GENERATE_PARSE_REPAIR_PROVIDERS = (
    "openai",
    "openai_responses",
    "openai_compatible",
    "openai_responses_compatible",
)


def try_fix_outline_generate_parse_error(
    *,
    logger: logging.Logger,
    request_id: str,
    actor_user_id: str,
    project_id: str,
    api_key: str,
    llm_call: PreparedLlmCall,
    run_params_extra_json: dict[str, object] | None,
    contract: OutputContract,
    raw_output: str,
    data: dict[str, object],
    warnings: list[str],
    parse_error: dict[str, object] | None,
) -> tuple[dict[str, object], list[str], dict[str, object] | None]:
    if parse_error is None or llm_call.provider not in OUTLINE_GENERATE_PARSE_REPAIR_PROVIDERS:
        return data, warnings, parse_error

    try:
        repair = build_repair_prompt_for_task("outline_generate", raw_output=raw_output)
        if repair is None:
            raise AppError(code="OUTLINE_FIX_UNSUPPORTED", message="该任务不支持输出修复", status_code=400)
        fix_system, fix_user, fix_run_type = repair
        fix_call = with_param_overrides(llm_call, {"temperature": 0, "max_tokens": 1024})
        fixed = call_llm_and_record(
            logger=logger,
            request_id=request_id,
            actor_user_id=actor_user_id,
            project_id=project_id,
            chapter_id=None,
            run_type=fix_run_type,
            api_key=api_key,
            prompt_system=fix_system,
            prompt_user=fix_user,
            llm_call=fix_call,
            run_params_extra_json=run_params_extra_json,
        )
        fixed_parsed = contract.parse(fixed.text)
        fixed_data, fixed_warnings, fixed_error = fixed_parsed.data, fixed_parsed.warnings, fixed_parsed.parse_error
        if fixed_error is None and fixed_data.get("chapters"):
            fixed_data["raw_output"] = raw_output
            fixed_data["fixed_json"] = fixed_data.get("raw_json") or fixed.text
            return fixed_data, [*warnings, "json_fixed_via_llm", *fixed_warnings], None
    except AppError:
        return data, [*warnings, "outline_fix_json_failed"], parse_error

    return data, warnings, parse_error


def apply_outline_generation_result_fields(
    *,
    data: dict[str, object],
    warnings: list[str],
    parse_error: dict[str, object] | None,
    finish_reason: str | None,
    latency_ms: int | None,
    dropped_params: list[str],
    generation_run_id: str | None,
) -> dict[str, object]:
    result = dict(data)
    if warnings:
        result["warnings"] = warnings
    if parse_error is not None:
        result["parse_error"] = parse_error
    if finish_reason is not None:
        result["finish_reason"] = finish_reason
    if latency_ms is not None:
        result["latency_ms"] = latency_ms
    if dropped_params:
        result["dropped_params"] = dropped_params
    if generation_run_id is not None:
        result["generation_run_id"] = generation_run_id
    return result


def compact_outline_stream_result_data(data: dict[str, object]) -> dict[str, object]:
    result = dict(data)
    result.pop("raw_output", None)
    result.pop("raw_json", None)
    result.pop("fixed_json", None)
    return result
