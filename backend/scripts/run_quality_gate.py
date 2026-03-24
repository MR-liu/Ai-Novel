from __future__ import annotations

import subprocess
import sys
from pathlib import Path


BACKEND_ROOT = Path(__file__).resolve().parents[1]
REPO_ROOT = BACKEND_ROOT.parent
PYTHON = sys.executable


def run_step(*args: str) -> None:
    cmd = [PYTHON, *args]
    print(f"[quality] {' '.join(cmd)}")
    subprocess.run(cmd, cwd=BACKEND_ROOT, check=True)


def main() -> int:
    guard_dir = REPO_ROOT / "scripts" / "guards"
    run_step("-m", "compileall", "-q", "app", "alembic", "tests", "scripts", str(guard_dir))
    run_step("-m", "ruff", "check", "app", "tests", "scripts", str(guard_dir))
    run_step(str(guard_dir / "run.py"))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
