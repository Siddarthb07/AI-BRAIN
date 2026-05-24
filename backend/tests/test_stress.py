"""Stress tests for JARVIS v2 API — concurrency, edge cases, rapid writes."""

from __future__ import annotations

import concurrent.futures
import uuid

import pytest


def test_concurrent_health(client):
    def hit():
        r = client.get("/health")
        return r.status_code == 200

    with concurrent.futures.ThreadPoolExecutor(max_workers=20) as pool:
        results = list(pool.map(lambda _: hit(), range(40)))
    assert all(results)


def test_rapid_vault_saves(client, vault_root):
    paths = []
    for i in range(25):
        resp = client.post(
            "/vault/save",
            json={"content": f"# Note {i}\n\nBody {i} " + ("x" * 200), "title": f"Stress {i}", "folder": "Chat"},
        )
        assert resp.status_code == 200, resp.text
        paths.append(resp.json()["saved"]["relative_path"])
    assert len(set(paths)) == 25


def test_concurrent_vault_saves(client, vault_root):
    def save_one(i: int):
        r = client.post(
            "/vault/save",
            json={"content": f"# Concurrent {i}\n\nData.", "title": f"C-{i}", "folder": "Generated"},
        )
        return r.status_code, r.json().get("saved", {}).get("relative_path")

    with concurrent.futures.ThreadPoolExecutor(max_workers=10) as pool:
        results = list(pool.map(save_one, range(30)))
    assert all(code == 200 for code, _ in results)
    assert len({p for _, p in results if p}) == 30


def test_chat_session_churn(client):
    created = []
    for i in range(15):
        r = client.post("/chat/sessions", params={"title": f"Stress session {i}"})
        assert r.status_code == 200
        created.append(r.json()["id"])

    listed = client.get("/chat/sessions").json()["sessions"]
    assert len(listed) >= 15

    sid = created[0]
    for i in range(10):
        r = client.post("/chat", json={"message": f"stress message {i}", "session_id": sid})
        assert r.status_code == 200
        assert r.json()["session_id"] == sid

    hist = client.get(f"/chat/sessions/{sid}")
    assert hist.status_code == 200
    assert len(hist.json()["messages"]) >= 20

    for sid_del in created[5:]:
        dr = client.delete(f"/chat/sessions/{sid_del}")
        assert dr.status_code == 200


def test_concurrent_chat_same_session(client):
    first = client.post("/chat", json={"message": "init concurrent session"})
    assert first.status_code == 200
    sid = first.json()["session_id"]

    def send(i: int):
        r = client.post("/chat", json={"message": f"parallel {i}", "session_id": sid})
        return r.status_code, r.json().get("session_id")

    with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:
        results = list(pool.map(send, range(16)))
    assert all(code == 200 for code, _ in results)
    assert all(s == sid for _, s in results if s)


def test_empty_chat_rejected(client):
    r = client.post("/chat", json={"message": ""})
    assert r.status_code == 400


def test_empty_vault_save_rejected(client, vault_root):
    r = client.post("/vault/save", json={"content": "   ", "title": "Empty"})
    assert r.status_code == 400


def test_vault_path_traversal_blocked(client, vault_root):
    r = client.get("/vault/notes/../../../etc/passwd")
    assert r.status_code in (400, 404, 422)


def test_invalid_session_messages_404(client):
    fake = str(uuid.uuid4())
    r = client.get(f"/chat/sessions/{fake}")
    assert r.status_code == 404


def test_confirm_unknown_action(client):
    r = client.post("/chat/action/confirm", json={"action_id": str(uuid.uuid4())})
    assert r.status_code == 200
    assert r.json().get("ok") is False


def test_large_vault_note(client, vault_root):
    big = "# Large\n\n" + ("paragraph text. " * 5000)
    r = client.post("/vault/save", json={"content": big, "title": "Large stress", "folder": "Projects"})
    assert r.status_code == 200
    assert r.json()["saved"]["bytes"] > 50000


def test_chat_history_endpoint(client):
    r = client.get("/chat/history")
    assert r.status_code == 200
    data = r.json()
    assert "session_id" in data
    assert "history" in data
