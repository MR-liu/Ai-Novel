from __future__ import annotations

import unittest
from datetime import timedelta

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.db.base import Base
from app.db.utils import utc_now
from app.models.generation_run import GenerationRun
from app.models.project import Project
from app.models.structured_memory import MemoryChangeSet
from app.models.user import User
from app.services.memory_update_service import list_memory_change_sets


class TestMemoryChangeSetViews(unittest.TestCase):
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
                GenerationRun.__table__,
                MemoryChangeSet.__table__,
            ],
        )
        self.SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)

        now = utc_now()
        with self.SessionLocal() as db:
            db.add(User(id="u1", display_name="u1"))
            db.add(Project(id="p1", owner_user_id="u1", name="p1", genre=None, logline=None))
            db.add(
                GenerationRun(
                    id="gr1",
                    project_id="p1",
                    actor_user_id="u1",
                    chapter_id="c1",
                    type="memory_update_propose",
                    provider=None,
                    model=None,
                    request_id="rid-1",
                    prompt_system="",
                    prompt_user="",
                    prompt_render_log_json=None,
                    params_json="{}",
                    output_text="{}",
                    error_json=None,
                )
            )
            db.add_all(
                [
                    MemoryChangeSet(
                        id="cs_newest",
                        project_id="p1",
                        actor_user_id="u1",
                        generation_run_id="gr1",
                        request_id="rid-newest",
                        idempotency_key="k-newest",
                        title="Newest",
                        summary_md=None,
                        status="proposed",
                        created_at=now,
                    ),
                    MemoryChangeSet(
                        id="cs_mid",
                        project_id="p1",
                        actor_user_id="u1",
                        generation_run_id=None,
                        request_id="rid-mid",
                        idempotency_key="k-mid",
                        title="Mid",
                        summary_md=None,
                        status="applied",
                        created_at=now - timedelta(minutes=5),
                    ),
                    MemoryChangeSet(
                        id="cs_oldest",
                        project_id="p1",
                        actor_user_id="u1",
                        generation_run_id=None,
                        request_id="rid-oldest",
                        idempotency_key="k-oldest",
                        title="Oldest",
                        summary_md=None,
                        status="failed",
                        created_at=now - timedelta(minutes=10),
                    ),
                ]
            )
            db.commit()

    def test_list_memory_change_sets_supports_status_and_pagination(self) -> None:
        with self.SessionLocal() as db:
            page1 = list_memory_change_sets(db=db, project_id="p1", status=None, before=None, limit=2)

        items1 = page1.get("items") or []
        self.assertEqual([item.get("id") for item in items1], ["cs_newest", "cs_mid"])
        self.assertEqual(items1[0].get("chapter_id"), "c1")
        self.assertTrue(str(page1.get("next_before") or "").strip())

        with self.SessionLocal() as db:
            page2 = list_memory_change_sets(
                db=db,
                project_id="p1",
                status=None,
                before=str(page1.get("next_before") or ""),
                limit=2,
            )
            applied_only = list_memory_change_sets(db=db, project_id="p1", status="applied", before=None, limit=10)

        items2 = page2.get("items") or []
        self.assertEqual([item.get("id") for item in items2], ["cs_oldest"])
        self.assertIsNone(page2.get("next_before"))
        self.assertEqual([item.get("id") for item in (applied_only.get("items") or [])], ["cs_mid"])


if __name__ == "__main__":
    unittest.main()
