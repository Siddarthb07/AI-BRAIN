def test_health_returns_service_flags(client):
    resp = client.get("/health")
    assert resp.status_code == 200
    data = resp.json()
    assert "ollama" in data
    assert "qdrant" in data
    assert "vault_path" in data
    assert data.get("demo_mode") is False


def test_root_not_demo(client):
    resp = client.get("/")
    assert resp.status_code == 200
    assert resp.json().get("demo_mode") is False
