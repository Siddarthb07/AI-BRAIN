from fastapi import APIRouter

from app.brief.generator import generate_daily_brief
from app.models.schemas import BriefOut

router = APIRouter(tags=["brief"])


@router.get("/brief", response_model=BriefOut)
def get_brief() -> BriefOut:
    payload = generate_daily_brief()
    return BriefOut(**payload)

