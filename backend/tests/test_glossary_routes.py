from __future__ import annotations

import json
import unittest
from typing import Generator

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool
from starlette.testclient import TestClient

from app.api.routes import glossary as glossary_routes
from app.core.errors import AppError
from app.db.base import Base
from app.db.session import get_db
from app.main import app_error_handler, validation_error_handler
from app.models.chapter import Chapter
from app.models.glossary_term import GlossaryTerm
from app.models.outline import Outline
from app.models.project import Project
from app.models.project_membership import ProjectMembership
from app.models.project_settings import ProjectSettings
from app.models.project_source_document import ProjectSourceDocument
from app.models.user import User


def _make_test_app(SessionLocal: sessionmaker) -> FastAPI:
    app = FastAPI()

    @app.middleware("http")
    async def _test_user_middleware(request: Request, call_next):  # type: ignore[no-untyped-def]
        request.state.request_id = "rid-test"
        user_id = request.headers.get("X-Test-User")
        request.state.user_id = user_id
        request.state.authenticated_user_id = user_id
        request.state.session_expire_at = None
        request.state.auth_source = "test"
        return await call_next(request)

    app.add_exception_handler(AppError, app_error_handler)
    app.add_exception_handler(RequestValidationError, validation_error_handler)
    app.include_router(glossary_routes.router, prefix="/api")

    def _override_get_db() -> Generator[Session, None, None]:
        db = SessionLocal()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = _override_get_db
    return app


class TestGlossaryRoutes(unittest.TestCase):
    def setUp(self) -> None:
        engine = create_engine(
            "sqlite:///:memory:",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        self.addCleanup(engine.dispose)

        Base.metadata.create_all(
            engine,
            tables=[
                User.__table__,
                Project.__table__,
                ProjectMembership.__table__,
                GlossaryTerm.__table__,
                ProjectSettings.__table__,
                Outline.__table__,
                Chapter.__table__,
                ProjectSourceDocument.__table__,
            ],
        )
        self.SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)
        self.app = _make_test_app(self.SessionLocal)

        with self.SessionLocal() as db:
            db.add(User(id="u1", display_name="owner"))
            db.add(User(id="u2", display_name="other"))
            db.add(Project(id="p1", owner_user_id="u1", name="Project 1", genre=None, logline=None))
            db.add(Outline(id="o1", project_id="p1", title="Outline 1", content_md="", structure_json=None))
            db.add(
                GlossaryTerm(
                    id="term-enabled",
                    project_id="p1",
                    term="苍穹城",
                    aliases_json=json.dumps(["Skyhold"], ensure_ascii=False),
                    sources_json="[]",
                    origin="manual",
                    enabled=1,
                )
            )
            db.add(
                GlossaryTerm(
                    id="term-disabled",
                    project_id="p1",
                    term="镜海议会",
                    aliases_json=json.dumps(["Mirror Council"], ensure_ascii=False),
                    sources_json="[]",
                    origin="manual",
                    enabled=0,
                )
            )
            db.add(
                Chapter(
                    id="c1",
                    project_id="p1",
                    outline_id="o1",
                    number=1,
                    title="第 1 章",
                    plan="",
                    content_md="苍穹城(Skyhold) 星轨港(Starport) 镜海议会",
                    summary="",
                    status="done",
                )
            )
            db.add(
                ProjectSourceDocument(
                    id="d1",
                    project_id="p1",
                    actor_user_id="u1",
                    filename="notes.txt",
                    content_type="txt",
                    content_text="虚幕庭(Astral Court) 镜海议会",
                    status="done",
                    progress=100,
                    progress_message="done",
                    chunk_count=0,
                    kb_id="default",
                    vector_ingest_result_json=None,
                    worldbook_proposal_json=None,
                    story_memory_proposal_json=None,
                    error_message=None,
                )
            )
            db.commit()

    def test_list_filters_disabled_and_include_disabled(self) -> None:
        client = TestClient(self.app)

        resp = client.get("/api/projects/p1/glossary_terms", headers={"X-Test-User": "u1"})
        self.assertEqual(resp.status_code, 200)
        terms = (resp.json().get("data") or {}).get("terms") or []
        self.assertEqual([term.get("term") for term in terms], ["苍穹城"])

        resp2 = client.get(
            "/api/projects/p1/glossary_terms?include_disabled=1",
            headers={"X-Test-User": "u1"},
        )
        self.assertEqual(resp2.status_code, 200)
        terms2 = (resp2.json().get("data") or {}).get("terms") or []
        self.assertEqual({term.get("term") for term in terms2}, {"苍穹城", "镜海议会"})

    def test_create_update_delete_and_conflict(self) -> None:
        client = TestClient(self.app)

        create_resp = client.post(
            "/api/projects/p1/glossary_terms",
            headers={"X-Test-User": "u1"},
            json={"term": "星轨港", "aliases": ["Starport"], "enabled": 1},
        )
        self.assertEqual(create_resp.status_code, 200)
        created = (create_resp.json().get("data") or {}).get("term") or {}
        self.assertEqual(created.get("term"), "星轨港")

        conflict_resp = client.post(
            "/api/projects/p1/glossary_terms",
            headers={"X-Test-User": "u1"},
            json={"term": "星轨港", "aliases": [], "enabled": 1},
        )
        self.assertEqual(conflict_resp.status_code, 409)

        update_resp = client.put(
            f"/api/projects/p1/glossary_terms/{created.get('id')}",
            headers={"X-Test-User": "u1"},
            json={"aliases": ["Starport", "港口"], "enabled": 0},
        )
        self.assertEqual(update_resp.status_code, 200)
        updated = (update_resp.json().get("data") or {}).get("term") or {}
        self.assertEqual(updated.get("enabled"), 0)
        self.assertIn("港口", updated.get("aliases") or [])

        delete_resp = client.delete(
            f"/api/projects/p1/glossary_terms/{created.get('id')}",
            headers={"X-Test-User": "u1"},
        )
        self.assertEqual(delete_resp.status_code, 200)
        self.assertTrue((delete_resp.json().get("data") or {}).get("deleted"))

    def test_rebuild_creates_auto_terms_and_preserves_manual_terms(self) -> None:
        client = TestClient(self.app)

        rebuild_resp = client.post(
            "/api/projects/p1/glossary_terms/rebuild",
            headers={"X-Test-User": "u1"},
            json={"include_chapters": True, "include_imports": True, "max_terms_per_source": 60},
        )
        self.assertEqual(rebuild_resp.status_code, 200)
        data = rebuild_resp.json().get("data") or {}
        self.assertTrue(data.get("ok"))
        self.assertGreaterEqual(int(data.get("created") or 0), 1)

        list_resp = client.get(
            "/api/projects/p1/glossary_terms?include_disabled=1",
            headers={"X-Test-User": "u1"},
        )
        self.assertEqual(list_resp.status_code, 200)
        terms = (list_resp.json().get("data") or {}).get("terms") or []
        by_term = {term.get("term"): term for term in terms}
        self.assertIn("苍穹城", by_term)
        self.assertIn("星轨港", by_term)
        self.assertIn("虚幕庭", by_term)
        self.assertEqual(by_term["镜海议会"].get("origin"), "manual")

    def test_requires_project_access(self) -> None:
        client = TestClient(self.app)

        resp = client.get("/api/projects/p1/glossary_terms", headers={"X-Test-User": "u2"})
        self.assertEqual(resp.status_code, 404)


if __name__ == "__main__":
    unittest.main()
