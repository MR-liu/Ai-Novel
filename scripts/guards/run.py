from __future__ import annotations

import argparse
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from scripts.guards.base import GuardFinding, build_context
from scripts.guards.registry import REGISTRY


def _format_finding(finding: GuardFinding) -> str:
    return f"[{finding.severity}] {finding.message}"


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Run repository guard checks.")
    parser.add_argument("--guard", action="append", dest="guards", choices=tuple(REGISTRY))
    args = parser.parse_args(argv)

    selected = tuple(args.guards or REGISTRY.keys())
    context = build_context()
    has_errors = False
    for guard_id in selected:
        label, runner = REGISTRY[guard_id]
        result = runner(context)
        status = "FAILED" if result.has_errors else "OK"
        print(f"[guard] {guard_id} :: {label} :: {status}")
        for finding in result.findings:
            print(f"  {_format_finding(finding)}")
        has_errors = has_errors or result.has_errors
    return 1 if has_errors else 0


if __name__ == "__main__":
    raise SystemExit(main())
