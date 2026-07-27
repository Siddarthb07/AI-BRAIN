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
        return max(512, int(os.getenv("LLM_MAX_TOKENS", "4096")))
    except ValueError:
        return 4096


def cors_origins() -> list[str]:
    raw = os.getenv(
        "CORS_ORIGINS",
        "http://localhost:3000,http://127.0.0.1:3000,http://localhost:5050,http://127.0.0.1:5050",
    )
    return [o.strip() for o in raw.split(",") if o.strip()]
