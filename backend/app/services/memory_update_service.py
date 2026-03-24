from __future__ import annotations

import json
import logging
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.errors import AppError
from app.core.logging import exception_log_fields, log_event, redact_secrets_text
from app.core.secrets import redact_api_keys
from app.db.session import SessionLocal
from app.db.utils import new_id, utc_now
from app.models.chapter import Chapter
from app.models.generation_run import GenerationRun
from app.models.memory_task import MemoryTask
from app.models.project_table import ProjectTable, ProjectTableRow
from app.models.project_settings import ProjectSettings
from app.models.structured_memory import (
    MemoryChangeSet,
    MemoryChangeSetItem,
    MemoryEntity,
    MemoryEvidence,
    MemoryEvent,
    MemoryForeshadow,
    MemoryRelation,
)
from app.schemas.memory_update import AFTER_MODEL_BY_TABLE, MemoryUpdateV1Request
from app.services.memory_change_set_views import (
    change_set_item_to_dict as _item_to_dict,
    change_set_to_dict as _change_set_to_dict,
    iso_datetime as _iso,
    list_memory_change_sets,
    list_memory_tasks,
    memory_task_to_dict,
    parse_datetime as _parse_dt,
)
from app.services.memory_change_set_flow import (
    build_change_set_response as _build_change_set_response,
    find_existing_change_set_response as _find_existing_change_set_response,
    load_existing_change_set as _load_existing_change_set,
    load_change_set_items as _load_change_set_items,
)
from app.services.memory_change_set_apply_flow import (
    apply_change_set_items as _apply_change_set_items,
    rollback_change_set_items as _rollback_change_set_items,
)
from app.services.memory_task_flow import (
    build_memory_task_error_payload as _build_memory_task_error_payload,
    enqueue_memory_tasks as _enqueue_memory_tasks,
    ensure_memory_tasks as _ensure_memory_tasks_impl,
    run_memory_task_kind as _run_memory_task_kind,
)
from app.services.table_executor import TableUpdateV1Request, is_key_value_schema, validate_row_data_for_table
from app.services.fractal_memory_service import rebuild_fractal_memory
from app.services.vector_embedding_overrides import vector_embedding_overrides
from app.services.vector_rag_service import build_project_chunks, rebuild_project, vector_rag_status

logger = logging.getLogger("ainovel")


_MODEL_BY_TABLE: dict[str, type] = {
    "entities": MemoryEntity,
    "relations": MemoryRelation,
    "events": MemoryEvent,
    "foreshadows": MemoryForeshadow,
    "evidence": MemoryEvidence,
    "project_table_rows": ProjectTableRow,
}


