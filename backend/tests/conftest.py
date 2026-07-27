import os
import sys
from pathlib import Path

import pytest

# Ensure backend package imports
BACKEND = Path(__file__).resolve().parent.parent
if str(BACKEND) not in sys.path:
    sys.path.insert(0, str(BACKEND))

os.environ.setdefault("DEMO_MODE", "0")
os.environ.setdefault("VAULT_PATH", str(BACKEND / "data" / "test_vault"))


@pytest.fixture(autouse=True)
def fast_llm(monkeypatch):
    """Avoid slow/hanging real Ollama calls during CI and stress tests."""

    async def fake_chat_completion(prompt, system="", context="", history=None):
        prior = ""
        if history:
            prior = " | ".join(f"{t.get('role')}:{t.get('content', '')[:40]}" for t in history[-4:])
        suffix = f" [mem:{prior}]" if prior else ""
        return f"Test reply: {prompt[:120]}{suffix}"

    async def fake_chat_completion_stream(prompt, system="", context="", history=None):
        text = await fake_chat_completion(prompt, system=system, context=context, history=history)
        # Yield in two chunks to exercise streaming
        mid = max(1, len(text) // 2)
        yield text[:mid]
        yield text[mid:]

    async def fake_assemble_context(message, include_context=True):
        return "", []

    import services.jarvis_orchestrator as jol
    import services.llm as llm

    monkeypatch.setattr(llm, "chat_completion", fake_chat_completion)
    monkeypatch.setattr(llm, "chat_completion_stream", fake_chat_completion_stream)
    monkeypatch.setattr(jol, "assemble_context", fake_assemble_context)


@pytest.fixture
def client():
    from fastapi.testclient import TestClient
    from main import app

    return TestClient(app)


@pytest.fixture
def vault_root(tmp_path, monkeypatch):
    monkeypatch.setenv("VAULT_PATH", str(tmp_path))
    return tmp_path
