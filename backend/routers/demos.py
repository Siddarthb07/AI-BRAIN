"""Demo site builder API — build, edit, rebuild, publish."""

from __future__ import annotations

import os
import re
import signal
import subprocess
from pathlib import Path
from typing import Any, List, Optional

from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

from services import demo_builder
from services.llm import LLMOfflineError

router = APIRouter()

_publish_procs: dict = {}


class BuildBody(BaseModel):
    brief: str = Field(..., min_length=8)
    brand: Optional[str] = None
    framework: str = "vite-react"


class FileBody(BaseModel):
    content: str


@router.get("")
def list_demos():
    return {"demos": demo_builder.list_demos()}


@router.get("/{demo_id}")
def get_demo(demo_id: str):
    meta = demo_builder.get_demo(demo_id)
    if not meta:
        raise HTTPException(404, "Demo not found")
    return meta


@router.post("/build")
async def build_demo(body: BuildBody):
    try:
        meta = await demo_builder.build_demo(body.brief, brand=body.brand, framework=body.framework)
        return meta
    except LLMOfflineError as exc:
        raise HTTPException(503, str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc
    except Exception as exc:
        raise HTTPException(500, f"Build failed: {exc}") from exc


@router.get("/{demo_id}/files")
def list_files(demo_id: str):
    if not demo_builder.get_demo(demo_id):
        raise HTTPException(404, "Demo not found")
    return {"files": demo_builder.list_source_files(demo_id)}


@router.get("/{demo_id}/files/{file_path:path}")
def read_file(demo_id: str, file_path: str):
    try:
        return {"path": file_path, "content": demo_builder.read_file(demo_id, file_path)}
    except FileNotFoundError:
        raise HTTPException(404, "File not found")
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc


@router.put("/{demo_id}/files/{file_path:path}")
def write_file(demo_id: str, file_path: str, body: FileBody):
    if not demo_builder.get_demo(demo_id):
        raise HTTPException(404, "Demo not found")
    try:
        demo_builder.write_file(demo_id, file_path, body.content)
        return {"ok": True, "path": file_path}
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc


@router.post("/{demo_id}/rebuild")
def rebuild(demo_id: str):
    try:
        return demo_builder.rebuild_demo(demo_id)
    except FileNotFoundError:
        raise HTTPException(404, "Demo not found")


@router.get("/{demo_id}/open-path")
def open_path(demo_id: str):
    """Return filesystem paths so the UI can open the project in Cursor."""
    meta = demo_builder.get_demo(demo_id)
    if not meta:
        raise HTTPException(404, "Demo not found")
    root = demo_builder.demo_dir(demo_id).resolve()
    host_hint = os.environ.get("DEMO_HOST_ROOT", "").strip()
    if not host_hint:
        # Prefer bind-mounted host tree used by docker-compose
        host_hint = "C:/Users/siddu/OneDrive/Desktop/AI-BRAIN/backend/data/generated/demos"
    host_path = str(Path(host_hint) / demo_id)
    return {
        "ok": True,
        "container_path": str(root),
        "host_path": host_path,
        "vault_hint": f"JARVIS/Demos/{meta.get('slug') or demo_id}",
        "cursor_uri": f"cursor://file/{Path(host_path).as_posix()}",
    }


@router.post("/{demo_id}/publish")
def publish(demo_id: str):
    meta = demo_builder.get_demo(demo_id)
    if not meta:
        raise HTTPException(404, "Demo not found")
    dist = demo_builder.demo_dir(demo_id) / "dist"
    if not (dist / "index.html").exists():
        raise HTTPException(400, "No dist/ — rebuild first")

    # Kill existing tunnel for this demo
    unpublish(demo_id)

    # Serve dist on an ephemeral local port via python http.server, then cloudflare tunnel
    import socket

    sock = socket.socket()
    sock.bind(("127.0.0.1", 0))
    port = sock.getsockname()[1]
    sock.close()

    server = subprocess.Popen(
        ["python", "-m", "http.server", str(port), "--bind", "127.0.0.1"],
        cwd=str(dist),
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    cloudflared = _find_cloudflared()
    if not cloudflared:
        server.terminate()
        raise HTTPException(500, "cloudflared not found — install cloudflared or use npx")

    tunnel = subprocess.Popen(
        cloudflared + ["tunnel", "--url", f"http://127.0.0.1:{port}"],
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
    )
    public_url = _wait_for_tunnel_url(tunnel, timeout=45)
    if not public_url:
        tunnel.terminate()
        server.terminate()
        raise HTTPException(500, "Tunnel did not return a URL")

    _publish_procs[demo_id] = tunnel
    _publish_procs[f"{demo_id}:http"] = server
    meta["public_url"] = public_url
    meta["publish_port"] = port
    demo_builder._meta_path(demo_id).write_text(
        __import__("json").dumps(meta, indent=2), encoding="utf-8"
    )
    return {"ok": True, "public_url": public_url, "demo": meta}


@router.post("/{demo_id}/unpublish")
def unpublish(demo_id: str):
    for key in (demo_id, f"{demo_id}:http"):
        proc = _publish_procs.pop(key, None)
        if proc and proc.poll() is None:
            try:
                if os.name == "nt":
                    proc.terminate()
                else:
                    os.kill(proc.pid, signal.SIGTERM)
            except Exception:
                pass
    meta = demo_builder.get_demo(demo_id)
    if meta:
        meta["public_url"] = None
        demo_builder._meta_path(demo_id).write_text(
            __import__("json").dumps(meta, indent=2), encoding="utf-8"
        )
    return {"ok": True}


@router.get("/{demo_id}/preview/{file_path:path}")
@router.get("/{demo_id}/preview/")
@router.get("/{demo_id}/preview")
def preview_file(demo_id: str, file_path: str = "index.html"):
    """Serve built dist assets (also mounted at /demos/{id}/)."""
    dist = demo_builder.demo_dir(demo_id) / "dist"
    target = dist / (file_path or "index.html")
    if target.is_dir():
        target = target / "index.html"
    if not target.exists():
        raise HTTPException(404, "Not built")
    return FileResponse(target)


def _find_cloudflared():
    import shutil

    exe = shutil.which("cloudflared") or shutil.which("cloudflared.exe")
    if exe:
        return [exe]
    npx = shutil.which("npx") or shutil.which("npx.cmd")
    if npx:
        return [npx, "--yes", "cloudflared"]
    return None


def _wait_for_tunnel_url(proc: subprocess.Popen, timeout: int = 45):
    import time

    deadline = time.time() + timeout
    pattern = re.compile(r"https://[a-zA-Z0-9-]+\.trycloudflare\.com")
    buf = ""
    while time.time() < deadline:
        if proc.stdout is None:
            break
        line = proc.stdout.readline()
        if not line:
            if proc.poll() is not None:
                break
            time.sleep(0.2)
            continue
        buf += line
        m = pattern.search(line) or pattern.search(buf)
        if m:
            return m.group(0)
    return None
