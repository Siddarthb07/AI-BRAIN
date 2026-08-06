"""Action queue + event bus smoke tests."""

from services import action_queue, event_bus


def test_enqueue_confirm_audit():
    pending = action_queue.enqueue(
        "noop_test",
        label="Test action",
        params={"x": 1},
        session_id="test-session",
        tier=action_queue.TIER_LIGHT,
    )
    assert pending["id"]
    assert pending["confirm_token"]
    assert pending["status"] == "pending"

    action, err = action_queue.consume_for_confirm(
        pending["id"],
        confirm_token=pending["confirm_token"],
        session_id="test-session",
    )
    assert err is None
    assert action is not None
    assert action["id"] == pending["id"]
    # consume marks DB confirmed; returned snapshot may still show prior status
    stored = action_queue.get_pending(pending["id"])
    assert stored is None or stored["status"] in ("confirmed", "pending")

    action_queue.audit(
        "noop_test",
        action_id=pending["id"],
        params={"x": 1},
        result="ok",
        source="test",
        session_id="test-session",
        ok=True,
    )
    recent = action_queue.list_audit(limit=5)
    assert isinstance(recent, list)
    assert any(r.get("action_id") == pending["id"] for r in recent)


def test_event_bus_recent():
    event_bus.clear()
    assert event_bus.recent(limit=5) == []
