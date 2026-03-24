from __future__ import annotations

import argparse
import subprocess
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from scripts import REPO_ROOT
from scripts.run_gate import LAYER_ORDER

PROFILE_LAYERS: dict[str, tuple[str, ...]] = {
    "default": ("smoke", "contract"),
    "release": ("smoke", "contract", "critical", "full"),
    "perf": ("perf-smoke",),
}


def _normalize_layers(raw: str) -> tuple[str, ...]:
    layers = tuple(part.strip() for part in raw.split(",") if part.strip())
    invalid = [layer for layer in layers if layer not in LAYER_ORDER]
    if invalid:
        raise ValueError(f"unknown layers: {', '.join(invalid)}")
    return layers


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Run repository regression profiles.")
    parser.add_argument("--profile", choices=tuple(PROFILE_LAYERS))
    parser.add_argument("--layers")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args(argv)

    if args.layers:
        layers = _normalize_layers(args.layers)
    else:
        layers = PROFILE_LAYERS.get(args.profile or "default", PROFILE_LAYERS["default"])

    print(f"[regression] layers={' -> '.join(layers)}")
    cmd = [sys.executable, str(REPO_ROOT / "scripts" / "run_gate.py")]
    for layer in layers:
        cmd.extend(["--layer", layer])
    if args.dry_run:
        cmd.append("--dry-run")
    completed = subprocess.run(cmd, cwd=REPO_ROOT, check=False)
    return int(completed.returncode)


if __name__ == "__main__":
    raise SystemExit(main())
