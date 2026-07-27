from typing import List, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from services import vault

router = APIRouter()


class SaveNoteRequest(BaseModel):
    content: str
    title: Optional[str] = None
    folder: str = "Chat"
    tags: List[str] = Field(default_factory=list)
    source: str = "jarvis"
    extract_code: bool = False


class SetVaultPathRequest(BaseModel):
    path: str


@router.get("/status")
async def get_status():
    return vault.vault_status()


@router.post("/path")
async def set_vault_path(payload: SetVaultPathRequest):
    """Set VAULT_PATH for this process (persists for the running backend only)."""
    import os
    from pathlib import Path

    root = Path(payload.path).expanduser().resolve()
    if not root.exists() or not root.is_dir():
        raise HTTPException(400, f"Path is not a directory: {root}")
    os.environ["VAULT_PATH"] = str(root)
    return vault.vault_status()


@router.get("/notes")
async def list_notes(limit: int = 40, folder: Optional[str] = None):
    return {"notes": vault.list_notes(limit=limit, folder=folder)}


@router.get("/notes/{relative_path:path}")
async def read_note(relative_path: str):
    try:
        return vault.read_note(relative_path)
    except FileNotFoundError:
        raise HTTPException(404, "Note not found")
    except ValueError as exc:
        raise HTTPException(400, str(exc))


@router.post("/save")
async def save_note(payload: SaveNoteRequest):
    if not payload.content.strip():
        raise HTTPException(400, "Content is empty")
    saved = vault.save_markdown(
        payload.content,
        title=payload.title,
        folder=payload.folder,
        tags=payload.tags,
        source=payload.source,
    )
    artifacts = []
    if payload.extract_code:
        for art in vault.extract_code_artifacts(payload.content):
            root_note = vault.save_markdown(
                art["content"],
                title=art["filename"],
                folder="Generated",
                tags=["code", art["language"]],
                source="jarvis-extract",
            )
            artifacts.append(root_note)
    return {"saved": saved, "artifacts": artifacts}


@router.post("/sync")
async def sync_vault():
    result = await vault.sync_vault_to_rag()
    return {"status": "ok", **result}


@router.post("/open")
async def open_vault_folder():
    """Return vault path for OS file explorer (Windows/macOS/Linux)."""
    import platform
    import subprocess

    status = vault.vault_status()
    path = status["vault_path"]
    system = platform.system()
    try:
        if system == "Windows":
            subprocess.Popen(["explorer", path])  # noqa: S603
        elif system == "Darwin":
            subprocess.Popen(["open", path])  # noqa: S603
        else:
            subprocess.Popen(["xdg-open", path])  # noqa: S603
    except Exception as exc:
        return {"path": path, "opened": False, "error": str(exc)}
    return {"path": path, "opened": True}
