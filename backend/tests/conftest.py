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


@pytest.fixture
def client():
    from fastapi.testclient import TestClient
    from main import app

    return TestClient(app)


@pytest.fixture
def vault_root(tmp_path, monkeypatch):
    monkeypatch.setenv("VAULT_PATH", str(tmp_path))
    return tmp_path
