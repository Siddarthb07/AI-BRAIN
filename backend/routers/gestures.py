"""Gesture control API — OpenCV hand tracker posts here; UI polls /gestures/latest."""

from __future__ import annotations

import asyncio
import os
import subprocess
import sys
from pathlib import Path
from typing import Any, Optional

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from services import gestures as gesture_bus

router = APIRouter()

SCRIPT = Path(__file__).resolve().parent.parent / "scripts" / "hand_graph_control.py"
_proc: Optional[subprocess.Popen] = None


class GestureEvent(BaseModel):
    gesture: str = "none"
    yaw: float = 0.0
    pitch: float = 0.0
    zoom: float = 0.0
    select: int = 0
    fingers: int = 0
    cursor: dict[str, float] = Field(default_factory=lambda: {"x": 0.5, "y": 0.5})
    message: str = ""
    source: str = "opencv"


@router.get("/status")
async def gesture_status():
    return gesture_bus.status()


@router.get("/latest")
async def gesture_latest():
    return gesture_bus.latest()


@router.post("/event")
async def gesture_event(payload: GestureEvent):
    return gesture_bus.publish(payload.model_dump())


@router.get("/stream")
async def gesture_stream():
    async def gen():
        import json

        while True:
            data = gesture_bus.latest()
            yield f"data: {json.dumps(data)}\n\n"
            await asyncio.sleep(0.05)

    return StreamingResponse(gen(), media_type="text/event-stream")


@router.post("/session/start")
async def start_session():
    """Spawn the OpenCV hand-control script (camera). Mic/wake stay free in the browser."""
    global _proc
    if _proc and _proc.poll() is None:
        return {**gesture_bus.status(), "already_running": True}

    if not SCRIPT.exists():
        raise HTTPException(status_code=404, detail=f"Script missing: {SCRIPT}")

    api = os.getenv("JARVIS_PUBLIC_API", "http://127.0.0.1:8002")
    env = os.environ.copy()
    env["JARVIS_GESTURE_API"] = f"{api.rstrip('/')}/gestures/event"

    try:
        _proc = subprocess.Popen(
            [sys.executable, str(SCRIPT)],
            cwd=str(SCRIPT.parent.parent),
            env=env,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to start hand control: {exc}") from exc

    gesture_bus.set_session(running=True, pid=_proc.pid)
    return {"ok": True, **gesture_bus.status(), "hint": "Say 'Jarvis' anytime — wake uses mic, hands use camera."}


@router.post("/session/stop")
async def stop_session():
    global _proc
    if _proc and _proc.poll() is None:
        try:
            _proc.terminate()
            try:
                _proc.wait(timeout=2)
            except subprocess.TimeoutExpired:
                _proc.kill()
        except Exception:
            pass
    _proc = None
    return {"ok": True, **gesture_bus.set_session(running=False, pid=None)}
