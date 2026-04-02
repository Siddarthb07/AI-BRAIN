![JARVIS AI Brain banner](https://img.shields.io/badge/JARVIS-AI%20Brain-0ea5e9?style=for-the-badge)
![Python](https://img.shields.io/badge/Python-3.10%2B-3776AB?style=flat-square&logo=python&logoColor=white)
![FastAPI](https://img.shields.io/badge/FastAPI-Local-009688?style=flat-square&logo=fastapi&logoColor=white)
![Next.js](https://img.shields.io/badge/Next.js-14-000000?style=flat-square&logo=nextdotjs&logoColor=white)
![Three.js](https://img.shields.io/badge/Three.js-3D-000000?style=flat-square&logo=three.js&logoColor=white)
![License](https://img.shields.io/badge/License-MIT-10b981?style=flat-square)

# JARVIS AI Brain (Local MVP)

JARVIS is a local-first AI command system with a living 3D brain interface. It ingests GitHub repos, maps topics, pulls live learning links, and speaks briefings on demand.

Fully local, zero-cost MVP with:

1. Command Layer (daily execution dashboard)
2. Conversational Interface (text + voice)
3. No paid APIs

## Stack

- Backend: FastAPI (Python)
- Frontend: Next.js (React)
- LLM: Ollama (default) or Groq (optional cloud fallback)
- Embeddings: `sentence-transformers` (local)
- Vector DB: Qdrant (Docker)
- STT: Whisper via `faster-whisper` (local)
- TTS: Coqui TTS (local)

## Folder Structure

```text
.
├─ backend/
│  ├─ app/
│  │  ├─ api/
│  │  │  ├─ routes_brief.py
│  │  │  ├─ routes_chat.py
│  │  │  ├─ routes_context.py
│  │  │  ├─ routes_ingest.py
│  │  │  └─ routes_voice.py
│  │  ├─ brief/
│  │  │  └─ generator.py
│  │  ├─ chat/
│  │  │  └─ rag_chat.py
│  │  ├─ ingestion/
│  │  │  ├─ external_ingestion.py
│  │  │  └─ github_ingestion.py
│  │  ├─ models/
│  │  │  └─ schemas.py
│  │  ├─ ranking/
│  │  │  └─ scorer.py
│  │  ├─ services/
│  │  │  ├─ config.py
│  │  │  ├─ embeddings.py
│  │  │  ├─ ollama_client.py
│  │  │  ├─ storage.py
│  │  │  ├─ text_utils.py
│  │  │  └─ vector_store.py
│  │  ├─ voice/
│  │  │  ├─ tts_service.py
│  │  │  └─ whisper_service.py
│  │  └─ main.py
│  ├─ data/
│  ├─ requirements.txt
│  └─ .env.example
├─ frontend/
│  ├─ app/
│  │  ├─ globals.css
│  │  ├─ layout.tsx
│  │  └─ page.tsx
│  ├─ components/
│  │  ├─ ChatPanel.tsx
│  │  └─ Dashboard.tsx
│  ├─ lib/
│  │  └─ api.ts
│  ├─ package.json
│  └─ .env.local.example
├─ docker-compose.yml
└─ README.md
```

## Step-by-Step Setup

Prerequisites:

- Python 3.10+
- Node.js 18+
- Docker Desktop
- `ffmpeg` installed and available in PATH (required by Whisper)

### 1) Start local infra (Qdrant + Ollama)

```bash
docker compose up -d
```

### 2) Pull an Ollama model

```bash
ollama pull llama3
# or faster on CPU:
# ollama pull mistral
```

If you run Ollama in Docker only, exec into the container:

```bash
docker exec -it athera-ollama ollama pull llama3
```

### 3) Backend setup

```bash
cd backend
python -m venv .venv
# Windows
.venv\Scripts\activate
# macOS/Linux
# source .venv/bin/activate
pip install -r requirements.txt
# Windows: copy .env.example .env
# macOS/Linux: cp .env.example .env
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

Optional: use Groq instead of local Ollama for `/chat`

```env
LLM_PROVIDER=groq
GROQ_API_KEY=gsk_xxx
GROQ_MODEL=llama-3.1-8b-instant
```

If you keep `LLM_PROVIDER=ollama` (default), no Groq key is used.

### 4) Frontend setup

```bash
cd frontend
npm install
# Windows: copy .env.local.example .env.local
# macOS/Linux: cp .env.local.example .env.local
npm run dev
```

Open `http://localhost:5173`.

## API Endpoints

- `POST /context` store local user context
- `GET /context` fetch current context
- `POST /ingest/github` ingest one repo, extract tech stack/keywords, chunk + embed + store
- `GET /ingest/external` ingest Hacker News + GitHub trending
- `GET /brief` generate ranked top-5 insights
- `POST /chat` RAG chat via configured LLM provider (Ollama or Groq)
- `POST /voice/input` audio -> text (Whisper)
- `POST /voice/output` text -> audio (Coqui TTS)

## Example API Calls

### Save context

```bash
curl -X POST http://localhost:8000/context \
  -H "Content-Type: application/json" \
  -d '{
    "daily_goals": ["Ship FastAPI ranking engine", "Test voice loop"],
    "active_project": "JARVIS AI Brain"
  }'
```

### Ingest a GitHub repository

```bash
curl -X POST http://localhost:8000/ingest/github \
  -H "Content-Type: application/json" \
  -d '{"repo":"tiangolo/fastapi"}'
```

### Ingest external signals

```bash
curl http://localhost:8000/ingest/external
```

### Generate daily brief

```bash
curl http://localhost:8000/brief
```

### Chat

```bash
curl -X POST http://localhost:8000/chat \
  -H "Content-Type: application/json" \
  -d '{"message":"What should I focus on today for my project?"}'
```

### Voice input (transcribe)

```bash
curl -X POST http://localhost:8000/voice/input \
  -F "file=@sample.webm"
```

### Voice output (synthesize)

```bash
curl -X POST http://localhost:8000/voice/output \
  -H "Content-Type: application/json" \
  -d '{"text":"Your top priority is to implement the ranking engine."}' \
  --output reply.wav
```

## Sample Outputs

### `GET /brief`

```json
{
  "insights": [
    {
      "signal": "tiangolo/fastapi",
      "why_it_matters": "This github_repo signal aligns with `JARVIS AI Brain` (project relevance 0.84, goal alignment 0.79).",
      "action": "Scan `tiangolo/fastapi` and extract one implementation pattern to apply to your active project today.",
      "effort": "30-45 min",
      "priority": "high"
    }
  ]
}
```

### `POST /chat`

```json
{
  "reply": "Start with the ranking engine and brief quality. In the next 90 minutes: 1) ingest external + repo data, 2) validate score weights with 10 signals, 3) tighten action outputs to one concrete next step each.",
  "sources": [
    {
      "id": "a8d6...",
      "title": "tiangolo/fastapi (chunk 1)",
      "source": "github_repo",
      "score": 0.8123
    }
  ]
}
```

## Notes

- First Whisper/Coqui run downloads model files; initial call can take time.
- To keep latency closer to 3s:
  - use smaller Ollama model (`mistral`)
  - keep context chunks short
  - run with CPU-optimized whisper (`base`, `int8`) or GPU if available
- All data is local in `backend/data` and Qdrant volume under `infra/qdrant/storage`.
