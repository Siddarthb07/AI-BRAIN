from pathlib import Path
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from routers import context, ingest, brief, chat, voice, media, calendar

app = FastAPI(title="JARVIS AI Brain", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
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

generated_root = Path(__file__).parent / "data" / "generated"
generated_root.mkdir(parents=True, exist_ok=True)
app.mount("/generated", StaticFiles(directory=str(generated_root)), name="generated")

@app.get("/")
def root():
    return {
        "status": "JARVIS ONLINE",
        "version": "1.0.0",
        "endpoints": ["/context", "/ingest", "/brief", "/chat", "/voice", "/media", "/calendar", "/generated"]
    }

@app.get("/health")
def health():
    return {"status": "ok", "message": "All systems nominal."}
