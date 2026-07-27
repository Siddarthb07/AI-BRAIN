import os

from services.secrets import decrypt_mapping, encrypt_mapping, encryption_enabled


def test_encrypt_roundtrip(monkeypatch):
    monkeypatch.setenv("JARVIS_MASTER_KEY", "test-master-key-for-jarvis")
    assert encryption_enabled()
    original = {"access_token": "abc", "refresh_token": "xyz", "expires_at": "2099-01-01T00:00:00+00:00"}
    enc = encrypt_mapping(original)
    assert enc["__jarvis_enc__"] is True
    assert "access_token" not in enc
    dec = decrypt_mapping(enc)
    assert dec == original


def test_plaintext_passthrough_without_key(monkeypatch):
    monkeypatch.delenv("JARVIS_MASTER_KEY", raising=False)
    original = {"access_token": "plain"}
    assert encrypt_mapping(original) == original
    assert decrypt_mapping(original) == original


def test_store_encrypts_tokens_on_disk(tmp_path, monkeypatch):
    monkeypatch.setenv("JARVIS_MASTER_KEY", "disk-key-jarvis-9")
    monkeypatch.setenv("VAULT_PATH", str(tmp_path))

    import importlib
    import services.store as store

    # Point state file into tmp
    state_file = tmp_path / "state.json"
    monkeypatch.setattr(store, "STATE_FILE", state_file)
    monkeypatch.setattr(store, "DATA_DIR", tmp_path)
    store._state["google_calendar"] = store._default_google_calendar_state()
    store.set_google_calendar(
        {
            "connected": True,
            "tokens": {"access_token": "secret-token", "refresh_token": "refresh-me"},
        }
    )
    raw = state_file.read_text(encoding="utf-8")
    assert "secret-token" not in raw
    assert "__jarvis_enc__" in raw

    # Reload as if restarting
    store._state = {
        "context": {},
        "repos": [],
        "hn_stories": [],
        "brief_cache": None,
        "knowledge_count": 0,
        "google_calendar": store._default_google_calendar_state(),
    }
    store._load()
    tokens = store.get_google_calendar().get("tokens") or {}
    assert tokens.get("access_token") == "secret-token"
