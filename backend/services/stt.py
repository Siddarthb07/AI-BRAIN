import os
import tempfile
from pathlib import Path
from typing import Optional

WHISPER_MODEL = os.getenv("WHISPER_MODEL", "base")

_model = None

def get_model():
    global _model
    if _model is None:
        try:
            import whisper
            _model = whisper.load_model(WHISPER_MODEL)
            print(f"[STT] Whisper model loaded: {WHISPER_MODEL}")
        except Exception as e:
            print(f"[STT] Whisper load failed: {e}")
    return _model

async def transcribe(audio_bytes: bytes, filename: str = "audio.webm") -> str:
    # Try Whisper
    try:
        model = get_model()
        if model:
            suffix = Path(filename).suffix or ".webm"
            with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as f:
                f.write(audio_bytes)
                tmp_path = f.name
            
            result = model.transcribe(tmp_path, language="en", fp16=False)
            Path(tmp_path).unlink(missing_ok=True)
            
            text = result.get("text", "").strip()
            if text:
                return text
    except Exception as e:
        print(f"[STT] Whisper failed: {e}")
    
    # Try faster-whisper
    try:
        from faster_whisper import WhisperModel
        model = WhisperModel(WHISPER_MODEL, device="cpu", compute_type="int8")
        with tempfile.NamedTemporaryFile(suffix=".webm", delete=False) as f:
            f.write(audio_bytes)
            tmp_path = f.name
        segments, _ = model.transcribe(tmp_path, language="en")
        text = " ".join(s.text for s in segments).strip()
        Path(tmp_path).unlink(missing_ok=True)
        if text:
            return text
    except Exception as e:
        print(f"[STT] faster-whisper failed: {e}")
    
    return ""
