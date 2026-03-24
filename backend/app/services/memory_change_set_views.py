from __future__ import annotations

import json
from datetime import datetime
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.errors import AppError
from app.core.secrets import redact_api_keys
from app.models.generation_run import GenerationRun
from app.models.memory_task import MemoryTask
from app.models.structured_memory import MemoryChangeSet, MemoryChangeSetItem


def _compact_json_loads(value: str | None) -> Any | None:
    if value is None:
        return None
    try:
        return json.loads(value)
    except Exception:
        return None


def iso_datetime(dt: datetime | None) -> str | None:
    if dt is None:
        return None
    value = dt.isoformat()
    return value.replace("+00:00", "Z")


def parse_datetime(value: object) -> datetime | None:
    if value is None:
        return None
    if isinstance(value, datetime):
        return value
    text = str(value).strip()
    if not text:
        return None
    if text.endswith("Z"):
        text = text[:-1] + "+00:00"
    try:
        return datetime.fromisoformat(text)
    except Exception:
        return None


def change_set_to_dict(change_set: MemoryChangeSet) -> dict[str, Any]:
    return {
        "id": str(change_set.id),
        "project_id": str(change_set.project_id),
        "actor_user_id": change_set.actor_user_id,
        "generation_run_id": change_set.generation_run_id,
        "request_id": change_set.request_id,
        "idempotency_key": str(change_set.idempotency_key),
        "title": change_set.title,
        "summary_md": change_set.summary_md,
        "status": str(change_set.status),
        "created_at": iso_datetime(change_set.created_at),
        "applied_at": iso_datetime(change_set.applied_at),
        "rolled_back_at": iso_datetime(change_set.rolled_back_at),
    }


ALLOWED_CHANGE_SET_STATUSES = {"proposed", "applied", "rolled_back", "failed"}


def change_set_summary_to_dict(*, change_set: MemoryChangeSet, chapter_id: str | None) -> dict[str, Any]:
    updated_at = change_set.rolled_back_at or change_set.applied_at or change_set.created_at
    return {
        "id": str(change_set.id),
        "chapter_id": chapter_id,
        "request_id": change_set.request_id,
        "idempotency_key": change_set.idempotency_key,
        "title": change_set.title,
        "summary_md": change_set.summary_md,
        "status": str(change_set.status),
        "created_at": iso_datetime(change_set.created_at),
        "updated_at": iso_datetime(updated_at),
    }


def list_memory_change_sets(
    *,
    db: Session,
    project_id: str,
    status: str | None,
    before: str | None,
    limit: int,
) -> dict[str, Any]:
    status_norm = str(status or "").strip().lower() or None
    if status_norm is not None and status_norm not in ALLOWED_CHANGE_SET_STATUSES:
        raise AppError.validation(details={"reason": "invalid_status", "status": status})

    before_raw = str(before or "").strip()
    before_dt = parse_datetime(before_raw) if before_raw else None
    if before_raw and before_dt is None:
        raise AppError.validation(details={"reason": "invalid_before", "before": before})

    query = (
        select(MemoryChangeSet, GenerationRun.chapter_id)
        .outerjoin(GenerationRun, GenerationRun.id == MemoryChangeSet.generation_run_id)
        .where(MemoryChangeSet.project_id == project_id)
    )
    if status_norm is not None:
        query = query.where(MemoryChangeSet.status == status_norm)
    if before_dt is not None:
        query = query.where(MemoryChangeSet.created_at < before_dt)

    rows = db.execute(query.order_by(MemoryChangeSet.created_at.desc(), MemoryChangeSet.id.desc()).limit(limit + 1)).all()
    has_more = len(rows) > limit
    rows = rows[:limit]

    items = [
        change_set_summary_to_dict(change_set=change_set, chapter_id=str(chapter_id) if chapter_id else None)
        for change_set, chapter_id in rows
    ]
    next_before = iso_datetime(rows[-1][0].created_at) if (has_more and rows) else None
    return {"items": items, "next_before": next_before}


ALLOWED_TASK_STATUSES_QUERY = {"queued", "running", "failed", "done", "succeeded"}
TASK_DONE_ALIASES = {"succeeded", "done"}


