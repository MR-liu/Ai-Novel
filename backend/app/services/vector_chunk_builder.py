from __future__ import annotations

from typing import cast

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.chapter import Chapter
from app.models.outline import Outline
from app.models.story_memory import StoryMemory
from app.models.worldbook_entry import WorldBookEntry
from app.services.vector_models import ALL_VECTOR_SOURCES, VectorChunk, VectorSource


def _chunk_text(text: str, *, chunk_size: int, overlap: int) -> list[str]:
    s = (text or "").strip()
    if not s:
        return []
    if chunk_size <= 0:
        return [s]
    overlap = max(0, min(overlap, max(0, chunk_size - 1)))
    out: list[str] = []
    start = 0
    while start < len(s):
        end = min(len(s), start + chunk_size)
        piece = s[start:end].strip()
        if piece:
            out.append(piece)
        if end >= len(s):
            break
        start = max(0, end - overlap)
    return out


def build_project_chunks(
    *,
    db: Session,
    project_id: str,
    sources: list[VectorSource] | None = None,
) -> list[VectorChunk]:
    selected_sources = sources or list(ALL_VECTOR_SOURCES)
    chunk_size = int(settings.vector_chunk_size or 800)
    overlap = int(settings.vector_chunk_overlap or 120)

    out: list[VectorChunk] = []

    if "worldbook" in selected_sources:
        rows = (
            db.execute(
                select(WorldBookEntry)
                .where(WorldBookEntry.project_id == project_id)
                .where(WorldBookEntry.enabled == True)  # noqa: E712
                .order_by(WorldBookEntry.updated_at.desc())
            )
            .scalars()
            .all()
        )
        for entry in rows:
            title = (entry.title or "").strip()
            content = (entry.content_md or "").strip()
            text = f"{title}\n\n{content}".strip()
            for idx, chunk in enumerate(_chunk_text(text, chunk_size=chunk_size, overlap=overlap)):
                out.append(
                    VectorChunk(
                        id=f"worldbook:{entry.id}:{idx}",
                        text=chunk,
                        metadata={
                            "project_id": project_id,
                            "source": "worldbook",
                            "source_id": entry.id,
                            "title": title,
                            "chunk_index": idx,
                        },
                    )
                )

    if "outline" in selected_sources:
        rows = (
            db.execute(select(Outline).where(Outline.project_id == project_id).order_by(Outline.updated_at.desc()))
            .scalars()
            .all()
        )
        for outline in rows:
            title = (outline.title or "").strip()
            content = (outline.content_md or "").strip()
            text = f"{title}\n\n{content}".strip()
            for idx, chunk in enumerate(_chunk_text(text, chunk_size=chunk_size, overlap=overlap)):
                out.append(
                    VectorChunk(
                        id=f"outline:{outline.id}:{idx}",
                        text=chunk,
                        metadata={
                            "project_id": project_id,
                            "source": "outline",
                            "source_id": outline.id,
                            "title": title,
                            "chunk_index": idx,
                        },
                    )
                )

    if "chapter" in selected_sources:
        rows = (
            db.execute(select(Chapter).where(Chapter.project_id == project_id).order_by(Chapter.updated_at.desc()))
            .scalars()
            .all()
        )
        for chapter in rows:
            title = (chapter.title or "").strip()
            content = (chapter.content_md or "").strip()
            if not content:
                continue
            header = f"第 {int(chapter.number)} 章：{title}".strip("：")
            text = f"{header}\n\n{content}".strip()
            for idx, chunk in enumerate(_chunk_text(text, chunk_size=chunk_size, overlap=overlap)):
                out.append(
                    VectorChunk(
                        id=f"chapter:{chapter.id}:{idx}",
                        text=chunk,
                        metadata={
                            "project_id": project_id,
                            "source": "chapter",
                            "source_id": chapter.id,
                            "chapter_number": int(chapter.number),
                            "title": title,
                            "chunk_index": idx,
                        },
                    )
                )

    if "story_memory" in selected_sources:
        rows = (
            db.execute(select(StoryMemory).where(StoryMemory.project_id == project_id).order_by(StoryMemory.updated_at.desc()))
            .scalars()
            .all()
        )
        for memory in rows:
            title = (memory.title or "").strip()
            content = (memory.content or "").strip()
            if not content:
                continue
            header = f"[{str(memory.memory_type or '').strip() or 'story_memory'}] {title}".strip()
            text = f"{header}\n\n{content}".strip() if header else content
            for idx, chunk in enumerate(_chunk_text(text, chunk_size=chunk_size, overlap=overlap)):
                out.append(
                    VectorChunk(
                        id=f"story_memory:{memory.id}:{idx}",
                        text=chunk,
                        metadata={
                            "project_id": project_id,
                            "source": "story_memory",
                            "source_id": memory.id,
                            "title": title,
                            "chunk_index": idx,
                            "memory_type": str(memory.memory_type or "").strip(),
                            "chapter_id": str(memory.chapter_id or "") or None,
                            "story_timeline": int(memory.story_timeline or 0),
                            "is_foreshadow": bool(int(cast(int, memory.is_foreshadow or 0))),
                        },
                    )
                )

    return out
