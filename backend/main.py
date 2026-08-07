import os
from pathlib import Path

from dotenv import load_dotenv

load_dotenv(Path(__file__).parent.parent / ".env", override=True)

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from routers import brief, calendar, chat, context, demos, graph, gestures, house, infra, ingest, media, research, vault, vision, voice
from services import config
from services.auth import JarvisAuthMiddleware
from services import demo_builder as demo_builder_svc

app = FastAPI(title="JARVIS AI Brain", version="2.0.0")

_cors = config.cors_origins()
if _cors == ["*"]:
    # PUBLIC_MODE / tunnel / LAN — cannot combine allow_origins=["*"] with credentials
    app.add_middleware(
        CORSMiddleware,
        allow_origin_regex=r".*",
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
else:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=_cors,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
app.add_middleware(JarvisAuthMiddleware)

app.include_router(context.router, prefix="/context", tags=["context"])
app.include_router(ingest.router, prefix="/ingest", tags=["ingest"])
app.include_router(brief.router, prefix="/brief", tags=["brief"])
app.include_router(chat.router, prefix="/chat", tags=["chat"])
app.include_router(voice.router, prefix="/voice", tags=["voice"])
app.include_router(media.router, prefix="/media", tags=["media"])
app.include_router(calendar.router, prefix="/calendar", tags=["calendar"])
app.include_router(vault.router, prefix="/vault", tags=["vault"])
app.include_router(graph.router, prefix="/graph", tags=["graph"])
app.include_router(gestures.router, prefix="/gestures", tags=["gestures"])
app.include_router(house.router, prefix="/house", tags=["house"])
app.include_router(vision.router, prefix="/vision", tags=["vision"])
app.include_router(demos.router, prefix="/demos", tags=["demos"])
app.include_router(research.router, prefix="/research", tags=["research"])
app.include_router(infra.router, prefix="/infra", tags=["infra"])

generated_root = Path(__file__).parent / "data" / "generated"
generated_root.mkdir(parents=True, exist_ok=True)
app.mount("/generated", StaticFiles(directory=str(generated_root)), name="generated")

demos_root = demo_builder_svc.demos_root()
app.mount("/demos-static", StaticFiles(directory=str(demos_root), html=True), name="demos-static")


@app.on_event("startup")
async def _warm_hot_path() -> None:
    """Preload vault/knowledge caches so the first chat isn't a cold stutter."""
    try:
        from services import rag, vault

        vault.vault_status()
        rag.load_local_store()
        print(f"[startup] knowledge docs cached: {len(rag.load_local_store())}")
    except Exception as exc:
        print(f"[startup] warm failed: {exc}")
    try:
        from services import infra_monitor

        infra_monitor.start_poller()
        print("[startup] infrastructure monitor armed")
    except Exception as exc:
        print(f"[startup] infrastructure monitor failed: {exc}")


@app.on_event("shutdown")
async def _stop_background_tasks() -> None:
    from services import infra_monitor

    await infra_monitor.stop_poller()


@app.get("/")
def root():
    return {
        "status": "JARVIS ONLINE",
        "version": "2.0.0",
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
            "/graph",
            "/gestures",
            "/house",
            "/vision",
            "/demos",
            "/research",
            "/infra",
            "/demos-static",
            "/generated",
        ],
    }


@app.get("/health")
async def health():
    import httpx

    from services import llm, vault as vault_svc
    from services.house import get_adapter, ha_configured, writes_enabled

    ollama_ok = await llm.is_ollama_available()
    groq_ok = await llm.is_groq_available()
    vault_st = vault_svc.vault_status()

    qdrant_ok = False
    qdrant_url = os.getenv("QDRANT_URL", "http://localhost:6333")
    try:
        async with httpx.AsyncClient(timeout=3.0) as client:
            resp = await client.get(f"{qdrant_url}/collections")
            qdrant_ok = resp.status_code == 200
    except Exception:
        qdrant_ok = False

    house_backend = get_adapter().name
    llm_status = llm.provider_status()
    all_ok = (ollama_ok or groq_ok) and vault_st.get("note_count", 0) >= 0
    return {
        "status": "ok" if all_ok else "degraded",
        "message": "All systems nominal." if all_ok else "Some services unavailable.",
        "ollama": ollama_ok,
        "groq": groq_ok,
        "llm": llm_status,
        "qdrant": qdrant_ok,
        "vault_configured": vault_st.get("configured", False),
        "vault_path": vault_st.get("vault_path"),
        "demo_mode": config.demo_mode(),
        "house_backend": house_backend,
        "ha_configured": ha_configured(),
        "house_writes_enabled": writes_enabled(),
        "version": "2.0.0",
    }
