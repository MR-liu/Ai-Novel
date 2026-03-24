from __future__ import annotations

import unittest
from unittest.mock import Mock, patch

from app.services.vector_backend_flow import (
    VectorBackendHooks,
    ingest_chunks_via_backend,
    purge_project_vectors_via_backend,
    rebuild_project_via_backend,
)
from app.services.vector_models import VectorChunk


class _FakeCollection:
    def __init__(self) -> None:
        self.upserts: list[dict[str, object]] = []

    def upsert(
        self,
        *,
        ids: list[str],
        documents: list[str] | None = None,
        metadatas: list[dict[str, object]] | None = None,
        embeddings: list[list[float]] | None = None,
    ) -> None:
        self.upserts.append(
            {
                "ids": list(ids),
                "documents": list(documents or []),
                "metadatas": list(metadatas or []),
                "embeddings": list(embeddings or []),
            }
        )


class _FakeChromaModule:
    def __init__(self, *, delete_errors: dict[str, Exception] | None = None) -> None:
        self.deleted_names: list[str] = []
        self._delete_errors = dict(delete_errors or {})

        def _make_client(*, path: str):
            return _FakeChromaClient(path=path, deleted_names=self.deleted_names, delete_errors=self._delete_errors)

        self.PersistentClient = _make_client


class _FakeChromaClient:
    def __init__(self, *, path: str, deleted_names: list[str], delete_errors: dict[str, Exception]) -> None:
        self.path = path
        self._deleted_names = deleted_names
        self._delete_errors = delete_errors

    def delete_collection(self, *, name: str) -> None:
        self._deleted_names.append(str(name))
        exc = self._delete_errors.get(str(name))
        if exc is not None:
            raise exc


def _make_hooks(
    *,
    prefer_pgvector: bool,
    collection: _FakeCollection | None = None,
    chroma_module: _FakeChromaModule | None = None,
    pgvector_upsert=Mock(return_value={"enabled": True, "skipped": False, "ingested": 0}),
    pgvector_delete=Mock(),
) -> VectorBackendHooks:
    return VectorBackendHooks(
        vector_enabled_reason=lambda **kwargs: (True, None),
        prefer_pgvector=lambda: prefer_pgvector,
        pgvector_upsert_chunks=pgvector_upsert,
        pgvector_delete_project=pgvector_delete,
        get_collection=lambda **kwargs: collection,
        import_chromadb=lambda: chroma_module,
        default_chroma_persist_dir=lambda: "/tmp/vector-chroma-test",
        normalize_kb_id=lambda kb_id: str(kb_id or "").strip() or "default",
        legacy_collection_name=lambda project_id: f"legacy-{project_id}",
        hash_collection_name=lambda project_id, kb_id=None: f"hash-{project_id}-{kb_id or 'default'}",
        chroma_collection_naming=lambda: "hash",
    )


class TestVectorBackendFlow(unittest.TestCase):
    def test_ingest_falls_back_to_chroma_when_pgvector_upsert_fails(self) -> None:
        collection = _FakeCollection()
        hooks = _make_hooks(
            prefer_pgvector=True,
            collection=collection,
            chroma_module=_FakeChromaModule(),
            pgvector_upsert=Mock(side_effect=RuntimeError("pgvector boom")),
        )

        with patch(
            "app.services.vector_backend_flow.embed_texts_with_providers",
            return_value={"enabled": True, "vectors": [[0.25, 0.75]]},
        ):
            out = ingest_chunks_via_backend(
                project_id="p1",
                kb_id="kb1",
                chunks=[
                    VectorChunk(
                        id="chunk-1",
                        text="dragon lore",
                        metadata={"source": "worldbook", "source_id": "wb1", "chunk_index": 0},
                    )
                ],
                embedding={"provider": "mock"},
                hooks=hooks,
            )

        self.assertTrue(out.get("enabled"))
        self.assertFalse(out.get("skipped"))
        self.assertEqual(out.get("backend"), "chroma")
        self.assertEqual(int(out.get("ingested") or 0), 1)
        self.assertEqual(len(collection.upserts), 1)
        self.assertEqual(collection.upserts[0]["ids"], ["chunk-1"])

    def test_rebuild_deletes_default_chroma_collections_before_reingest(self) -> None:
        chroma_module = _FakeChromaModule()
        hooks = _make_hooks(
            prefer_pgvector=False,
            collection=_FakeCollection(),
            chroma_module=chroma_module,
        )
        ingest_chunks_fn = Mock(return_value={"enabled": True, "skipped": False, "ingested": 2, "backend": "chroma"})

        out = rebuild_project_via_backend(
            project_id="p1",
            kb_id=None,
            chunks=[],
            embedding={"provider": "mock"},
            hooks=hooks,
            ingest_chunks_fn=ingest_chunks_fn,
        )

        self.assertTrue(out.get("enabled"))
        self.assertFalse(out.get("skipped"))
        self.assertEqual(int(out.get("rebuilt") or 0), 2)
        self.assertEqual(set(chroma_module.deleted_names), {"hash-p1-default", "legacy-p1"})
        ingest_chunks_fn.assert_called_once()

    def test_purge_ignores_missing_chroma_collections(self) -> None:
        chroma_module = _FakeChromaModule(
            delete_errors={
                "hash-p1-default": ValueError("collection does not exist"),
                "legacy-p1": ValueError("collection does not exist"),
            }
        )
        hooks = _make_hooks(
            prefer_pgvector=False,
            collection=_FakeCollection(),
            chroma_module=chroma_module,
        )

        out = purge_project_vectors_via_backend(project_id="p1", kb_id=None, hooks=hooks)

        self.assertTrue(out.get("enabled"))
        self.assertFalse(out.get("skipped"))
        self.assertTrue(out.get("deleted"))
        self.assertEqual(out.get("backend"), "chroma")
        self.assertEqual(chroma_module.deleted_names, ["hash-p1-default", "legacy-p1"])


if __name__ == "__main__":
    unittest.main()
