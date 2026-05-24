from functools import lru_cache
from pathlib import Path
import shutil
import subprocess

from app.services.config import get_settings


class TTSService:
    def __init__(self) -> None:
        self.settings = get_settings()
        self.piper_path = shutil.which("piper")

    def is_available(self) -> bool:
        return self.piper_path is not None

    def synthesize(self, text: str, output_path: Path) -> Path:
        output_path.parent.mkdir(parents=True, exist_ok=True)
        if not self.piper_path:
            raise RuntimeError("Piper not installed")

        model = self.settings.tts_model or "en_US-lessac-medium"
        process = subprocess.run(
            [self.piper_path, "--model", model, "--output_file", str(output_path)],
            input=text.encode("utf-8"),
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            check=False,
        )
        if process.returncode != 0:
            raise RuntimeError(process.stderr.decode("utf-8") or "Piper failed")
        return output_path


@lru_cache
def get_tts_service() -> TTSService:
    return TTSService()


@lru_cache
def get_tts() -> TTSService:
    return get_tts_service()
