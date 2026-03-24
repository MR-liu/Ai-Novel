from __future__ import annotations

from typing import Any, Callable

from app.core.errors import AppError


def build_change_set_item_warning(
    *,
    code: str,
    message: str,
    item_id: str,
    target_table: str,
    target_id: str,
) -> dict[str, Any]:
    return {
        "code": code,
        "message": message,
        "item_id": item_id,
        "target_table": target_table,
        "target_id": target_id,
    }


def apply_change_set_items(
    *,
    db: Any,
    items: list[Any],
    project_id: str,
    compact_json_loads_fn: Callable[[str | None], Any | None],
    load_target_row_fn: Callable[..., Any | None],
    row_payload_fn: Callable[[str, Any], dict[str, Any]],
    apply_upsert_fn: Callable[..., Any],
    now_fn: Callable[[], Any],
) -> list[dict[str, Any]]:
    warnings: list[dict[str, Any]] = []

    for item in items:
        item_id = str(item.id)
        target_table = str(item.target_table)
        target_id = str(item.target_id or "")
        if not target_id:
            raise AppError.validation(details={"item_id": item_id, "reason": "target_id_missing"})

        before_expected = compact_json_loads_fn(item.before_json)
        current_row = load_target_row_fn(db, target_table=target_table, project_id=project_id, target_id=target_id)
        if isinstance(before_expected, dict):
            current_dict = row_payload_fn(target_table, current_row) if current_row is not None else None
            if current_dict != before_expected:
                warnings.append(
                    build_change_set_item_warning(
                        code="MEMORY_CONFLICT",
                        message="Target changed since propose; applied anyway",
                        item_id=item_id,
                        target_table=target_table,
                        target_id=target_id,
                    )
                )

        if item.op == "delete":
            if current_row is None:
                warnings.append(
                    build_change_set_item_warning(
                        code="MISSING_TARGET",
                        message="Target not found during apply delete; skipped",
                        item_id=item_id,
                        target_table=target_table,
                        target_id=target_id,
                    )
                )
                continue
            if target_table == "project_table_rows":
                db.delete(current_row)
            else:
                current_row.deleted_at = now_fn()  # type: ignore[attr-defined]
            continue

        after_value = compact_json_loads_fn(item.after_json)
        if not isinstance(after_value, dict):
            raise AppError.validation(details={"item_id": item_id, "reason": "after_json_invalid"})
        apply_upsert_fn(db, target_table=target_table, project_id=project_id, target_id=target_id, after=after_value)

    return warnings


def rollback_change_set_items(
    *,
    db: Any,
    items: list[Any],
    project_id: str,
    compact_json_loads_fn: Callable[[str | None], Any | None],
    load_target_row_fn: Callable[..., Any | None],
    apply_upsert_fn: Callable[..., Any],
    parse_dt_fn: Callable[[object], Any | None],
    now_fn: Callable[[], Any],
) -> list[dict[str, Any]]:
    warnings: list[dict[str, Any]] = []

    for item in items:
        item_id = str(item.id)
        target_table = str(item.target_table)
        target_id = str(item.target_id or "")
        if not target_id:
            continue

        before_value = compact_json_loads_fn(item.before_json)
        current_row = load_target_row_fn(db, target_table=target_table, project_id=project_id, target_id=target_id)

        if item.op == "delete":
            if target_table == "project_table_rows":
                if not isinstance(before_value, dict):
                    warnings.append(
                        build_change_set_item_warning(
                            code="MISSING_BEFORE",
                            message="Missing before_json for table row rollback; skipped",
                            item_id=item_id,
                            target_table=target_table,
                            target_id=target_id,
                        )
                    )
                    continue
                after_restore = dict(before_value)
                after_restore.pop("id", None)
                apply_upsert_fn(
                    db,
                    target_table=target_table,
                    project_id=project_id,
                    target_id=target_id,
                    after=after_restore,
                )
                continue
            if current_row is None:
                warnings.append(
                    build_change_set_item_warning(
                        code="MISSING_TARGET",
                        message="Target not found during rollback delete; skipped",
                        item_id=item_id,
                        target_table=target_table,
                        target_id=target_id,
                    )
                )
                continue
            if isinstance(before_value, dict):
                current_row.deleted_at = parse_dt_fn(before_value.get("deleted_at"))  # type: ignore[attr-defined]
            else:
                current_row.deleted_at = None  # type: ignore[attr-defined]
            continue

        if current_row is None:
            warnings.append(
                build_change_set_item_warning(
                    code="MISSING_TARGET",
                    message="Target not found during rollback upsert; skipped",
                    item_id=item_id,
                    target_table=target_table,
                    target_id=target_id,
                )
            )
            continue

        if not isinstance(before_value, dict):
            if target_table == "project_table_rows":
                db.delete(current_row)
            else:
                current_row.deleted_at = now_fn()  # type: ignore[attr-defined]
            continue

        after_restore = dict(before_value)
        after_restore.pop("id", None)
        if target_table != "project_table_rows":
            after_restore["deleted_at"] = before_value.get("deleted_at")
        apply_upsert_fn(
            db,
            target_table=target_table,
            project_id=project_id,
            target_id=target_id,
            after=after_restore,
        )
        if target_table != "project_table_rows":
            current_row.deleted_at = parse_dt_fn(before_value.get("deleted_at"))  # type: ignore[attr-defined]

    return warnings
