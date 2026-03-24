from __future__ import annotations

import logging
import time
from dataclasses import dataclass
from typing import Any, Callable

from app.core.config import settings
from app.core.logging import log_event
from app.services.embedding_service import embed_texts as embed_texts_with_providers
from app.services.vector_models import VectorChunk

logger = logging.getLogger("ainovel")


@dataclass(frozen=True, slots=True)
class VectorBackendHooks:
    vector_enabled_reason: Callable[..., tuple[bool, str | None]]
    prefer_pgvector: Callable[[], bool]
    pgvector_upsert_chunks: Callable[..., dict[str, Any]]
    pgvector_delete_project: Callable[..., None]
    get_collection: Callable[..., Any]
    import_chromadb: Callable[[], Any]
    default_chroma_persist_dir: Callable[[], str]
    normalize_kb_id: Callable[[str | None], str]
    legacy_collection_name: Callable[[str], str]
    hash_collection_name: Callable[[str, str | None], str]
    chroma_collection_naming: Callable[[], str]


def _build_chroma_client(*, hooks: VectorBackendHooks) -> Any:
    chromadb = hooks.import_chromadb()
    persist_dir = settings.vector_chroma_persist_dir or hooks.default_chroma_persist_dir()
    return chromadb.PersistentClient(path=persist_dir)


def ingest_chunks_via_backend(
    *,
    project_id: str,
    kb_id: str | None,
    chunks: list[VectorChunk],
    embedding: dict[str, str | None] | None,
    hooks: VectorBackendHooks,
) -> dict[str, Any]:
    enabled, disabled_reason = hooks.vector_enabled_reason(embedding=embedding)
    if not enabled:
        return {"enabled": False, "skipped": True, "disabled_reason": disabled_reason, "ingested": 0}

    start = time.perf_counter()
    texts = [chunk.text for chunk in chunks]
    ids = [chunk.id for chunk in chunks]
    metadatas = [chunk.metadata for chunk in chunks]

    embeddings: list[list[float]] = []
    if texts:
        embed_out = embed_texts_with_providers(texts, embedding=embedding)
        if not bool(embed_out.get("enabled")):
            disabled = str(embed_out.get("disabled_reason") or "error")
            log_event(
                logger,
                "warning",
                event="VECTOR_RAG",
                action="ingest",
                project_id=project_id,
                disabled_reason=disabled,
                error_type="EmbeddingError",
            )
            return {
                "enabled": False,
                "skipped": True,
                "disabled_reason": disabled,
                "error": embed_out.get("error"),
                "ingested": 0,
            }
        embeddings = embed_out.get("vectors") or []

    embed_ms = int((time.perf_counter() - start) * 1000)

    if hooks.prefer_pgvector():
        try:
            write_start = time.perf_counter()
            out = hooks.pgvector_upsert_chunks(project_id=project_id, chunks=chunks, embeddings=embeddings)
            write_ms = int((time.perf_counter() - write_start) * 1000)
            log_event(
                logger,
                "info",
                event="VECTOR_RAG",
                action="ingest",
                project_id=project_id,
                chunks=len(chunks),
                timings_ms={"embed": embed_ms, "upsert": write_ms},
                backend="pgvector",
            )
            return {**out, "timings_ms": {"embed": embed_ms, "upsert": write_ms}, "backend": "pgvector"}
        except Exception as exc:  # pragma: no cover - env dependent
            log_event(
                logger,
                "warning",
                event="VECTOR_RAG",
                action="ingest",
                project_id=project_id,
                backend="pgvector",
                fallback="chroma",
                error_type=type(exc).__name__,
            )

    try:
        collection = hooks.get_collection(project_id=project_id, kb_id=kb_id)
    except Exception as exc:  # pragma: no cover - env dependent
        return {"enabled": False, "skipped": True, "disabled_reason": "chroma_unavailable", "error": str(exc), "ingested": 0}

    write_start = time.perf_counter()
    collection.upsert(ids=ids, documents=texts, metadatas=metadatas, embeddings=embeddings)
    write_ms = int((time.perf_counter() - write_start) * 1000)

    log_event(
        logger,
        "info",
        event="VECTOR_RAG",
        action="ingest",
        project_id=project_id,
        chunks=len(chunks),
        timings_ms={"embed": embed_ms, "upsert": write_ms},
        backend="chroma",
    )
    return {
        "enabled": True,
        "skipped": False,
        "ingested": len(chunks),
        "timings_ms": {"embed": embed_ms, "upsert": write_ms},
        "backend": "chroma",
    }


