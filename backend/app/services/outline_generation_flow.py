from __future__ import annotations

import json
from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import require_project_editor
from app.core.errors import AppError
from app.llm.capabilities import max_output_tokens_limit
from app.llm.messages import ChatMessage
from app.models.character import Character
from app.models.project_settings import ProjectSettings
from app.schemas.outline_generate import OutlineGenerateRequest
from app.services.generation_service import PreparedLlmCall, with_param_overrides
from app.services.llm_task_preset_resolver import resolve_task_llm_config
from app.services.prompt_presets import render_preset_for_task
from app.services.prompt_store import format_characters
from app.services.style_resolution_service import resolve_style_guide

OUTLINE_SEGMENT_TRIGGER_CHAPTER_COUNT = 80


@dataclass(frozen=True, slots=True)
class PreparedOutlineGeneration:
    resolved_api_key: str
    prompt_system: str
    prompt_user: str
    prompt_messages: list[ChatMessage]
    prompt_render_log_json: str
    llm_call: PreparedLlmCall
    target_chapter_count: int | None
    run_params_extra_json: dict[str, object]


def extract_target_chapter_count(requirements: dict[str, object] | None) -> int | None:
    if not isinstance(requirements, dict):
        return None
    raw = requirements.get("chapter_count")
    if raw is None or isinstance(raw, bool):
        return None
    try:
        if isinstance(raw, str):
            text = raw.strip()
            if not text:
                return None
            value = int(text)
        else:
            value = int(raw)
    except Exception:
        return None
    if value <= 0:
        return None
    return min(value, 2000)


def build_outline_generation_guidance(target_chapter_count: int | None) -> dict[str, str]:
    if not target_chapter_count:
        return {
            "chapter_count_rule": "",
            "chapter_detail_rule": "beats 每章 5~9 条，按发生顺序；每条用短句，明确“发生了什么/造成什么后果”。",
        }
    if target_chapter_count <= 20:
        detail = "beats 每章 5~9 条，按发生顺序；每条用短句，明确“发生了什么/造成什么后果”。"
    elif target_chapter_count <= 40:
        detail = "beats 每章 2~4 条，保持因果推进；每条保持短句，避免冗长。"
    elif target_chapter_count <= 80:
        detail = "beats 每章 1~2 条，仅保留关键推进；优先保证章号覆盖完整。"
    elif target_chapter_count <= 120:
        detail = "beats 每章 1~2 条，只保留主冲突与关键转折，保证节奏连续。"
    else:
        detail = "beats 每章 1 条，极简表达关键推进；若长度受限，优先保留章节覆盖与编号完整。"
    return {
        "chapter_count_rule": (
            f"chapters 必须输出 {target_chapter_count} 章，number 需完整覆盖 1..{target_chapter_count} 且不缺号。"
        ),
        "chapter_detail_rule": detail,
    }


def recommend_outline_max_tokens(
    *,
    target_chapter_count: int | None,
    provider: str,
    model: str | None,
    current_max_tokens: int | None,
) -> int | None:
    if not target_chapter_count or target_chapter_count <= 20:
        return None
    if target_chapter_count <= 40:
        wanted = 8192
    else:
        wanted = 12000

    limit = max_output_tokens_limit(provider, model)
    if isinstance(limit, int) and limit > 0:
        wanted = min(wanted, int(limit))

    if isinstance(current_max_tokens, int) and current_max_tokens >= wanted:
        return None
    return wanted if wanted > 0 else None


def should_use_outline_segmented_mode(target_chapter_count: int | None) -> bool:
    return bool(target_chapter_count and target_chapter_count >= OUTLINE_SEGMENT_TRIGGER_CHAPTER_COUNT)


