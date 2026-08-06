"""Central environment flags for JARVIS."""

from __future__ import annotations

import os


def _truthy(name: str, default: str = "0") -> bool:
    return os.getenv(name, default).strip().lower() in ("1", "true", "yes", "on")


def demo_mode() -> bool:
    return _truthy("DEMO_MODE", "0")


def dev_mode() -> bool:
    return _truthy("DEV_MODE", "0")


def graph_mode() -> str:
    return os.getenv("GRAPH_MODE", "mini").strip().lower()


def llm_max_tokens() -> int:
    try:
        return max(256, int(os.getenv("LLM_MAX_TOKENS", "1024")))
    except ValueError:
        return 1024


def cors_origins() -> list[str]:
    """
    Allowed browser origins.
    PUBLIC_MODE=1 → reflect any origin (demo / tunnel / LAN testing).
    Otherwise use CORS_ORIGINS CSV, plus common localhost ports.
    """
    if _truthy("PUBLIC_MODE", "0") or _truthy("JARVIS_PUBLIC", "0"):
        return ["*"]

    raw = os.getenv(
        "CORS_ORIGINS",
        "http://localhost:3000,http://127.0.0.1:3000,http://localhost:5050,http://127.0.0.1:5050",
    )
    origins = [o.strip() for o in raw.split(",") if o.strip()]
    # LAN helpers — still need the machine IP listed or use PUBLIC_MODE
    extra = os.getenv("CORS_EXTRA_ORIGINS", "")
    if extra:
        origins.extend([o.strip() for o in extra.split(",") if o.strip()])
    return origins or ["*"]
