import pytest


def test_vault_path_traversal_rejected(client, vault_root):
    resp = client.get("/vault/notes/../../etc/passwd")
    assert resp.status_code in (400, 404, 422)


def test_vault_save_and_list(client, vault_root):
    payload = {
        "content": "# Gate test\n\nHello from pytest.",
        "title": "Gate Test",
        "folder": "Chat",
    }
    save = client.post("/vault/save", json=payload)
    assert save.status_code == 200
    body = save.json()
    assert "saved" in body
    rel = body["saved"]["relative_path"].replace("\\", "/")
    assert rel.startswith("JARVIS/Chat/")

    listed = client.get("/vault/notes")
    assert listed.status_code == 200
    notes = listed.json().get("notes", [])
    assert any(n["relative_path"].replace("\\", "/") == rel for n in notes)


def test_vault_status(client, vault_root):
    resp = client.get("/vault/status")
    assert resp.status_code == 200
    data = resp.json()
    assert data["vault_path"] == str(vault_root.resolve())
