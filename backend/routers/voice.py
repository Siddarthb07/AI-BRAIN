from fastapi import APIRouter, UploadFile, File, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel
from services import stt, tts

router = APIRouter()

class TTSRequest(BaseModel):
    text: str

@router.post("/input")
async def voice_input(file: UploadFile = File(...)):
    """Transcribe audio to text using Whisper."""
    audio_bytes = await file.read()
    if not audio_bytes:
        raise HTTPException(status_code=400, detail="Empty audio file")
    
    text = await stt.transcribe(audio_bytes, filename=file.filename or "audio.webm")
    
    if not text:
        return {"text": "", "status": "no_speech_detected", "fallback": True}
    
    return {"text": text, "status": "ok", "chars": len(text)}

@router.post("/output")
async def voice_output(payload: TTSRequest):
    """Synthesize text to speech audio."""
    if not payload.text.strip():
        raise HTTPException(status_code=400, detail="Empty text")
    
    # Truncate to avoid very long synthesis
    text = payload.text.strip()[:800]
    
    audio_bytes = await tts.synthesize(text)
    if not audio_bytes:
        raise HTTPException(status_code=503, detail="TTS unavailable")
    
    return Response(
        content=audio_bytes,
        media_type="audio/wav",
        headers={
            "Content-Disposition": "attachment; filename=jarvis_speech.wav",
            "X-Text-Length": str(len(text))
        }
    )

@router.get("/test")
async def voice_test():
    """Test TTS with a sample phrase."""
    text = "JARVIS online. All systems operational. Ready to assist."
    audio_bytes = await tts.synthesize(text)
    if not audio_bytes:
        raise HTTPException(status_code=503, detail="TTS unavailable")
    return Response(content=audio_bytes, media_type="audio/wav")
