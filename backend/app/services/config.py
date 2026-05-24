from functools import lru_cache
from pathlib import Path
from typing import List, Optional

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    app_name: str = "JARVIS AI Brain API"
    app_env: str = "dev"
    app_host: str = "0.0.0.0"
    app_port: int = 8010
    cors_origins: List[str] = Field(default_factory=lambda: ["http://localhost:5173", "http://127.0.0.1:5173"])

    demo_mode: bool = False
    vault_path: Optional[str] = None
    auto_save_vault: bool = False
    auto_sync_vault: bool = True
    llm_max_tokens: int = 4096

    llm_provider: str = "ollama"

    ollama_url: str = "http://localhost:12489"
    ollama_model: str = "llama3"
    groq_url: str = "https://api.groq.com/openai/v1"
    groq_model: str = "llama-3.1-8b-instant"
    groq_api_key: Optional[str] = None

    qdrant_url: str = "http://localhost:7555"
    qdrant_collection: str = "jarvis_knowledge"

    embedding_model: str = "sentence-transformers/all-MiniLM-L6-v2"

    whisper_model: str = "base"
    whisper_device: str = "cpu"
    whisper_compute_type: str = "int8"

    tts_model: str = "en_US-lessac-medium"

    github_token: Optional[str] = None
    github_user: str = "Siddarthb07"

    base_dir: Path = Path(__file__).resolve().parents[2]
    data_dir: Path = base_dir / "data"
    audio_dir: Path = data_dir / "audio"


@lru_cache
def get_settings() -> Settings:
    settings = Settings()
    settings.data_dir.mkdir(parents=True, exist_ok=True)
    settings.audio_dir.mkdir(parents=True, exist_ok=True)
    return settings
