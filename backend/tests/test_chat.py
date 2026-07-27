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


def test_chat_history_fed_to_llm(client):
    """Follow-up reply must include prior turn markers from the fake LLM."""
    first = client.post("/chat", json={"message": "remember the word ORBIT"})
    sid = first.json()["session_id"]
    second = client.post("/chat", json={"message": "what word?", "session_id": sid})
    reply = second.json()["reply"]
    assert "mem:" in reply
    assert "ORBIT" in reply


def test_chat_stream_tokens(client):
    with client.stream(
        "POST",
        "/chat/stream",
        json={"message": "stream hello"},
    ) as resp:
        assert resp.status_code == 200
        body = "".join(resp.iter_text())
    assert "data: " in body
    assert '"type": "token"' in body or '"type":"token"' in body
    assert '"type": "done"' in body or '"type":"done"' in body


def test_create_and_switch_session(client):
    a = client.post("/chat/sessions", json={"title": "Alpha"})
    assert a.status_code == 200
    sid_a = a.json()["id"]
    client.post("/chat", json={"message": "alpha only", "session_id": sid_a})

    b = client.post("/chat/sessions", json={"title": "Beta"})
    sid_b = b.json()["id"]
    client.post("/chat", json={"message": "beta only", "session_id": sid_b})

    msgs_a = client.get(f"/chat/sessions/{sid_a}").json()["messages"]
    msgs_b = client.get(f"/chat/sessions/{sid_b}").json()["messages"]
    assert any("alpha" in m["content"] for m in msgs_a)
    assert any("beta" in m["content"] for m in msgs_b)
    assert not any("beta" in m["content"] for m in msgs_a)


def test_save_chat_message(client, vault_root):
    resp = client.post(
        "/chat/save",
        json={"content": "# Saved\n\nFrom chat save endpoint.", "title": "Chat Save"},
    )
    assert resp.status_code == 200
    assert "saved" in resp.json()
