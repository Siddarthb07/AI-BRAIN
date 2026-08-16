from __future__ import annotations

import os
from pathlib import Path

from dotenv import load_dotenv

load_dotenv(Path(__file__).parent.parent / ".env", override=True)

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from routers import brief, calendar, chat, context, demos, graph, gestures, house, infra, ingest, intel, media, research, vault, vision, voice
from services import config
from services.auth import JarvisAuthMiddleware
from services import demo_builder as demo_builder_svc

app = FastAPI(title="JARVIS AI Brain", version="2.0.0")

_health_cache: dict | None = None
_health_cache_at: float = 0.0

_cors = config.cors_origins()
if _cors == ["*"]:
    # Wildcard origins cannot be paired with credentialed CORS.
    app.add_middleware(
        CORSMiddleware,
        allow_origin_regex=r".*",
        allow_credentials=False,
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
app.include_router(intel.router, prefix="/intel", tags=["intel"])
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
            "/intel",
            "/infra",
            "/demos-static",
            "/generated",
        ],
    }


@app.get("/health")
async def health():
    import asyncio
    import time

    import httpx

    from services import llm, vault as vault_svc
    from services.house import get_adapter, ha_configured, writes_enabled

    global _health_cache, _health_cache_at
    now = time.monotonic()
    if _health_cache is not None and now - _health_cache_at < 3.0:
        return _health_cache

    qdrant_url = os.getenv("QDRANT_URL", "http://localhost:6333")

    async def _qdrant() -> bool:
        try:
            async with httpx.AsyncClient(timeout=1.5) as client:
                resp = await client.get(f"{qdrant_url}/collections")
                return resp.status_code == 200
        except Exception:
            return False

    async def _ollama() -> bool:
        # Ollama is often offline on this host — keep the probe short so UI health stays snappy.
        try:
            async with httpx.AsyncClient(timeout=0.8) as client:
                resp = await client.get(f"{os.getenv('OLLAMA_URL', 'http://host.docker.internal:11434')}/api/tags")
                return resp.status_code == 200
        except Exception:
            return False

    async def _groq() -> bool:
        # Soft-available when key is configured — probe flaps should not blank the UI / graph.
        configured = bool(getattr(llm, "GROQ_API_KEY", None) or os.getenv("GROQ_API_KEY"))
        try:
            probed = await asyncio.wait_for(llm.is_groq_available(), timeout=2.0)
            return bool(probed)
        except Exception:
            return configured

    ollama_ok, groq_ok, qdrant_ok = await asyncio.gather(_ollama(), _groq(), _qdrant())
    vault_st = vault_svc.vault_status()
    house_backend = get_adapter().name
    llm_status = llm.provider_status()
    # Configured LLM counts as healthy even if the probe timed out.
    llm_ready = ollama_ok or groq_ok or bool(llm_status.get("groq_configured"))
    all_ok = llm_ready and vault_st.get("note_count", 0) >= 0
    payload = {
        "status": "ok" if all_ok else "degraded",
        "message": "All systems nominal." if all_ok else "Some services unavailable.",
        "ollama": ollama_ok,
        "groq": groq_ok or bool(llm_status.get("groq_configured")),
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
    _health_cache = payload
    _health_cache_at = now
    return payload
