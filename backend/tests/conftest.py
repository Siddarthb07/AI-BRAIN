import os
import sys
from pathlib import Path

import pytest

BACKEND = Path(__file__).resolve().parents[1]
if str(BACKEND) not in sys.path:
    sys.path.insert(0, str(BACKEND))

os.environ.setdefault("DEMO_MODE", "false")
os.environ.setdefault("VAULT_PATH", str(BACKEND / "data" / "test_vault"))


@pytest.fixture(autouse=True)
def fast_llm(monkeypatch):
    """Avoid slow/hanging real Ollama calls during CI and stress tests."""

    async def fake_chat(messages):
        user = next((m["content"] for m in reversed(messages) if m.get("role") == "user"), "")
        return f"Test reply: {user[:120]}"

    async def fake_assemble_context(message, include_context=True):
        return "", []

    import app.services.jarvis_orchestrator as jol
    import app.services.llm_client as llm_mod

    monkeypatch.setattr(llm_mod.llm_client, "chat", fake_chat)
    monkeypatch.setattr(jol, "assemble_context", fake_assemble_context)


def _reset_settings_cache():
    from app.services.config import get_settings

    get_settings.cache_clear()


@pytest.fixture
def client():
    _reset_settings_cache()
    from fastapi.testclient import TestClient
    from app.main import app

    return TestClient(app)


@pytest.fixture
def vault_root(tmp_path, monkeypatch):
    monkeypatch.setenv("VAULT_PATH", str(tmp_path))
    _reset_settings_cache()
    return tmp_path
