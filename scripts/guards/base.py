from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Callable

from scripts import BACKEND_ROOT, FRONTEND_ROOT, REPO_ROOT


@dataclass(frozen=True, slots=True)
class GuardContext:
    repo_root: Path
    backend_root: Path
    frontend_root: Path


@dataclass(frozen=True, slots=True)
class GuardFinding:
    severity: str
    message: str


@dataclass(frozen=True, slots=True)
class GuardResult:
    guard_id: str
    findings: tuple[GuardFinding, ...] = ()

    @property
    def has_errors(self) -> bool:
        return any(finding.severity == "error" for finding in self.findings)


GuardRunner = Callable[[GuardContext], GuardResult]
GuardRegistryEntry = tuple[str, GuardRunner]


def build_context(repo_root: Path | None = None) -> GuardContext:
    effective_repo_root = Path(repo_root) if repo_root is not None else REPO_ROOT
    return GuardContext(
        repo_root=effective_repo_root,
        backend_root=effective_repo_root / "backend" if repo_root is not None else BACKEND_ROOT,
        frontend_root=effective_repo_root / "frontend" if repo_root is not None else FRONTEND_ROOT,
    )

