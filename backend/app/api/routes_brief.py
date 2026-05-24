from fastapi import APIRouter

from app.brief import generate_brief
from app.models.schemas import BriefOut, InsightOut
from app.services.storage import list_insights

router = APIRouter(tags=["brief"])


@router.get("/brief", response_model=BriefOut)
def get_brief() -> BriefOut:
    return BriefOut(**generate_brief())


@router.get("/insights", response_model=list[InsightOut])
def get_insights() -> list[InsightOut]:
    items = list_insights(limit=20)
    return [
        InsightOut(
            id=item.get("id", ""),
            source=item.get("source", ""),
            title=item.get("title", ""),
            summary=item.get("summary", ""),
            url=item.get("url"),
            timestamp=item.get("timestamp", ""),
        )
        for item in items
    ]
