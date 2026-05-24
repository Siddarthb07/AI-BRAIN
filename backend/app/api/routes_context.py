from datetime import datetime

from fastapi import APIRouter

from app.models.schemas import ContextIn, ContextOut
from app.services.storage import get_context, set_context

router = APIRouter(tags=["context"])


@router.post("/context", response_model=ContextOut)
def update_context(payload: ContextIn) -> ContextOut:
    data = set_context(
        payload.daily_goals,
        payload.active_project,
        payload.focus_repos,
        payload.focus_topics,
    )
    return ContextOut(
        daily_goals=data["daily_goals"],
        active_project=data["active_project"],
        focus_repos=data.get("focus_repos", []),
        focus_topics=data.get("focus_topics", []),
        updated_at=datetime.fromisoformat(data["updated_at"]),
    )


@router.get("/context", response_model=ContextOut)
def read_context() -> ContextOut:
    data = get_context()
    return ContextOut(
        daily_goals=data.get("daily_goals", []),
        active_project=data.get("active_project", ""),
        focus_repos=data.get("focus_repos", []),
        focus_topics=data.get("focus_topics", []),
        updated_at=datetime.fromisoformat(data["updated_at"]),
    )
