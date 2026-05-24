from typing import List, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.services import vault

router = APIRouter(prefix="/vault", tags=["vault"])


class SaveNoteRequest(BaseModel):
    content: str
    title: Optional[str] = None
    folder: str = "Chat"
    tags: List[str] = Field(default_factory=list)
    source: str = "jarvis"


@router.get("/status")
async def get_status():
    return vault.vault_status()


@router.get("/notes")
async def list_notes(limit: int = 40, folder: Optional[str] = None):
    return {"notes": vault.list_notes(limit=limit, folder=folder)}


@router.get("/notes/{relative_path:path}")
async def read_note(relative_path: str):
    try:
        return vault.read_note(relative_path)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="Note not found")
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.post("/save")
async def save_note(payload: SaveNoteRequest):
    if not payload.content.strip():
        raise HTTPException(status_code=400, detail="Content is empty")
    saved = vault.save_markdown(
        payload.content,
        title=payload.title,
        folder=payload.folder,
        tags=payload.tags,
        source=payload.source,
    )
    return {"saved": saved}


@router.post("/sync")
async def sync_vault():
    result = await vault.sync_vault_to_rag()
    return {"status": "ok", **result}
