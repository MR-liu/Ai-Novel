from __future__ import annotations

from typing import Any, Callable

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.errors import AppError
from app.core.logging import log_event, redact_secrets_text
from app.core.secrets import redact_api_keys
from app.db.utils import new_id, utc_now
from app.models.memory_task import MemoryTask


MEMORY_TASK_KINDS = ("vector_rebuild", "graph_update", "fractal_rebuild")


def build_memory_task_error_payload(exc: Exception, *, message_limit: int) -> dict[str, Any]:
    safe_message = redact_secrets_text(str(exc)).replace("\n", " ").strip()
    if not safe_message:
        safe_message = type(exc).__name__

    if isinstance(exc, AppError):
        details = exc.details if isinstance(exc.details, dict) else {}
        return {
            "error_type": type(exc).__name__,
            "code": str(exc.code),
            "message": safe_message[:message_limit],
            "details": redact_api_keys(details),
        }
    return {"error_type": type(exc).__name__, "message": safe_message[:message_limit]}


def ensure_memory_tasks(
    *,
    db: Session,
    project_id: str,
    change_set_id: str,
    actor_user_id: str,
) -> list[MemoryTask]:
    existing = (
        db.execute(select(MemoryTask).where(MemoryTask.change_set_id == change_set_id).order_by(MemoryTask.kind.asc()))
        .scalars()
        .all()
    )
    by_kind = {str(task.kind): task for task in existing}

    tasks: list[MemoryTask] = []
    for kind in MEMORY_TASK_KINDS:
        row = by_kind.get(kind)
        if row is None:
            row = MemoryTask(
                id=new_id(),
                project_id=project_id,
                change_set_id=change_set_id,
                actor_user_id=actor_user_id,
                kind=kind,
                status="queued",
            )
            db.add(row)
        tasks.append(row)
    db.commit()
    return tasks


def enqueue_memory_tasks(
    *,
    db: Session,
    logger: Any,
    request_id: str,
    project_id: str,
    change_set_id: str,
    tasks: list[MemoryTask],
    queue_enqueue_fn: Callable[..., str],
) -> None:
    for task in tasks:
        if str(task.status) != "queued":
            continue
        try:
            queue_enqueue_fn(kind="memory_task", task_id=str(task.id))
        except Exception as exc:
            task.status = "failed"
            task.finished_at = utc_now()
            task.error_json = _compact_json_dumps(build_memory_task_error_payload(exc, message_limit=200))
            db.commit()
            log_event(
                logger,
                "warning",
                event="MEMORY_TASK_ENQUEUE_ERROR",
                project_id=project_id,
                change_set_id=change_set_id,
                task_id=str(task.id),
                kind=str(task.kind),
                error_type=type(exc).__name__,
            )
            continue

    log_event(
        logger,
        "info",
        event="MEMORY_TASKS_ENQUEUED",
        project_id=project_id,
        change_set_id=change_set_id,
        tasks=[{"id": str(task.id), "kind": str(task.kind)} for task in tasks],
        request_id=request_id,
    )


def run_memory_task_kind(
    *,
    kind: str,
    task_id: str,
    project_id: str,
    db: Session,
    session_factory: Callable[[], Session],
    rebuild_fractal_memory_fn: Callable[..., dict[str, Any]],
    vector_embedding_overrides_fn: Callable[[Any], dict[str, str | None] | None],
    vector_rag_status_fn: Callable[..., dict[str, Any]],
    build_project_chunks_fn: Callable[..., list[Any]],
    rebuild_project_fn: Callable[..., dict[str, Any]],
    project_settings_model: type,
) -> dict[str, Any]:
    if kind == "graph_update":
        return {"skipped": True, "note": "graph context is computed on query; no rebuild required"}
    if kind == "fractal_rebuild":
        if not bool(getattr(settings, "fractal_enabled", True)):
            return {"skipped": True, "disabled_reason": "disabled"}
        return rebuild_fractal_memory_fn(db=db, project_id=project_id, reason=f"memory_task:{task_id[:8]}")
    if kind == "vector_rebuild":
        db2 = session_factory()
        try:
            embedding = vector_embedding_overrides_fn(db2.get(project_settings_model, project_id))
            status = vector_rag_status_fn(project_id=project_id, embedding=embedding)
            if not bool(status.get("enabled")):
                return {"skipped": True, **status}
            chunks = build_project_chunks_fn(db=db2, project_id=project_id)
            result = rebuild_project_fn(project_id=project_id, chunks=chunks, embedding=embedding)
            if bool(result.get("enabled")) and not bool(result.get("skipped")):
                settings_row = db2.get(project_settings_model, project_id)
                if settings_row is None:
                    settings_row = project_settings_model(project_id=project_id)
                    db2.add(settings_row)
                settings_row.vector_index_dirty = False
                settings_row.last_vector_build_at = utc_now()
                db2.commit()
            return result
        finally:
            db2.close()
    raise ValueError(f"Unsupported MemoryTask.kind: {kind!r}")


def _compact_json_dumps(value: Any) -> str:
    import json

    return json.dumps(value, ensure_ascii=False, separators=(",", ":"))
