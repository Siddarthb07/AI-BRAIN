import os
from pathlib import Path

from dotenv import load_dotenv

load_dotenv(Path(__file__).parent.parent / ".env")

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from routers import brief, calendar, chat, context, ingest, media, vault, voice
from services import config

app = FastAPI(title="JARVIS AI Brain", version="1.0.1")

app.add_middleware(
    CORSMiddleware,
    allow_origins=config.cors_origins(),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(context.router, prefix="/context", tags=["context"])
app.include_router(ingest.router, prefix="/ingest", tags=["ingest"])
app.include_router(brief.router, prefix="/brief", tags=["brief"])
app.include_router(chat.router, prefix="/chat", tags=["chat"])
app.include_router(voice.router, prefix="/voice", tags=["voice"])
app.include_router(media.router, prefix="/media", tags=["media"])
app.include_router(calendar.router, prefix="/calendar", tags=["calendar"])
app.include_router(vault.router, prefix="/vault", tags=["vault"])

generated_root = Path(__file__).parent / "data" / "generated"
generated_root.mkdir(parents=True, exist_ok=True)
app.mount("/generated", StaticFiles(directory=str(generated_root)), name="generated")


@app.get("/")
def root():
    return {
        "status": "JARVIS ONLINE",
        "version": "1.0.1",
        "demo_mode": config.demo_mode(),
        "endpoints": [
            "/health",
            "/context",
            "/ingest",
            "/brief",
            "/chat",
            "/voice",
            "/media",
            "/calendar",
            "/vault",
            "/generated",
        ],
    }


@app.get("/health")
async def health():
    import httpx

    from services import llm, vault as vault_svc

    ollama_ok = await llm.is_ollama_available()
    vault_st = vault_svc.vault_status()

    qdrant_ok = False
    qdrant_url = os.getenv("QDRANT_URL", "http://localhost:6333")
    try:
        async with httpx.AsyncClient(timeout=3.0) as client:
            resp = await client.get(f"{qdrant_url}/collections")
            qdrant_ok = resp.status_code == 200
    except Exception:
        qdrant_ok = False

    all_ok = ollama_ok and vault_st.get("note_count", 0) >= 0
    return {
        "status": "ok" if all_ok else "degraded",
        "message": "All systems nominal." if all_ok else "Some services unavailable.",
        "ollama": ollama_ok,
        "qdrant": qdrant_ok,
        "vault_configured": vault_st.get("configured", False),
        "vault_path": vault_st.get("vault_path"),
        "demo_mode": config.demo_mode(),
    }
