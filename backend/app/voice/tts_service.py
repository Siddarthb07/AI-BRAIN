from functools import lru_cache
from pathlib import Path

from TTS.api import TTS

from app.services.config import get_settings


class CoquiTTSService:
    def __init__(self) -> None:
        settings = get_settings()
        self.tts = TTS(model_name=settings.coqui_model, progress_bar=False, gpu=False)

    def synthesize(self, text: str, output_path: Path) -> Path:
        output_path.parent.mkdir(parents=True, exist_ok=True)
        self.tts.tts_to_file(text=text, file_path=str(output_path))
        return output_path


@lru_cache
def get_tts_service() -> CoquiTTSService:
    return CoquiTTSService()