def prepare_outline_generation(
    *,
    db: Session,
    project_id: str,
    body: OutlineGenerateRequest,
    user_id: str,
    request_id: str,
    x_llm_provider: str | None,
    x_llm_api_key: str | None,
) -> PreparedOutlineGeneration:
    project = require_project_editor(db, project_id=project_id, user_id=user_id)
    resolved_outline = resolve_task_llm_config(
        db,
        project=project,
        user_id=user_id,
        task_key="outline_generate",
        header_api_key=x_llm_api_key,
    )
    if resolved_outline is None:
        raise AppError(code="LLM_CONFIG_ERROR", message="请先在 Prompts 页保存 LLM 配置", status_code=400)
    if x_llm_api_key and x_llm_provider and resolved_outline.llm_call.provider != x_llm_provider:
        raise AppError(code="LLM_CONFIG_ERROR", message="当前任务 provider 与请求头不一致，请先保存/切换", status_code=400)
    resolved_api_key = str(resolved_outline.api_key)

    settings_row = db.get(ProjectSettings, project_id)
    world_setting = (settings_row.world_setting if settings_row else "") or ""
    settings_style_guide = (settings_row.style_guide if settings_row else "") or ""
    constraints = (settings_row.constraints if settings_row else "") or ""

    style_resolution: dict[str, object] = {"style_id": None, "source": "disabled"}
    if not body.context.include_world_setting:
        world_setting = ""
        settings_style_guide = ""
        constraints = ""
    else:
        resolved_style_guide, style_resolution = resolve_style_guide(
            db,
            project_id=project_id,
            user_id=user_id,
            requested_style_id=body.style_id,
            include_style_guide=True,
            settings_style_guide=settings_style_guide,
        )
        settings_style_guide = resolved_style_guide

    run_params_extra_json: dict[str, object] = {"style_resolution": style_resolution}

    chars: list[Character] = []
    if body.context.include_characters:
        chars = db.execute(select(Character).where(Character.project_id == project_id)).scalars().all()
    characters_text = format_characters(chars)
    target_chapter_count = extract_target_chapter_count(body.requirements)
    guidance = build_outline_generation_guidance(target_chapter_count)

    requirements_text = json.dumps(body.requirements or {}, ensure_ascii=False, indent=2)
    values = {
        "project_name": project.name or "",
        "genre": project.genre or "",
        "logline": project.logline or "",
        "world_setting": world_setting,
        "style_guide": settings_style_guide,
        "constraints": constraints,
        "characters": characters_text,
        "outline": "",
        "chapter_number": "",
        "chapter_title": "",
        "chapter_plan": "",
        "requirements": requirements_text,
        "instruction": "",
        "previous_chapter": "",
        "target_chapter_count": target_chapter_count or "",
        "chapter_count_rule": guidance.get("chapter_count_rule", ""),
        "chapter_detail_rule": guidance.get("chapter_detail_rule", ""),
    }

    prompt_system, prompt_user, prompt_messages, _, _, _, render_log = render_preset_for_task(
        db,
        project_id=project_id,
        task="outline_generate",
        values=values,
        macro_seed=request_id,
        provider=resolved_outline.llm_call.provider,
    )
    prompt_render_log_json = json.dumps(render_log, ensure_ascii=False)

    llm_call = resolved_outline.llm_call
    current_max_tokens = llm_call.params.get("max_tokens")
    current_max_tokens_int = int(current_max_tokens) if isinstance(current_max_tokens, int) else None
    wanted_max_tokens = recommend_outline_max_tokens(
        target_chapter_count=target_chapter_count,
        provider=llm_call.provider,
        model=llm_call.model,
        current_max_tokens=current_max_tokens_int,
    )
    if isinstance(wanted_max_tokens, int) and wanted_max_tokens > 0:
        llm_call = with_param_overrides(llm_call, {"max_tokens": wanted_max_tokens})
        run_params_extra_json["outline_auto_max_tokens"] = {
            "target_chapter_count": target_chapter_count,
            "from": current_max_tokens_int,
            "to": wanted_max_tokens,
        }

    return PreparedOutlineGeneration(
        resolved_api_key=resolved_api_key,
        prompt_system=prompt_system,
        prompt_user=prompt_user,
        prompt_messages=prompt_messages,
        prompt_render_log_json=prompt_render_log_json,
        llm_call=llm_call,
        target_chapter_count=target_chapter_count,
        run_params_extra_json=run_params_extra_json,
    )
