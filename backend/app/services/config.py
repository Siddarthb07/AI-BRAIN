from functools import lru_cache
from pathlib import Path
from typing import List

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    app_name: str = "JARVIS AI Brain API"
    app_env: str = "dev"
    app_host: str = "0.0.0.0"
    app_port: int = 8000
    cors_origins: List[str] = Field(default_factory=lambda: ["http://localhost:3000"])

    llm_provider: str = "ollama"

    ollama_url: str = "http://localhost:11434"
    ollama_model: str = "llama3"
    groq_url: str = "https://api.groq.com/openai/v1"
    groq_model: str = "llama-3.1-8b-instant"
    groq_api_key: str | None = None

    qdrant_url: str = "http://localhost:6333"
    qdrant_collection: str = "athera_knowledge"

    embedding_model: str = "sentence-transformers/all-MiniLM-L6-v2"

    whisper_model: str = "base"
    whisper_device: str = "cpu"
    whisper_compute_type: str = "int8"

    coqui_model: str = "tts_models/en/ljspeech/tacotron2-DDC"

    github_token: str | None = None
    graph_github_user: str = "Siddarthb07"

    base_dir: Path = Path(__file__).resolve().parents[2]
    data_dir: Path = base_dir / "data"
    audio_dir: Path = data_dir / "audio"


@lru_cache
def get_settings() -> Settings:
    settings = Settings()
    settings.data_dir.mkdir(parents=True, exist_ok=True)
    settings.audio_dir.mkdir(parents=True, exist_ok=True)
    return settings
