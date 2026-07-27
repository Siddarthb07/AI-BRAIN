from fastapi import APIRouter, File, Form, HTTPException, UploadFile

from services import vision_analyze

router = APIRouter()


@router.post("/analyze")
async def analyze_frame(
    file: UploadFile = File(...),
    prompt: str = Form(""),
):
    """Analyze a webcam / uploaded image with a vision LLM."""
    data = await file.read()
    if not data:
        raise HTTPException(status_code=400, detail="Empty image")
    mime = file.content_type or "image/jpeg"
    if mime not in {"image/jpeg", "image/jpg", "image/png", "image/webp", "image/gif"}:
        mime = "image/jpeg"
    result = await vision_analyze.analyze_image(data, prompt=prompt, mime=mime)
    if result.get("error") == "vision_unavailable" and not result.get("analysis"):
        raise HTTPException(status_code=503, detail="Vision analysis unavailable")
    return {
        "status": "ok" if result.get("analysis") else "degraded",
        "analysis": result.get("analysis") or "",
        "provider": result.get("provider"),
        "model": result.get("model"),
        "error": result.get("error"),
        "bytes": len(data),
    }


@router.get("/status")
async def vision_status():
    import os

    from services.vision_analyze import _vision_models

    return {
        "groq_configured": bool(os.getenv("GROQ_API_KEY")),
        "vision_model": (_vision_models() or ["qwen/qwen3.6-27b"])[0],
        "vision_models": _vision_models(),
    }
