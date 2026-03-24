from __future__ import annotations

import argparse
import subprocess
import sys
from collections import OrderedDict
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable

REPO_ROOT = Path(__file__).resolve().parents[1]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from scripts import REPO_ROOT

COVERAGE_AREAS = ("route", "task", "config", "prompt")
LAYER_ORDER = ("smoke", "contract", "critical", "perf-smoke", "full")


@dataclass(frozen=True, slots=True)
class GateStep:
    step_id: str
    command: tuple[str, ...]
    coverage_areas: tuple[str, ...]


def _python() -> str:
    return sys.executable


def _build_step_catalog(repo_root: Path) -> dict[str, GateStep]:
    return {
        "backend-quality": GateStep(
            step_id="backend-quality",
            command=(_python(), str(repo_root / "backend" / "scripts" / "run_quality_gate.py")),
            coverage_areas=("route", "task", "config"),
        ),
        "playwright-api-contracts": GateStep(
            step_id="playwright-api-contracts",
            command=("npm", "--prefix", str(repo_root / "frontend"), "test"),
            coverage_areas=("route", "prompt"),
        ),
        "prompt-preset-integrity-guard": GateStep(
            step_id="prompt-preset-integrity-guard",
            command=(_python(), str(repo_root / "scripts" / "guards" / "run.py"), "--guard", "prompt-preset-integrity-guard"),
            coverage_areas=("prompt",),
        ),
        "deployment-security-guard": GateStep(
            step_id="deployment-security-guard",
            command=(_python(), str(repo_root / "scripts" / "guards" / "run.py"), "--guard", "deployment-security-guard"),
            coverage_areas=("config",),
        ),
        "playwright-perf-quick": GateStep(
            step_id="playwright-perf-quick",
            command=("npm", "--prefix", str(repo_root / "frontend"), "run", "build"),
            coverage_areas=("route", "task"),
        ),
        "playwright-full-regression": GateStep(
            step_id="playwright-full-regression",
            command=("npm", "--prefix", str(repo_root / "frontend"), "test"),
            coverage_areas=("route", "task", "prompt"),
        ),
        "db-snapshot-release": GateStep(
            step_id="db-snapshot-release",
            command=(_python(), "-m", "pytest", "tests/test_project_bundle_roundtrip.py"),
            coverage_areas=("task", "config"),
        ),
    }


def build_layers(repo_root: Path | None = None) -> "OrderedDict[str, tuple[GateStep, ...]]":
    effective_root = Path(repo_root) if repo_root is not None else REPO_ROOT
    steps = _build_step_catalog(effective_root)
    return OrderedDict(
        (
            ("smoke", (steps["backend-quality"],)),
            ("contract", (steps["playwright-api-contracts"], steps["prompt-preset-integrity-guard"])),
            ("critical", (steps["deployment-security-guard"],)),
            ("perf-smoke", (steps["playwright-perf-quick"],)),
            (
                "full",
                (
                    steps["backend-quality"],
                    steps["playwright-api-contracts"],
                    steps["prompt-preset-integrity-guard"],
                    steps["deployment-security-guard"],
                    steps["playwright-full-regression"],
                    steps["db-snapshot-release"],
                ),
            ),
        )
    )


def layer_coverage(layers: "OrderedDict[str, tuple[GateStep, ...]]", layer_name: str) -> tuple[str, ...]:
    seen: list[str] = []
    for step in layers.get(layer_name, ()):
        for area in step.coverage_areas:
            if area not in seen:
                seen.append(area)
    return tuple(seen)


def _iter_selected_steps(layers: "OrderedDict[str, tuple[GateStep, ...]]", selected_layers: Iterable[str]) -> Iterable[tuple[str, GateStep]]:
    for layer_name in selected_layers:
        for step in layers[layer_name]:
            yield layer_name, step


def _run_step(repo_root: Path, step: GateStep, *, dry_run: bool) -> int:
    cmd_display = " ".join(step.command)
    print(f"- {step.step_id} :: {cmd_display}")
    if dry_run:
        return 0
    completed = subprocess.run(step.command, cwd=repo_root, check=False)
    return int(completed.returncode)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Run repository quality gate layers.")
    parser.add_argument("--layer", action="append", dest="layers", choices=LAYER_ORDER)
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args(argv)

    selected_layers = tuple(args.layers or ("smoke",))
    layers = build_layers(REPO_ROOT)
    print(f"[gate] layers={' -> '.join(selected_layers)}")
    for layer_name, step in _iter_selected_steps(layers, selected_layers):
        result = _run_step(REPO_ROOT, step, dry_run=bool(args.dry_run))
        if result != 0:
            print(f"[gate] layer={layer_name} step={step.step_id} failed with exit={result}")
            return result
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
