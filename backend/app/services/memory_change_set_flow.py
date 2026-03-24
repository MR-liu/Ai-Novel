from __future__ import annotations

from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.structured_memory import MemoryChangeSet, MemoryChangeSetItem
from app.services.memory_change_set_views import change_set_item_to_dict, change_set_to_dict


def load_existing_change_set(
    *,
    db: Session,
    project_id: str,
    idempotency_key: str,
) -> MemoryChangeSet | None:
    return (
        db.execute(
            select(MemoryChangeSet).where(
                MemoryChangeSet.project_id == project_id,
                MemoryChangeSet.idempotency_key == idempotency_key,
            )
        )
        .scalars()
        .first()
    )


def load_change_set_items(
    *,
    db: Session,
    change_set_id: str,
    descending: bool = False,
) -> list[MemoryChangeSetItem]:
    order_by = MemoryChangeSetItem.item_index.desc() if descending else MemoryChangeSetItem.item_index.asc()
    return (
        db.execute(select(MemoryChangeSetItem).where(MemoryChangeSetItem.change_set_id == change_set_id).order_by(order_by))
        .scalars()
        .all()
    )


def build_change_set_response(
    *,
    change_set: MemoryChangeSet,
    items: list[MemoryChangeSetItem],
    idempotent: bool,
) -> dict[str, Any]:
    return {
        "idempotent": bool(idempotent),
        "change_set": change_set_to_dict(change_set),
        "items": [change_set_item_to_dict(item) for item in items],
    }


def find_existing_change_set_response(
    *,
    db: Session,
    project_id: str,
    idempotency_key: str,
) -> dict[str, Any] | None:
    existing = load_existing_change_set(db=db, project_id=project_id, idempotency_key=idempotency_key)
    if existing is None:
        return None
    items = load_change_set_items(db=db, change_set_id=str(existing.id))
    return build_change_set_response(change_set=existing, items=items, idempotent=True)