def memory_task_status_to_public(status: str) -> str:
    normalized = str(status or "").strip().lower()
    return "done" if normalized in TASK_DONE_ALIASES else normalized


def memory_task_error_fields(task: MemoryTask) -> tuple[str | None, str | None]:
    value = _compact_json_loads(task.error_json) if task.error_json else None
    if not isinstance(value, dict):
        return None, None
    error_type = str(value.get("error_type") or "").strip() or None
    error_message = str(value.get("message") or "").strip() or None
    return error_type, error_message


def memory_task_timings(task: MemoryTask) -> dict[str, Any]:
    created_at = task.created_at
    started_at = task.started_at
    finished_at = task.finished_at

    run_ms = int((finished_at - started_at).total_seconds() * 1000) if (started_at and finished_at) else None
    queue_delay_ms = int((started_at - created_at).total_seconds() * 1000) if started_at else None
    total_ms = int((finished_at - created_at).total_seconds() * 1000) if finished_at else None

    return {
        "created_at": iso_datetime(created_at),
        "started_at": iso_datetime(started_at),
        "finished_at": iso_datetime(finished_at),
        "updated_at": iso_datetime(task.updated_at),
        "queue_delay_ms": queue_delay_ms,
        "run_ms": run_ms,
        "total_ms": total_ms,
    }


def memory_task_to_dict(*, task: MemoryTask, change_set_request_id: str | None = None) -> dict[str, Any]:
    error_type, error_message = memory_task_error_fields(task)
    error = _compact_json_loads(task.error_json) if task.error_json else None
    return {
        "id": str(task.id),
        "project_id": str(task.project_id),
        "change_set_id": str(task.change_set_id),
        "request_id": change_set_request_id,
        "actor_user_id": task.actor_user_id,
        "kind": str(task.kind),
        "status": memory_task_status_to_public(str(task.status)),
        "error_type": error_type,
        "error_message": error_message,
        "error": redact_api_keys(error) if error is not None else None,
        "timings": memory_task_timings(task),
    }


def list_memory_tasks(
    *,
    db: Session,
    project_id: str,
    status: str | None,
    before: str | None,
    limit: int,
) -> dict[str, Any]:
    status_norm = str(status or "").strip().lower() or None
    if status_norm is not None:
        if status_norm == "succeeded":
            status_norm = "done"
        if status_norm not in ALLOWED_TASK_STATUSES_QUERY:
            raise AppError.validation(details={"reason": "invalid_status", "status": status})

    before_raw = str(before or "").strip()
    before_dt = parse_datetime(before_raw) if before_raw else None
    if before_raw and before_dt is None:
        raise AppError.validation(details={"reason": "invalid_before", "before": before})

    query = (
        select(MemoryTask, MemoryChangeSet.request_id)
        .join(MemoryChangeSet, MemoryChangeSet.id == MemoryTask.change_set_id)
        .where(MemoryTask.project_id == project_id)
    )
    if status_norm is not None:
        if status_norm == "done":
            query = query.where(MemoryTask.status.in_(sorted(TASK_DONE_ALIASES)))
        else:
            query = query.where(MemoryTask.status == status_norm)
    if before_dt is not None:
        query = query.where(MemoryTask.created_at < before_dt)

    rows = db.execute(query.order_by(MemoryTask.created_at.desc(), MemoryTask.id.desc()).limit(limit + 1)).all()
    has_more = len(rows) > limit
    rows = rows[:limit]

    items = [memory_task_to_dict(task=task, change_set_request_id=request_id) for task, request_id in rows]
    next_before = iso_datetime(rows[-1][0].created_at) if (has_more and rows) else None
    return {"items": items, "next_before": next_before}


def change_set_item_to_dict(item: MemoryChangeSetItem) -> dict[str, Any]:
    return {
        "id": str(item.id),
        "project_id": str(item.project_id),
        "change_set_id": str(item.change_set_id),
        "item_index": int(item.item_index),
        "target_table": str(item.target_table),
        "target_id": item.target_id,
        "op": str(item.op),
        "before_json": item.before_json,
        "after_json": item.after_json,
        "evidence_ids_json": item.evidence_ids_json,
        "created_at": iso_datetime(item.created_at),
    }
