def test_health(client):
    resp = client.get("/health")
    assert resp.status_code == 200
    data = resp.json()
    assert "ollama" in data
    assert "qdrant" in data
    assert data.get("demo_mode") is False


def test_vault_save(client, vault_root):
    payload = {"content": "# Test\n\nHello.", "title": "Test", "folder": "Chat"}
    save = client.post("/vault/save", json=payload)
    assert save.status_code == 200
    rel = save.json()["saved"]["relative_path"].replace("\\", "/")
    assert rel.startswith("JARVIS/Chat/")
