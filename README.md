# JARVIS AI Brain

> Local-first AI command system — 3D brain graph, daily briefs, voice I/O, RAG chat.

---

## Stack

| Layer | Tech |
|---|---|
| Backend | FastAPI + Python 3.11 |
| LLM | Ollama (llama3.2) + Groq fallback |
| Embeddings | sentence-transformers (all-MiniLM-L6-v2) |
| Vector DB | Qdrant (Docker) |
| STT | Web Speech API → Whisper |
| TTS | American-voice pyttsx3 / Coqui → Browser SpeechSynthesis |
| Frontend | Next.js 14 |
| 3D | React Three Fiber + Three.js |
| State | Zustand |

---

## Quick Start (Windows)

### Prerequisites

1. **Docker Desktop** — running
2. **Ollama** — [ollama.com](https://ollama.com) — installed and running

```bash
# Pull the default LLM
ollama pull llama3.2
```

3. **Node.js 20+** — [nodejs.org](https://nodejs.org)

### Launch

```batch
# Option A — double-click
start.bat

# Option B — manual
copy .env.example .env
docker-compose up --build -d
```

Open: **http://localhost:5050**

---

## Running Without Docker

### Backend

```bash
cd backend
pip install -r requirements.txt
# Windows needs ffmpeg for Whisper:
# Download from https://ffmpeg.org and add to PATH
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

### Qdrant (vector DB)

```bash
docker run -p 6333:6333 qdrant/qdrant
```

---

## First Use Walkthrough

1. **Open** http://localhost:5050 — the 3D brain loads with fallback data
2. **Click `+ GITHUB`** in the top bar → enter your GitHub username → click **INGEST**
   - All your repos get indexed into Qdrant in the background
   - Brain graph nodes update with your actual repos
3. **Click `↺ HN`** to pull today's Hacker News signals
4. **BRIEF tab** → Click **▶ READ ALOUD** to have JARVIS narrate your daily brief
5. **CHAT tab** → Ask anything: `"What should I work on today?"` or `"Summarize my repos"`
6. **VOICE tab** → Click **⏺ HOLD TO SPEAK** → speak → JARVIS transcribes + responds + reads back
7. **Click any node** in the 3D brain → details appear in the NODES panel

---

## API Reference

### Health
```
GET http://localhost:8000/health
→ { "status": "ok" }
```

### Set Context
```
POST http://localhost:8000/context
{
  "daily_goals": ["Ship LexProbe MVP", "Review PRs"],
  "active_project": "LexProbe",
  "focus_time": "09:00-12:00"
}
```

### Ingest GitHub User
```
GET http://localhost:8000/ingest/github/user/siddharthmishra
→ { "status": "ingesting", "repo_count": 12, "repos": [...] }
```

### Ingest Single Repo
```
POST http://localhost:8000/ingest/github
{ "owner": "siddharthmishra", "repo": "lexprobe" }
```

### Pull HN Signals
```
GET http://localhost:8000/ingest/external
→ { "status": "ok", "stories": 15, "top": [...] }
```

### Daily Brief
```
GET http://localhost:8000/brief
→ {
    "date": "Tuesday, April 1 2025",
    "greeting": "Good morning...",
    "priority_actions": ["🔥 Ship...", ...],
    "insights": [...],
    "learning_goals": [...],
    "voice_summary": "..."
  }
```

### Chat
```
POST http://localhost:8000/chat
{ "message": "How is my LexProbe architecture?" }
→ { "response": "Your LexProbe stack...", "context_used": true }
```

### Voice — Transcribe Audio
```
POST http://localhost:8000/voice/input
Content-Type: multipart/form-data
file: <audio.webm>
→ { "text": "what should I work on today" }
```

### Voice — Synthesize Speech
```
POST http://localhost:8000/voice/output
{ "text": "JARVIS online. Here is your brief..." }
→ audio/wav binary
```

### Voice — Test TTS
```
GET http://localhost:8000/voice/test
→ audio/wav binary
```

---

## Voice Architecture

```
You speak
    ↓
Browser Web Speech API  ──(primary)──→  Transcribed text
    ↓ (if unavailable)
MediaRecorder (webm)
    ↓
POST /voice/input → Whisper (backend)
    ↓
Transcribed text → POST /chat → JARVIS response
    ↓
POST /voice/output → pyttsx3 / Coqui  ──(primary)──→  Audio playback
    ↓ (if backend TTS fails)
Browser SpeechSynthesis API
```

---

## Configuration

Edit `.env`:

```env
# LLM
OLLAMA_MODEL=llama3.2        # or: mistral, codellama, phi3
GROQ_API_KEY=gsk_...         # optional, from console.groq.com

# GitHub (optional, 5000 req/hr vs 60)
GITHUB_TOKEN=ghp_...

# Speech
WHISPER_MODEL=base           # tiny | base | small | medium
TTS_ENGINE=pyttsx3           # pyttsx3 | coqui | espeak | auto
TTS_VOICE=american           # prefers clear US-English voices
TTS_ESPEAK_VOICE=en-us       # fallback backend voice if espeak is used

# Google Calendar
GOOGLE_CLIENT_ID=...         # OAuth web app client id
GOOGLE_CLIENT_SECRET=...     # OAuth web app client secret
GOOGLE_REDIRECT_URI=http://localhost:8001/calendar/google/callback
GOOGLE_FRONTEND_URL=http://localhost:5050
GOOGLE_CALENDAR_ID=primary
```

---

## Google Calendar Setup

1. Create a Google OAuth client for a web application.
2. Enable the Google Calendar API for that project.
3. Add `http://localhost:8001/calendar/google/callback` as an authorized redirect URI.
4. Put the client id and secret into `.env`, rebuild with `docker compose up -d --build`, then open the new `CAL` tab in the UI.

Once connected, the brief and chat views use upcoming events as schedule context.

---

## Folder Structure

```
jarvis-ai-brain/
├── backend/
│   ├── main.py                  # FastAPI app + CORS
│   ├── routers/
│   │   ├── context.py           # GET/POST /context
│   │   ├── ingest.py            # /ingest/github, /ingest/external
│   │   ├── brief.py             # GET /brief
│   │   ├── chat.py              # POST /chat
│   │   └── voice.py             # POST /voice/input, /voice/output
│   ├── services/
│   │   ├── llm.py               # Ollama + Groq chat_completion()
│   │   ├── rag.py               # Qdrant + local keyword fallback
│   │   ├── github.py            # GitHub API + fallback data
│   │   ├── hn.py                # Hacker News Firebase API
│   │   ├── tts.py               # Coqui / pyttsx3 / espeak / silent WAV
│   │   ├── stt.py               # Whisper / faster-whisper
│   │   └── store.py             # In-memory + JSON persistence
│   ├── data/                    # Persisted JSON state + knowledge store
│   ├── requirements.txt
│   └── Dockerfile
├── frontend/
│   ├── app/
│   │   ├── page.js              # Main layout: brain + side panel
│   │   ├── layout.js            # Root HTML + fonts
│   │   ├── globals.css          # Cyberpunk design system
│   │   └── store.js             # Zustand global state + API calls
│   ├── components/
│   │   ├── BrainGraph.jsx       # React Three Fiber 3D graph
│   │   ├── BriefPanel.jsx       # Daily brief UI
│   │   ├── ChatPanel.jsx        # JARVIS chat UI
│   │   ├── VoicePanel.jsx       # Voice record/play UI
│   │   ├── NodePanel.jsx        # Clicked node detail
│   │   └── HUD.jsx              # Top status bar
│   ├── .env.local
│   ├── next.config.js
│   ├── package.json
│   └── Dockerfile
├── docker-compose.yml
├── .env.example
├── start.bat                    # Windows one-click start
└── README.md
```

---

## Troubleshooting

| Issue | Fix |
|---|---|
| Docker daemon not found | Start Docker Desktop |
| Ollama timeout | Run `ollama serve` separately, or add `GROQ_API_KEY` |
| Microphone not working | Use Chrome/Edge; allow mic in browser settings |
| TTS silent output | Backend TTS fell back to silent WAV; browser SpeechSynthesis still works |
| 3D graph empty | Click `+ GITHUB` and ingest your repos |
| Qdrant connection refused | Run `docker-compose up qdrant -d` first |
| Whisper model slow | Switch to `WHISPER_MODEL=tiny` in `.env` |

---

## Extending JARVIS

- **Add YouTube scraping**: implement `services/youtube.py` using yt-dlp
- **Add a calendar agent**: `POST /context` with upcoming events from Google Calendar API
- **Switch LLM**: change `OLLAMA_MODEL=codellama` for code-focused queries
- **Upgrade TTS**: set `TTS_ENGINE=coqui` and install `TTS` package for neural voice
- **Persistent chat history**: replace `_history` list in `routers/chat.py` with SQLite
