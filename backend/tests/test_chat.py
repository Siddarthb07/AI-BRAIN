def test_chat_creates_session(client):
    resp = client.post("/chat", json={"message": "hello jarvis test"})
    assert resp.status_code == 200
    data = resp.json()
    assert "session_id" in data
    assert "reply" in data
    assert "citations" in data


def test_chat_persistence(client):
    first = client.post("/chat", json={"message": "remember gate test alpha"})
    sid = first.json()["session_id"]

    second = client.post("/chat", json={"message": "follow up", "session_id": sid})
    assert second.json()["session_id"] == sid

    hist = client.get(f"/chat/sessions/{sid}")
    assert hist.status_code == 200
    messages = hist.json()["messages"]
    assert len(messages) >= 2


def test_save_chat_message(client, vault_root):
    resp = client.post(
        "/chat/save",
        json={"content": "# Saved\n\nFrom chat save endpoint.", "title": "Chat Save"},
    )
    assert resp.status_code == 200
    assert "saved" in resp.json()
