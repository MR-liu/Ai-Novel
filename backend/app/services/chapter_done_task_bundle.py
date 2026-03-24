from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Callable

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.logging import exception_log_fields, log_event
from app.models.project_settings import ProjectSettings
from app.models.project_table import ProjectTable


CHAPTER_DONE_TASK_KEYS = (
    "vector_rebuild",
    "search_rebuild",
    "worldbook_auto_update",
    "characters_auto_update",
    "plot_auto_update",
    "table_ai_update",
    "graph_auto_update",
    "fractal_rebuild",
)


@dataclass(frozen=True)
class ChapterDoneTaskFlags:
    auto_worldbook: bool = True
    auto_characters: bool = True
    auto_story_memory: bool = True
    auto_graph: bool = True
    auto_vector: bool = True
    auto_search: bool = True
    auto_fractal: bool = True
    auto_tables: bool = True


def new_chapter_done_task_result() -> dict[str, str | None]:
    return {key: None for key in CHAPTER_DONE_TASK_KEYS}


def resolve_chapter_done_task_flags(*, db: Session, project_id: str) -> ChapterDoneTaskFlags:
    settings_row = db.get(ProjectSettings, project_id)
    if settings_row is None:
        return ChapterDoneTaskFlags()
    return ChapterDoneTaskFlags(
        auto_worldbook=bool(getattr(settings_row, "auto_update_worldbook_enabled", True)),
        auto_characters=bool(getattr(settings_row, "auto_update_characters_enabled", True)),
        auto_story_memory=bool(getattr(settings_row, "auto_update_story_memory_enabled", True)),
        auto_graph=bool(getattr(settings_row, "auto_update_graph_enabled", True)),
        auto_vector=bool(getattr(settings_row, "auto_update_vector_enabled", True)),
        auto_search=bool(getattr(settings_row, "auto_update_search_enabled", True)),
        auto_fractal=bool(getattr(settings_row, "auto_update_fractal_enabled", True)),
        auto_tables=bool(getattr(settings_row, "auto_update_tables_enabled", True)),
    )


def log_chapter_done_task_schedule_error(
    *,
    logger,
    project_id: str,
    chapter_id: str,
    kind: str,
    exc: Exception,
) -> None:
    log_event(
        logger,
        "warning",
        event="CHAPTER_DONE_TASK_SCHEDULE_ERROR",
        project_id=project_id,
        chapter_id=chapter_id,
        kind=kind,
        error_type=type(exc).__name__,
        **exception_log_fields(exc),
    )


def schedule_table_ai_update_bundle(
    *,
    db: Session,
    project_id: str,
    actor_user_id: str | None,
    request_id: str | None,
    chapter_id: str,
    chapter_token: str,
    reason: str,
    dedupe_task_id: Callable[[str], None] | None = None,
) -> str | None:
    from app.services.table_ai_update_service import schedule_table_ai_update_task

    table_rows = (
        db.execute(
            select(ProjectTable.id, ProjectTable.schema_json, ProjectTable.auto_update_enabled)
            .where(ProjectTable.project_id == project_id)
            .order_by(ProjectTable.updated_at.desc(), ProjectTable.id.desc())
            .limit(12)
        )
        .all()
    )
    if not isinstance(table_rows, list):
        table_rows = []

    created: list[str] = []
    for table_id, schema_json, auto_update_enabled in table_rows:
        if not bool(auto_update_enabled):
            continue
        schema_obj = _compact_json_loads(schema_json)
        if not isinstance(schema_obj, dict):
            continue
        columns = schema_obj.get("columns") if isinstance(schema_obj.get("columns"), list) else []
        has_number = any(
            isinstance(column, dict) and str(column.get("type") or "").strip().lower() == "number"
            for column in columns
        )
        if not has_number:
            continue

        task_id = schedule_table_ai_update_task(
            db=db,
            project_id=project_id,
            actor_user_id=actor_user_id,
            request_id=request_id,
            table_id=str(table_id),
            chapter_id=chapter_id,
            chapter_token=chapter_token,
            focus=None,
            reason=reason,
        )
        if not task_id:
            continue
        created.append(str(task_id))
        if dedupe_task_id is not None:
            dedupe_task_id(str(task_id))

    return created[0] if created else None


def _compact_json_loads(value: str | None) -> object | None:
    if value is None:
        return None
    try:
        return json.loads(value)
    except Exception:
        return None
