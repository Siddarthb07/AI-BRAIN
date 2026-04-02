from pathlib import Path
import logging
from uuid import uuid4

from fastapi import APIRouter, File, HTTPException, UploadFile
from fastapi.responses import FileResponse

from app.models.schemas import TTSIn
from app.services.config import get_settings
from app.voice.tts_service import get_tts_service
from app.voice.whisper_service import get_whisper_service

router = APIRouter(tags=["voice"])
logger = logging.getLogger("athera.voice")


@router.post("/voice/input")
async def transcribe_voice(file: UploadFile = File(...)) -> dict:
    settings = get_settings()
    suffix = Path(file.filename or "audio.webm").suffix or ".webm"
    tmp_path = settings.audio_dir / f"input-{uuid4()}{suffix}"

    try:
        content = await file.read()
        if not content:
            return {"text": ""}
        tmp_path.write_bytes(content)
        text = get_whisper_service().transcribe(tmp_path)
        return {"text": text}
    except Exception as exc:
        logger.exception("Whisper transcription failed")
        return {
            "text": "Transcription unavailable. Install ffmpeg and ensure the Whisper model downloads successfully."
        }
    finally:
        if tmp_path.exists():
            tmp_path.unlink(missing_ok=True)


@router.post("/voice/output")
def synthesize_voice(payload: TTSIn) -> FileResponse:
    settings = get_settings()
    output_path = settings.audio_dir / f"reply-{uuid4()}.wav"
    try:
        get_tts_service().synthesize(payload.text, output_path)
        return FileResponse(path=output_path, media_type="audio/wav", filename=output_path.name)
    except Exception as exc:
        logger.exception("TTS synthesis failed")
        raise HTTPException(status_code=400, detail=f"TTS failed: {exc}") from exc
