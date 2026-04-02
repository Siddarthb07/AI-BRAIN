import logging
import threading
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes_brief import router as brief_router
from app.api.routes_chat import router as chat_router
from app.api.routes_context import router as context_router
from app.api.routes_graph import router as graph_router
from app.api.routes_ingest import router as ingest_router
from app.api.routes_voice import router as voice_router
from app.ingestion.github_ingestion import ingest_github_user
from app.services.config import get_settings
from app.services.storage import add_ingested_user, get_ingested_users

settings = get_settings()

logging.basicConfig(level=logging.INFO)

app = FastAPI(title=settings.app_name)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(context_router)
app.include_router(ingest_router)
app.include_router(brief_router)
app.include_router(chat_router)
app.include_router(voice_router)
app.include_router(graph_router)


@app.get("/health")
def health() -> dict:
    return {"status": "ok", "service": settings.app_name}


@app.on_event("startup")
def auto_ingest_user() -> None:
    target_user = settings.graph_github_user
    ingested = get_ingested_users()
    if target_user.lower() in ingested:
        return

    def _runner() -> None:
        try:
            ingest_github_user(target_user)
            add_ingested_user(target_user)
            logging.info("Auto-ingested GitHub user %s", target_user)
        except Exception as exc:
            logging.warning("Auto-ingest failed for %s: %s", target_user, exc)

    threading.Thread(target=_runner, daemon=True).start()
