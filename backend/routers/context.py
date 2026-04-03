from fastapi import APIRouter
from pydantic import BaseModel
from typing import Optional, List
from services import store

router = APIRouter()

class ContextPayload(BaseModel):
    daily_goals: Optional[List[str]] = None
    active_project: Optional[str] = None
    focus_time: Optional[str] = None
    energy_level: Optional[str] = None
    notes: Optional[str] = None

@router.post("")
async def set_context(payload: ContextPayload):
    update = payload.model_dump(exclude_none=True)
    store.set_context(update)
    return {"status": "ok", "context": store.get_context()}

@router.get("")
async def get_context():
    return {"context": store.get_context(), "stats": store.get_stats()}
