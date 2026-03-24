from __future__ import annotations

from scripts.guards.base import GuardRegistryEntry
from scripts.guards.deployment_security_guard import GUARD_ID as DEPLOYMENT_SECURITY_GUARD_ID
from scripts.guards.deployment_security_guard import run as run_deployment_security_guard
from scripts.guards.prompt_preset_integrity_guard import GUARD_ID as PROMPT_PRESET_INTEGRITY_GUARD_ID
from scripts.guards.prompt_preset_integrity_guard import run as run_prompt_preset_integrity_guard

REGISTRY: dict[str, GuardRegistryEntry] = {
    DEPLOYMENT_SECURITY_GUARD_ID: ("Deployment security baseline", run_deployment_security_guard),
    PROMPT_PRESET_INTEGRITY_GUARD_ID: ("Prompt preset integrity", run_prompt_preset_integrity_guard),
}

