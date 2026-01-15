from functools import lru_cache
from pathlib import Path

from faster_whisper import WhisperModel

from app.services.config import get_settings


class WhisperService:
    def __init__(self) -> None:
        settings = get_settings()
        self.model = WhisperModel(
            settings.whisper_model,
            device=settings.whisper_device,
            compute_type=settings.whisper_compute_type,
        )

    def transcribe(self, audio_path: Path) -> str:
        segments, _ = self.model.transcribe(str(audio_path), beam_size=1)
        text = " ".join(segment.text.strip() for segment in segments).strip()
        return text


@lru_cache
def get_whisper_service() -> WhisperService:
    return WhisperService()

