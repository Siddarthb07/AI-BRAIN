import asyncio
from typing import Optional

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

from services import media

router = APIRouter()


class ImageRequest(BaseModel):
    prompt: str = Field(..., min_length=1, max_length=800)
    negative_prompt: Optional[str] = Field(default="", max_length=800)
    width: Optional[int] = 512
    height: Optional[int] = 512
    steps: Optional[int] = 12
    guidance_scale: Optional[float] = 7.0
    seed: Optional[int] = None


def _public_image(request: Request, item: dict) -> dict:
    base_url = str(request.base_url).rstrip("/")
    relative_url = item.get("relative_url", "")
    return {
        **item,
        "url": f"{base_url}{relative_url}" if relative_url.startswith("/") else relative_url,
    }


@router.get("/image/status")
async def image_status():
    return media.image_status()


@router.get("/image/history")
async def image_history(request: Request, limit: int = 12):
    items = media.list_images(limit=max(1, min(limit, 24)))
    return {"items": [_public_image(request, item) for item in items], "count": len(items)}


@router.post("/image/generate")
async def generate_image(payload: ImageRequest, request: Request):
    try:
        item = await asyncio.to_thread(
            media.generate_image,
            payload.prompt,
            payload.negative_prompt or "",
            payload.width,
            payload.height,
            payload.steps,
            payload.guidance_scale,
            payload.seed,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Image generation failed: {exc}") from exc

    return _public_image(request, item)
