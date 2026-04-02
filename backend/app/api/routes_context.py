from datetime import datetime

from fastapi import APIRouter

from app.models.schemas import ContextIn, ContextOut
from app.services.storage import get_user_context, set_user_context

router = APIRouter(tags=["context"])


@router.post("/context", response_model=ContextOut)
def update_context(payload: ContextIn) -> ContextOut:
    data = set_user_context(daily_goals=payload.daily_goals, active_project=payload.active_project)
    return ContextOut(
        daily_goals=data["daily_goals"],
        active_project=data["active_project"],
        updated_at=datetime.fromisoformat(data["updated_at"]),
    )


@router.get("/context", response_model=ContextOut)
def read_context() -> ContextOut:
    data = get_user_context()
    return ContextOut(
        daily_goals=data.get("daily_goals", []),
        active_project=data.get("active_project", ""),
        updated_at=datetime.fromisoformat(data["updated_at"]),
    )

