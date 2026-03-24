from __future__ import annotations

from pathlib import Path

from app.core.config import Settings
from scripts.guards.base import GuardContext, GuardFinding, GuardResult

GUARD_ID = "deployment-security-guard"


def _has_required_env_keys(env_example: Path) -> tuple[str, ...]:
    if not env_example.exists():
        return ("backend/.env.example missing",)
    content = env_example.read_text(encoding="utf-8")
    missing = []
    for key in ("SECRET_ENCRYPTION_KEY", "CORS_ORIGINS", "REDIS_URL"):
        if key not in content:
            missing.append(f"{key} missing from backend/.env.example")
    return tuple(missing)


def run(context: GuardContext) -> GuardResult:
    findings: list[GuardFinding] = []
    for message in _has_required_env_keys(context.backend_root / ".env.example"):
        findings.append(GuardFinding(severity="error", message=message))

    try:
        Settings(
            app_env="prod",
            secret_encryption_key="0123456789abcdef0123456789abcdef",
            auth_dev_fallback_user_id=None,
            cors_origins="https://app.example.com,https://admin.example.com",
            auth_admin_password="StrongAdminPass!234",
            task_queue_backend="rq",
            redis_url="redis://localhost:6379/0",
        )
    except Exception as exc:
        findings.append(GuardFinding(severity="error", message=f"prod settings contract invalid: {exc}"))

    return GuardResult(guard_id=GUARD_ID, findings=tuple(findings))

