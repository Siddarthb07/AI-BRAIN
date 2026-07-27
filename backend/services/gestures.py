"""In-memory gesture bus for OpenCV hand-control → Brain Graph."""

from __future__ import annotations

import time
from typing import Any, Optional

_latest: dict[str, Any] = {
    "active": False,
    "source": None,
    "gesture": "none",
    "yaw": 0.0,
    "pitch": 0.0,
    "zoom": 0.0,
    "select": 0,
    "cursor": {"x": 0.5, "y": 0.5},
    "fingers": 0,
    "ts": 0.0,
    "message": "Hand control idle",
}

_session: dict[str, Any] = {
    "running": False,
    "pid": None,
    "started_at": None,
}


def publish(event: dict[str, Any]) -> dict[str, Any]:
    global _latest
    patch = {
        "active": True,
        "source": event.get("source") or "opencv",
        "gesture": event.get("gesture") or "none",
        "yaw": float(event.get("yaw") or 0.0),
        "pitch": float(event.get("pitch") or 0.0),
        "zoom": float(event.get("zoom") or 0.0),
        "select": int(event.get("select") or 0),
        "cursor": event.get("cursor") or {"x": 0.5, "y": 0.5},
        "fingers": int(event.get("fingers") or 0),
        "ts": time.time(),
        "message": event.get("message") or _latest.get("message") or "",
    }
    _latest = {**_latest, **patch}
    return dict(_latest)


def latest() -> dict[str, Any]:
    # Decay activity if no events for 1.5s
    age = time.time() - float(_latest.get("ts") or 0)
    out = dict(_latest)
    if age > 1.5:
        out["yaw"] = 0.0
        out["pitch"] = 0.0
        out["zoom"] = 0.0
        out["select"] = 0
        if age > 3.0:
            out["active"] = False
    return out


def set_session(*, running: bool, pid: Optional[int] = None) -> dict[str, Any]:
    _session["running"] = bool(running)
    _session["pid"] = pid
    _session["started_at"] = time.time() if running else None
    if not running:
        publish(
            {
                "active": False,
                "gesture": "none",
                "yaw": 0,
                "pitch": 0,
                "zoom": 0,
                "select": 0,
                "message": "Hand control stopped",
            }
        )
    return status()


def status() -> dict[str, Any]:
    return {
        "session": dict(_session),
        "latest": latest(),
    }
