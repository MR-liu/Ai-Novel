from __future__ import annotations

from app.services.prompt_preset_integrity import collect_prompt_preset_integrity
from scripts.guards.base import GuardContext, GuardFinding, GuardResult

GUARD_ID = "prompt-preset-integrity-guard"


def run(context: GuardContext) -> GuardResult:
    report = collect_prompt_preset_integrity(base_dir=context.backend_root / "app" / "resources" / "prompt_presets")
    findings = [
        GuardFinding(
            severity=issue.severity,
            message=f"{issue.resource_key}:{issue.path}: {issue.message}",
        )
        for issue in report.issues
    ]
    findings.extend(
        GuardFinding(
            severity="error",
            message=f"{result.resource_key}:{result.path}: canary failed for {result.block_identifier}",
        )
        for result in report.canaries
        if not result.passed
    )
    return GuardResult(guard_id=GUARD_ID, findings=tuple(findings))

