import logging

import httpx
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes_brief import router as brief_router
from app.api.routes_chat import router as chat_router
from app.api.routes_context import router as context_router
from app.api.routes_graph import router as graph_router
from app.api.routes_ingest import router as ingest_router
from app.api.routes_vault import router as vault_router
from app.api.routes_voice import router as voice_router
from app.services.config import get_settings
from app.services.vault import vault_status

logging.basicConfig(level=logging.INFO)

settings = get_settings()

app = FastAPI(title=settings.app_name, version="2.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins or ["http://localhost:5173"],
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
app.include_router(vault_router)


@app.get("/health")
async def health() -> dict:
    ollama_ok = False
    qdrant_ok = False
    try:
        async with httpx.AsyncClient(timeout=3.0) as client:
            resp = await client.get(f"{settings.ollama_url}/api/tags")
            ollama_ok = resp.status_code == 200
    except Exception:
        ollama_ok = False
    try:
        async with httpx.AsyncClient(timeout=3.0) as client:
            resp = await client.get(f"{settings.qdrant_url}/collections")
            qdrant_ok = resp.status_code == 200
    except Exception:
        qdrant_ok = False

    vault_st = vault_status()
    return {
        "status": "ok" if ollama_ok else "degraded",
        "service": settings.app_name,
        "ollama": ollama_ok,
        "qdrant": qdrant_ok,
        "vault_configured": vault_st.get("configured", False),
        "vault_path": vault_st.get("vault_path"),
        "demo_mode": settings.demo_mode,
    }


@app.get("/")
def root() -> dict:
    return {
        "status": "JARVIS ONLINE",
        "version": "2.0.0",
        "demo_mode": settings.demo_mode,
        "endpoints": ["/health", "/chat", "/brief", "/vault", "/ingest", "/graph", "/context", "/voice"],
    }
