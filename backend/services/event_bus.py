"""In-process asyncio pub/sub + recent event ring for JARVIS."""

from __future__ import annotations

import asyncio
import time
from collections import deque
from typing import Any, Awaitable, Callable, Deque, Dict, List, Optional

Subscriber = Callable[[Dict[str, Any]], Optional[Awaitable[None]]]

_subscribers: List[Subscriber] = []
_recent: Deque[Dict[str, Any]] = deque(maxlen=200)
_lock = asyncio.Lock()


async def publish(event_type: str, payload: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    event = {
        "type": event_type,
        "payload": payload or {},
        "ts": time.time(),
    }
    _recent.append(event)
    async with _lock:
        subs = list(_subscribers)
    for sub in subs:
        try:
            result = sub(event)
            if asyncio.iscoroutine(result):
                await result
        except Exception as exc:
            print(f"[bus] subscriber error: {exc}")
    return event


def subscribe(callback: Subscriber) -> Callable[[], None]:
    _subscribers.append(callback)

    def unsubscribe() -> None:
        if callback in _subscribers:
            _subscribers.remove(callback)

    return unsubscribe


def recent(limit: int = 50, event_type: Optional[str] = None) -> List[Dict[str, Any]]:
    items = list(_recent)
    if event_type:
        items = [e for e in items if e.get("type") == event_type]
    return items[-limit:]


def clear() -> None:
    _recent.clear()
