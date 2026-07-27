def test_graph_projection(client):
    resp = client.get("/graph")
    assert resp.status_code == 200
    data = resp.json()
    assert "nodes" in data
    assert "edges" in data
    assert any(n["type"] == "core" for n in data["nodes"])


def test_house_sim_entities(client):
    resp = client.get("/house/entities?backend=sim")
    assert resp.status_code == 200
    data = resp.json()
    assert data["backend"] == "sim"
    assert len(data["entities"]) >= 5


def test_house_service_confirm_flow(client):
    propose = client.post(
        "/house/service",
        json={"entity_id": "light.lab", "service": "turn_on", "backend": "sim"},
    )
    assert propose.status_code == 200
    body = propose.json()
    assert body["requires_confirm"] is True
    action = body["action"]
    assert action["confirm_token"]

    confirm = client.post(
        "/house/service",
        json={
            "entity_id": "light.lab",
            "service": "turn_on",
            "backend": "sim",
            "confirm": True,
            "action_id": action["id"],
            "confirm_token": action["confirm_token"],
        },
    )
    assert confirm.status_code == 200
    assert confirm.json()["ok"] is True
    assert confirm.json()["entity"]["state"] == "on"

    state = client.get("/house/entities/light.lab?backend=sim")
    assert state.json()["state"] == "on"


def test_evening_scene(client):
    resp = client.post("/house/scene/evening")
    assert resp.status_code == 200
    assert resp.json()["ok"] is True


def test_health_includes_house(client):
    resp = client.get("/health")
    assert resp.status_code == 200
    data = resp.json()
    assert "house_backend" in data
    assert data["version"] == "2.0.0"