def _compact_json_dumps(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"))


def _compact_json_loads(value: str | None) -> Any | None:
    if value is None:
        return None
    try:
        return json.loads(value)
    except Exception:
        return None


def _parse_attributes_json(raw: str | None) -> dict[str, Any] | str | None:
    if raw is None:
        return None
    try:
        value = json.loads(raw)
    except Exception:
        return raw
    if isinstance(value, dict):
        return value
    return raw


def _row_payload(target_table: str, row: Any) -> dict[str, Any]:
    if target_table == "entities":
        return {
            "id": str(row.id),
            "entity_type": str(row.entity_type or "generic"),
            "name": str(row.name or ""),
            "summary_md": row.summary_md,
            "attributes": _parse_attributes_json(row.attributes_json),
            "deleted_at": _iso(row.deleted_at),
        }
    if target_table == "relations":
        return {
            "id": str(row.id),
            "from_entity_id": str(row.from_entity_id),
            "to_entity_id": str(row.to_entity_id),
            "relation_type": str(row.relation_type or "related_to"),
            "description_md": row.description_md,
            "attributes": _parse_attributes_json(row.attributes_json),
            "deleted_at": _iso(row.deleted_at),
        }
    if target_table == "events":
        return {
            "id": str(row.id),
            "chapter_id": row.chapter_id,
            "event_type": str(row.event_type or "event"),
            "title": row.title,
            "content_md": str(row.content_md or ""),
            "attributes": _parse_attributes_json(row.attributes_json),
            "deleted_at": _iso(row.deleted_at),
        }
    if target_table == "foreshadows":
        return {
            "id": str(row.id),
            "chapter_id": row.chapter_id,
            "resolved_at_chapter_id": row.resolved_at_chapter_id,
            "title": row.title,
            "content_md": str(row.content_md or ""),
            "resolved": int(row.resolved or 0),
            "attributes": _parse_attributes_json(row.attributes_json),
            "deleted_at": _iso(row.deleted_at),
        }
    if target_table == "evidence":
        return {
            "id": str(row.id),
            "source_type": str(row.source_type or "unknown"),
            "source_id": row.source_id,
            "quote_md": str(row.quote_md or ""),
            "attributes": _parse_attributes_json(row.attributes_json),
            "deleted_at": _iso(row.deleted_at),
        }
    if target_table == "project_table_rows":
        data_obj = _compact_json_loads(getattr(row, "data_json", None))
        data = data_obj if isinstance(data_obj, dict) else {}
        return {
            "id": str(row.id),
            "table_id": str(row.table_id),
            "row_index": int(getattr(row, "row_index", 0) or 0),
            "data": data,
        }
    raise AppError.validation(details={"target_table": target_table})


def _load_target_row(db: Session, *, target_table: str, project_id: str, target_id: str) -> Any | None:
    model = _MODEL_BY_TABLE.get(target_table)
    if model is None:
        raise AppError.validation(details={"target_table": target_table})
    return (
        db.execute(
            select(model).where(  # type: ignore[arg-type]
                model.id == target_id,  # type: ignore[attr-defined]
                model.project_id == project_id,  # type: ignore[attr-defined]
            )
        )
        .scalars()
        .first()
    )

def retry_memory_task(*, db: Session, request_id: str, task: MemoryTask) -> MemoryTask:
    """
    Idempotent retry for failed MemoryTask.

    - If task is not failed: noop.
    - If failed: reset -> queued, clear error/result/timings, enqueue again.
    """

    status_norm = str(getattr(task, "status", "") or "").strip().lower()
    if status_norm != "failed":
        return task

    task.status = "queued"
    task.started_at = None
    task.finished_at = None
    task.result_json = None
    task.error_json = None

    try:
        value = _compact_json_loads(task.params_json) if task.params_json else {}
        if isinstance(value, dict):
            value["retry_count"] = int(value.get("retry_count") or 0) + 1
            task.params_json = _compact_json_dumps(value)
    except Exception:
        pass

    db.commit()

    from app.services.task_queue import get_task_queue

    queue = get_task_queue()
    try:
        queue.enqueue(kind="memory_task", task_id=str(task.id))
    except Exception as exc:
        safe_message = redact_secrets_text(str(exc)).replace("\n", " ").strip()
        if not safe_message:
            safe_message = type(exc).__name__

        if isinstance(exc, AppError):
            details = exc.details if isinstance(exc.details, dict) else {}
            error_payload = {
                "error_type": type(exc).__name__,
                "code": str(exc.code),
                "message": safe_message[:200],
                "details": redact_api_keys(details),
            }
        else:
            error_payload = {"error_type": type(exc).__name__, "message": safe_message[:200]}

        task.status = "failed"
        task.finished_at = utc_now()
        task.error_json = _compact_json_dumps(error_payload)
        db.commit()
        log_event(
            logger,
            "warning",
            event="MEMORY_TASK_RETRY_ENQUEUE_ERROR",
            project_id=str(task.project_id),
            change_set_id=str(task.change_set_id),
            task_id=str(task.id),
            kind=str(task.kind),
            request_id=request_id,
            error_type=type(exc).__name__,
        )
        raise

    log_event(
        logger,
        "info",
        event="MEMORY_TASK_RETRIED",
        project_id=str(task.project_id),
        change_set_id=str(task.change_set_id),
        task_id=str(task.id),
        kind=str(task.kind),
        request_id=request_id,
    )
    return task

def propose_chapter_memory_change_set(
    *,
    db: Session,
    request_id: str,
    actor_user_id: str,
    chapter: Chapter,
    payload: MemoryUpdateV1Request,
) -> dict[str, Any]:
    project_id = str(chapter.project_id)
    chapter_id = str(chapter.id)

    existing_response = _find_existing_change_set_response(
        db=db,
        project_id=project_id,
        idempotency_key=payload.idempotency_key,
    )
    if existing_response is not None:
        return existing_response

    generation_run_id = new_id()
    db.add(
        GenerationRun(
            id=generation_run_id,
            project_id=project_id,
            actor_user_id=actor_user_id,
            chapter_id=chapter_id,
            type="memory_update_propose",
            provider=None,
            model=None,
            request_id=request_id,
            prompt_system="",
            prompt_user="",
            prompt_render_log_json=None,
            params_json=_compact_json_dumps(
                {
                    "schema_version": payload.schema_version,
                    "idempotency_key": payload.idempotency_key,
                    "ops_count": len(payload.ops),
                }
            ),
            output_text=_compact_json_dumps(payload.model_dump()),
            error_json=None,
        )
    )

    change_set = MemoryChangeSet(
        id=new_id(),
        project_id=project_id,
        actor_user_id=actor_user_id,
        generation_run_id=generation_run_id,
        request_id=request_id,
        idempotency_key=payload.idempotency_key,
        title=payload.title,
        summary_md=payload.summary_md,
        status="proposed",
    )
    db.add(change_set)

    items: list[MemoryChangeSetItem] = []
    for idx, op in enumerate(payload.ops):
        target_table = str(op.target_table)
        target_id = str(op.target_id or "").strip()

        after_dict: dict[str, Any] | None = None
        if op.op == "upsert":
            model_cls = AFTER_MODEL_BY_TABLE.get(target_table)
            if model_cls is None:
                raise AppError.validation(details={"item_index": idx, "reason": "unsupported_target_table"})
            after_obj = model_cls.model_validate(op.after or {})
            after_dict = dict(after_obj.model_dump())
            if target_table in {"events", "foreshadows"} and not (after_dict.get("chapter_id") or "").strip():
                after_dict["chapter_id"] = chapter_id

            # restore-on-create: resolve by unique key when caller omits target_id
            if not target_id and target_table == "entities":
                entity_type = str(after_dict.get("entity_type") or "generic").strip() or "generic"
                name = str(after_dict.get("name") or "").strip()
                existing_id = (
                    db.execute(
                        select(MemoryEntity.id).where(
                            MemoryEntity.project_id == project_id,
                            MemoryEntity.entity_type == entity_type,
                            MemoryEntity.name == name,
                        )
                    )
                    .scalars()
                    .first()
                )
                if existing_id:
                    target_id = str(existing_id)
            if not target_id and target_table == "relations":
                from_entity_id = str(after_dict.get("from_entity_id") or "").strip()
                to_entity_id = str(after_dict.get("to_entity_id") or "").strip()
                relation_type = str(after_dict.get("relation_type") or "related_to").strip() or "related_to"
                existing_id = (
                    db.execute(
                        select(MemoryRelation.id).where(
                            MemoryRelation.project_id == project_id,
                            MemoryRelation.from_entity_id == from_entity_id,
                            MemoryRelation.to_entity_id == to_entity_id,
                            MemoryRelation.relation_type == relation_type,
                        )
                    )
                    .scalars()
                    .first()
                )
                if existing_id:
                    target_id = str(existing_id)

            if not target_id:
                target_id = new_id()

            after_dict["id"] = target_id

        if not target_id:
            raise AppError.validation(details={"item_index": idx, "reason": "target_id_missing"})

        before_row = _load_target_row(db, target_table=target_table, project_id=project_id, target_id=target_id)
        if op.op == "delete" and before_row is None:
            raise AppError.validation(details={"item_index": idx, "reason": "target_not_found"})

        before_dict = _row_payload(target_table, before_row) if before_row is not None else None

        evidence_ids_json = _compact_json_dumps(op.evidence_ids) if op.evidence_ids else None

        item = MemoryChangeSetItem(
            id=new_id(),
            project_id=project_id,
            change_set_id=str(change_set.id),
            item_index=idx,
            target_table=target_table,
            target_id=target_id,
            op=str(op.op),
            before_json=_compact_json_dumps(before_dict) if before_dict is not None else None,
            after_json=_compact_json_dumps(after_dict) if after_dict is not None else None,
            evidence_ids_json=evidence_ids_json,
        )
        items.append(item)
        db.add(item)

    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        log_event(
            logger,
            "warning",
            event="MEMORY_CHANGESET_PROPOSE_CONFLICT",
            project_id=project_id,
            idempotency_key=payload.idempotency_key,
            **exception_log_fields(exc),
        )
        existing = _load_existing_change_set(db=db, project_id=project_id, idempotency_key=payload.idempotency_key)
        if existing is not None:
            items2 = _load_change_set_items(db=db, change_set_id=str(existing.id))
            return _build_change_set_response(change_set=existing, items=items2, idempotent=True)
        raise

    log_event(
        logger,
        "info",
        event="MEMORY_CHANGESET_PROPOSED",
        change_set_id=str(change_set.id),
        project_id=project_id,
        items_count=len(items),
    )
    return {
        "idempotent": False,
        "change_set": _change_set_to_dict(change_set),
        "items": [_item_to_dict(i) for i in items],
    }


def propose_project_table_change_set(
    *,
    db: Session,
    request_id: str,
    actor_user_id: str,
    project_id: str,
    payload: TableUpdateV1Request,
) -> dict[str, Any]:
    existing_response = _find_existing_change_set_response(
        db=db,
        project_id=project_id,
        idempotency_key=payload.idempotency_key,
    )
    if existing_response is not None:
        return existing_response

    generation_run_id = new_id()
    db.add(
        GenerationRun(
            id=generation_run_id,
            project_id=project_id,
            actor_user_id=actor_user_id,
            chapter_id=None,
            type="table_update_propose",
            provider=None,
            model=None,
            request_id=request_id,
            prompt_system="",
            prompt_user="",
            prompt_render_log_json=None,
            params_json=_compact_json_dumps(
                {
                    "schema_version": payload.schema_version,
                    "idempotency_key": payload.idempotency_key,
                    "ops_count": len(payload.ops),
                }
            ),
            output_text=_compact_json_dumps(payload.model_dump()),
            error_json=None,
        )
    )

    change_set = MemoryChangeSet(
        id=new_id(),
        project_id=project_id,
        actor_user_id=actor_user_id,
        generation_run_id=generation_run_id,
        request_id=request_id,
        idempotency_key=payload.idempotency_key,
        title=payload.title,
        summary_md=payload.summary_md,
        status="proposed",
    )
    db.add(change_set)

    items: list[MemoryChangeSetItem] = []
    for idx, op in enumerate(payload.ops):
        table_id = str(op.table_id or "").strip()
        if not table_id:
            raise AppError.validation(details={"item_index": idx, "reason": "table_id_missing"})
        table = db.get(ProjectTable, table_id)
        if table is None or str(table.project_id) != str(project_id):
            raise AppError.validation(details={"item_index": idx, "reason": "table_not_found", "table_id": table_id})

        target_table = "project_table_rows"
        after_dict: dict[str, Any] | None = None

        if op.op == "delete":
            target_id = str(op.row_id or "").strip()
            if not target_id:
                raise AppError.validation(details={"item_index": idx, "reason": "row_id_missing"})
            row = db.get(ProjectTableRow, target_id)
            if row is None or str(row.project_id) != str(project_id) or str(row.table_id) != str(table_id):
                raise AppError.validation(details={"item_index": idx, "reason": "target_not_found", "row_id": target_id})
            before_row = row
        else:
            target_id = str(op.row_id or "").strip()
            if not target_id:
                schema_obj = _compact_json_loads(getattr(table, "schema_json", None))
                schema_dict = schema_obj if isinstance(schema_obj, dict) else {}
                if is_key_value_schema(schema_dict) and isinstance(op.data, dict):
                    key_value = str(op.data.get("key") or "").strip()
                    if key_value:
                        candidates = (
                            db.execute(
                                select(ProjectTableRow.id, ProjectTableRow.data_json)
                                .where(
                                    ProjectTableRow.project_id == project_id,
                                    ProjectTableRow.table_id == table_id,
                                )
                                .order_by(ProjectTableRow.updated_at.desc(), ProjectTableRow.id.desc())
                                .limit(2000)
                            )
                            .all()
                        )
                        for row_id, data_json in candidates:
                            data_obj = _compact_json_loads(data_json)
                            if isinstance(data_obj, dict) and str(data_obj.get("key") or "").strip() == key_value:
                                target_id = str(row_id)
                                break
            if not target_id:
                target_id = new_id()
            before_row = db.get(ProjectTableRow, target_id)
            if before_row is not None and (str(before_row.project_id) != str(project_id) or str(before_row.table_id) != str(table_id)):
                raise AppError.validation(details={"item_index": idx, "reason": "row_table_mismatch", "row_id": target_id})

            if op.row_index is not None:
                row_index = int(op.row_index)
            elif before_row is not None:
                row_index = int(getattr(before_row, "row_index", 0) or 0)
            else:
                max_idx = (
                    db.execute(select(func.max(ProjectTableRow.row_index)).where(ProjectTableRow.table_id == table_id)).scalar()
                )
                row_index = int(max_idx or 0) + 1

            data_norm = validate_row_data_for_table(schema_json=str(table.schema_json or "{}"), data=op.data)
            after_dict = {"table_id": table_id, "row_index": int(row_index), "data": data_norm}

        before_dict = _row_payload(target_table, before_row) if before_row is not None else None
        item = MemoryChangeSetItem(
            id=new_id(),
            project_id=project_id,
            change_set_id=str(change_set.id),
            item_index=idx,
            target_table=target_table,
            target_id=target_id,
            op=str(op.op),
            before_json=_compact_json_dumps(before_dict) if before_dict is not None else None,
            after_json=_compact_json_dumps(after_dict) if after_dict is not None else None,
            evidence_ids_json=None,
        )
        items.append(item)
        db.add(item)

    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        log_event(
            logger,
            "warning",
            event="MEMORY_CHANGESET_PROPOSE_CONFLICT",
            project_id=project_id,
            idempotency_key=payload.idempotency_key,
            **exception_log_fields(exc),
        )
        existing2 = _load_existing_change_set(db=db, project_id=project_id, idempotency_key=payload.idempotency_key)
        if existing2 is not None:
            items2 = _load_change_set_items(db=db, change_set_id=str(existing2.id))
            return _build_change_set_response(change_set=existing2, items=items2, idempotent=True)
        raise

    log_event(
        logger,
        "info",
        event="TABLE_CHANGESET_PROPOSED",
        change_set_id=str(change_set.id),
        project_id=project_id,
        items_count=len(items),
    )
    return {
        "idempotent": False,
        "change_set": _change_set_to_dict(change_set),
        "items": [_item_to_dict(i) for i in items],
    }


def _apply_upsert(
    db: Session, *, target_table: str, project_id: str, target_id: str, after: dict[str, Any]
) -> Any:
    model = _MODEL_BY_TABLE.get(target_table)
    if model is None:
        raise AppError.validation(details={"target_table": target_table})

    row = _load_target_row(db, target_table=target_table, project_id=project_id, target_id=target_id)
    if row is None:
        row = model(id=target_id, project_id=project_id)  # type: ignore[call-arg]
        db.add(row)

    if target_table == "entities":
        row.entity_type = str(after.get("entity_type") or "generic")  # type: ignore[attr-defined]
        row.name = str(after.get("name") or "")  # type: ignore[attr-defined]
        row.summary_md = after.get("summary_md")  # type: ignore[attr-defined]
        attrs = after.get("attributes")
        if isinstance(attrs, dict):
            row.attributes_json = _compact_json_dumps(attrs)  # type: ignore[attr-defined]
        elif isinstance(attrs, str):
            row.attributes_json = attrs  # type: ignore[attr-defined]
        else:
            row.attributes_json = None  # type: ignore[attr-defined]
        row.deleted_at = None  # type: ignore[attr-defined]
        return row

    if target_table == "relations":
        row.from_entity_id = str(after.get("from_entity_id") or "")  # type: ignore[attr-defined]
        row.to_entity_id = str(after.get("to_entity_id") or "")  # type: ignore[attr-defined]
        row.relation_type = str(after.get("relation_type") or "related_to")  # type: ignore[attr-defined]
        row.description_md = after.get("description_md")  # type: ignore[attr-defined]
        attrs = after.get("attributes")
        if isinstance(attrs, dict):
            row.attributes_json = _compact_json_dumps(attrs)  # type: ignore[attr-defined]
        elif isinstance(attrs, str):
            row.attributes_json = attrs  # type: ignore[attr-defined]
        else:
            row.attributes_json = None  # type: ignore[attr-defined]
        row.deleted_at = None  # type: ignore[attr-defined]
        return row

    if target_table == "events":
        row.chapter_id = after.get("chapter_id")  # type: ignore[attr-defined]
        row.event_type = str(after.get("event_type") or "event")  # type: ignore[attr-defined]
        row.title = after.get("title")  # type: ignore[attr-defined]
        row.content_md = str(after.get("content_md") or "")  # type: ignore[attr-defined]
        attrs = after.get("attributes")
        if isinstance(attrs, dict):
            row.attributes_json = _compact_json_dumps(attrs)  # type: ignore[attr-defined]
        elif isinstance(attrs, str):
            row.attributes_json = attrs  # type: ignore[attr-defined]
        else:
            row.attributes_json = None  # type: ignore[attr-defined]
        row.deleted_at = None  # type: ignore[attr-defined]
        return row

    if target_table == "foreshadows":
        row.chapter_id = after.get("chapter_id")  # type: ignore[attr-defined]
        row.resolved_at_chapter_id = after.get("resolved_at_chapter_id")  # type: ignore[attr-defined]
        row.title = after.get("title")  # type: ignore[attr-defined]
        row.content_md = str(after.get("content_md") or "")  # type: ignore[attr-defined]
        row.resolved = int(after.get("resolved") or 0)  # type: ignore[attr-defined]
        attrs = after.get("attributes")
        if isinstance(attrs, dict):
            row.attributes_json = _compact_json_dumps(attrs)  # type: ignore[attr-defined]
        elif isinstance(attrs, str):
            row.attributes_json = attrs  # type: ignore[attr-defined]
        else:
            row.attributes_json = None  # type: ignore[attr-defined]
        row.deleted_at = None  # type: ignore[attr-defined]
        return row

    if target_table == "evidence":
        row.source_type = str(after.get("source_type") or "unknown")  # type: ignore[attr-defined]
        row.source_id = after.get("source_id")  # type: ignore[attr-defined]
        row.quote_md = str(after.get("quote_md") or "")  # type: ignore[attr-defined]
        attrs = after.get("attributes")
        if isinstance(attrs, dict):
            row.attributes_json = _compact_json_dumps(attrs)  # type: ignore[attr-defined]
        elif isinstance(attrs, str):
            row.attributes_json = attrs  # type: ignore[attr-defined]
        else:
            row.attributes_json = None  # type: ignore[attr-defined]
        row.deleted_at = None  # type: ignore[attr-defined]
        return row

    if target_table == "project_table_rows":
        table_id = str(after.get("table_id") or "").strip()
        if not table_id:
            raise AppError.validation(details={"target_table": target_table, "reason": "table_id_missing"})
        table = db.get(ProjectTable, table_id)
        if table is None or str(table.project_id) != str(project_id):
            raise AppError.validation(details={"target_table": target_table, "reason": "table_not_found", "table_id": table_id})

        row_index_raw = after.get("row_index")
        try:
            row_index = int(row_index_raw)  # type: ignore[arg-type]
        except Exception:
            raise AppError.validation(details={"target_table": target_table, "reason": "row_index_invalid"}) from None
        if row_index < 0:
            raise AppError.validation(details={"target_table": target_table, "reason": "row_index_invalid"})

        data_norm = validate_row_data_for_table(schema_json=str(table.schema_json or "{}"), data=after.get("data"))
        if str(getattr(row, "table_id", "") or "") and str(getattr(row, "table_id", "")) != str(table_id):
            raise AppError.conflict(
                message="Row already belongs to another table",
                details={"target_table": target_table, "target_id": target_id, "table_id": table_id},
            )

        row.table_id = table_id  # type: ignore[attr-defined]
        row.row_index = row_index  # type: ignore[attr-defined]
        row.data_json = _compact_json_dumps(data_norm)  # type: ignore[attr-defined]
        return row

    raise AppError.validation(details={"target_table": target_table})


def apply_memory_change_set(
    *,
    db: Session,
    request_id: str,
    actor_user_id: str,
    change_set: MemoryChangeSet,
) -> dict[str, Any]:
    project_id = str(change_set.project_id)
    if change_set.status == "applied":
        return {"idempotent": True, "change_set": _change_set_to_dict(change_set), "warnings": []}
    if change_set.status != "proposed":
        raise AppError.conflict(details={"status": change_set.status})

    items = _load_change_set_items(db=db, change_set_id=str(change_set.id))
    if not items:
        raise AppError.validation(details={"reason": "no_items"})

    try:
        warnings = _apply_change_set_items(
            db=db,
            items=items,
            project_id=project_id,
            compact_json_loads_fn=_compact_json_loads,
            load_target_row_fn=_load_target_row,
            row_payload_fn=_row_payload,
            apply_upsert_fn=_apply_upsert,
            now_fn=utc_now,
        )

        change_set.status = "applied"
        change_set.applied_at = utc_now()

        db.commit()

        try:
            _schedule_memory_tasks_after_apply(db=db, request_id=request_id, actor_user_id=actor_user_id, change_set=change_set)
        except Exception as exc:
            log_event(
                logger,
                "warning",
                event="MEMORY_TASKS_ENQUEUE_FAILED",
                change_set_id=str(change_set.id),
                project_id=project_id,
                error_type=type(exc).__name__,
            )

        log_event(
            logger,
            "info",
            event="MEMORY_CHANGESET_APPLIED",
            change_set_id=str(change_set.id),
            project_id=project_id,
            actor_user_id=actor_user_id,
            warnings_count=len(warnings),
        )
        return {"idempotent": False, "change_set": _change_set_to_dict(change_set), "warnings": warnings}
    except IntegrityError as exc:
        db.rollback()
        log_event(
            logger,
            "warning",
            event="MEMORY_CHANGESET_APPLY_INTEGRITY_ERROR",
            change_set_id=str(change_set.id),
            project_id=project_id,
            **exception_log_fields(exc),
        )
        change_set.status = "failed"
        try:
            db.commit()
        except Exception:
            db.rollback()
        raise AppError.conflict(message="记忆变更集应用失败", details={"reason": "integrity_error"}) from exc
    except Exception:
        db.rollback()
        raise


def _ensure_memory_tasks(
    *,
    db: Session,
    project_id: str,
    change_set_id: str,
    actor_user_id: str,
) -> list[MemoryTask]:
    return _ensure_memory_tasks_impl(
        db=db,
        project_id=project_id,
        change_set_id=change_set_id,
        actor_user_id=actor_user_id,
    )


def _schedule_memory_tasks_after_apply(*, db: Session, request_id: str, actor_user_id: str, change_set: MemoryChangeSet) -> None:
    project_id = str(change_set.project_id)
    tasks = _ensure_memory_tasks(db=db, project_id=project_id, change_set_id=str(change_set.id), actor_user_id=actor_user_id)

    from app.services.task_queue import get_task_queue

    queue = get_task_queue()
    _enqueue_memory_tasks(
        db=db,
        logger=logger,
        request_id=request_id,
        project_id=project_id,
        change_set_id=str(change_set.id),
        tasks=tasks,
        queue_enqueue_fn=queue.enqueue,
    )


def run_memory_task(*, task_id: str) -> str:
    """
    RQ worker entrypoint. Consumes MemoryTask and records result to DB.
    """

    db = SessionLocal()
    try:
        task = db.get(MemoryTask, task_id)
        if task is None:
            log_event(logger, "warning", event="MEMORY_TASK_MISSING", task_id=task_id)
            return task_id

        if str(task.status) in {"succeeded", "failed", "running"}:
            return task_id

        task.status = "running"
        task.started_at = utc_now()
        db.commit()

        kind = str(task.kind)
        project_id = str(task.project_id)

        result = _run_memory_task_kind(
            kind=kind,
            task_id=task_id,
            project_id=project_id,
            db=db,
            session_factory=SessionLocal,
            rebuild_fractal_memory_fn=rebuild_fractal_memory,
            vector_embedding_overrides_fn=vector_embedding_overrides,
            vector_rag_status_fn=vector_rag_status,
            build_project_chunks_fn=build_project_chunks,
            rebuild_project_fn=rebuild_project,
            project_settings_model=ProjectSettings,
        )

        task.status = "succeeded"
        task.result_json = _compact_json_dumps(result)
        task.finished_at = utc_now()
        db.commit()

        log_event(
            logger,
            "info",
            event="MEMORY_TASK_SUCCEEDED",
            task_id=task_id,
            project_id=str(task.project_id),
            kind=kind,
        )
        return task_id
    except Exception as exc:
        try:
            task2 = db.get(MemoryTask, task_id)
            if task2 is not None:
                task2.status = "failed"
                task2.error_json = _compact_json_dumps(_build_memory_task_error_payload(exc, message_limit=400))
                task2.finished_at = utc_now()
                db.commit()
        except Exception:
            db.rollback()

        log_event(
            logger,
            "error",
            event="MEMORY_TASK_FAILED",
            task_id=task_id,
            error_type=type(exc).__name__,
            **exception_log_fields(exc),
        )
        return task_id
    finally:
        db.close()


def rollback_memory_change_set(
    *,
    db: Session,
    request_id: str,
    actor_user_id: str,
    change_set: MemoryChangeSet,
) -> dict[str, Any]:
    project_id = str(change_set.project_id)
    if change_set.status == "rolled_back":
        return {"idempotent": True, "change_set": _change_set_to_dict(change_set), "warnings": []}
    if change_set.status != "applied":
        raise AppError.conflict(details={"status": change_set.status})

    items = _load_change_set_items(db=db, change_set_id=str(change_set.id), descending=True)
    if not items:
        raise AppError.validation(details={"reason": "no_items"})

    try:
        warnings = _rollback_change_set_items(
            db=db,
            items=items,
            project_id=project_id,
            compact_json_loads_fn=_compact_json_loads,
            load_target_row_fn=_load_target_row,
            apply_upsert_fn=_apply_upsert,
            parse_dt_fn=_parse_dt,
            now_fn=utc_now,
        )

        change_set.status = "rolled_back"
        change_set.rolled_back_at = utc_now()

        db.commit()

        log_event(
            logger,
            "info",
            event="MEMORY_CHANGESET_ROLLED_BACK",
            change_set_id=str(change_set.id),
            project_id=project_id,
            actor_user_id=actor_user_id,
            warnings_count=len(warnings),
        )
        return {"idempotent": False, "change_set": _change_set_to_dict(change_set), "warnings": warnings}
    except AppError:
        raise
    except Exception as exc:
        db.rollback()
        log_event(
            logger,
            "error",
            event="MEMORY_CHANGESET_ROLLBACK_ERROR",
            change_set_id=str(change_set.id),
            project_id=project_id,
            **exception_log_fields(exc),
        )
        raise