def rebuild_project_via_backend(
    *,
    project_id: str,
    kb_id: str | None,
    chunks: list[VectorChunk],
    embedding: dict[str, str | None] | None,
    hooks: VectorBackendHooks,
    ingest_chunks_fn: Callable[..., dict[str, Any]],
) -> dict[str, Any]:
    enabled, disabled_reason = hooks.vector_enabled_reason(embedding=embedding)
    if not enabled:
        return {"enabled": False, "skipped": True, "disabled_reason": disabled_reason, "rebuilt": 0}

    if hooks.prefer_pgvector():
        try:
            hooks.pgvector_delete_project(project_id=project_id)
        except Exception as exc:  # pragma: no cover - env dependent
            log_event(
                logger,
                "warning",
                event="VECTOR_RAG",
                action="rebuild",
                project_id=project_id,
                backend="pgvector",
                error_type=type(exc).__name__,
            )
        out = ingest_chunks_fn(project_id=project_id, kb_id=kb_id, chunks=chunks, embedding=embedding)
        return {
            "enabled": bool(out.get("enabled")),
            "skipped": bool(out.get("skipped")),
            "rebuilt": int(out.get("ingested") or 0),
            **out,
        }

    try:
        client = _build_chroma_client(hooks=hooks)
        kb = hooks.normalize_kb_id(kb_id)
        legacy_name = hooks.legacy_collection_name(project_id)
        hash_name = hooks.hash_collection_name(project_id, kb)
        naming = hooks.chroma_collection_naming()
        if kb != "default":
            names = {hash_name}
        else:
            names = {legacy_name} if naming == "legacy" else {hash_name, legacy_name}
        for name in names:
            try:
                client.delete_collection(name=name)
            except Exception:
                pass
    except Exception as exc:  # pragma: no cover - env dependent
        return {"enabled": False, "skipped": True, "disabled_reason": "chroma_unavailable", "error": str(exc), "rebuilt": 0}

    out = ingest_chunks_fn(project_id=project_id, kb_id=kb_id, chunks=chunks, embedding=embedding)
    return {
        "enabled": bool(out.get("enabled")),
        "skipped": bool(out.get("skipped")),
        "rebuilt": int(out.get("ingested") or 0),
        **out,
    }


def purge_project_vectors_via_backend(
    *,
    project_id: str,
    kb_id: str | None,
    hooks: VectorBackendHooks,
) -> dict[str, Any]:
    t0 = time.perf_counter()

    if hooks.prefer_pgvector():
        try:
            hooks.pgvector_delete_project(project_id=project_id)
            out = {"enabled": True, "skipped": False, "deleted": True, "backend": "pgvector"}
            log_event(
                logger,
                "info",
                event="VECTOR_RAG",
                action="purge",
                project_id=project_id,
                backend="pgvector",
                deleted=True,
                timings_ms={"total": int((time.perf_counter() - t0) * 1000)},
            )
            out["timings_ms"] = {"total": int((time.perf_counter() - t0) * 1000)}
            return out
        except Exception as exc:  # pragma: no cover - env dependent
            log_event(
                logger,
                "warning",
                event="VECTOR_RAG",
                action="purge",
                project_id=project_id,
                backend="pgvector",
                deleted=False,
                error_type=type(exc).__name__,
                timings_ms={"total": int((time.perf_counter() - t0) * 1000)},
            )
            return {
                "enabled": True,
                "skipped": True,
                "deleted": False,
                "backend": "pgvector",
                "error": str(exc),
                "error_type": type(exc).__name__,
                "timings_ms": {"total": int((time.perf_counter() - t0) * 1000)},
            }

    try:
        client = _build_chroma_client(hooks=hooks)
        kb = hooks.normalize_kb_id(kb_id)
        names = [hooks.hash_collection_name(project_id, kb)]
        if kb == "default":
            names.append(hooks.legacy_collection_name(project_id))
        delete_errors: list[str] = []
        delete_error_type: str | None = None
        deleted = True
        for name in names:
            try:
                client.delete_collection(name=name)
            except Exception as exc:  # pragma: no cover - env dependent
                message = str(exc)
                message_lower = message.lower()
                if "does not exist" in message_lower or "not found" in message_lower:
                    continue
                deleted = False
                delete_errors.append(f"{name}: {message}")
                delete_error_type = delete_error_type or type(exc).__name__

        error = "; ".join(delete_errors) if delete_errors else None
        error_type = delete_error_type

        out: dict[str, Any] = {
            "enabled": True,
            "skipped": False,
            "deleted": bool(deleted),
            "backend": "chroma",
            "timings_ms": {"total": int((time.perf_counter() - t0) * 1000)},
        }
        if error:
            out.update({"error": error, "error_type": error_type})
            log_event(
                logger,
                "warning",
                event="VECTOR_RAG",
                action="purge",
                project_id=project_id,
                backend="chroma",
                deleted=bool(deleted),
                error_type=error_type,
                timings_ms=out["timings_ms"],
            )
        else:
            log_event(
                logger,
                "info",
                event="VECTOR_RAG",
                action="purge",
                project_id=project_id,
                backend="chroma",
                deleted=True,
                timings_ms=out["timings_ms"],
            )
        return out
    except Exception as exc:  # pragma: no cover - env dependent
        log_event(
            logger,
            "warning",
            event="VECTOR_RAG",
            action="purge",
            project_id=project_id,
            backend="chroma",
            deleted=False,
            error_type=type(exc).__name__,
            timings_ms={"total": int((time.perf_counter() - t0) * 1000)},
        )
        return {
            "enabled": False,
            "skipped": True,
            "deleted": False,
            "backend": "chroma",
            "disabled_reason": "chroma_unavailable",
            "error": str(exc),
            "error_type": type(exc).__name__,
            "timings_ms": {"total": int((time.perf_counter() - t0) * 1000)},
        }
