# 5-minute JARVIS demo (v2)

## Local URLs (this machine)

- **Frontend:** http://localhost:3000
- **Backend:** http://localhost:8002
- **API docs:** http://localhost:8002/docs
- **Qdrant:** http://localhost:6335/dashboard

> Port 8001 was already taken by another local service, so JARVIS API uses **8002**. Frontend `.env.local` points at it.

## Walkthrough

1. Open **http://localhost:3000** — lands on **Dashboard** (brain stage + widgets).
2. Glance Brief / House strip / Attention LEDs.
3. On House strip, toggle **Lab Lights** → confirm the pending action.
4. Switch to **Work → Chat**: `Remember the word ORBIT` then `What word?` (multi-turn + stream). Requires Ollama or `GROQ_API_KEY`.
5. **Lab → Graph**: click a node → NodePanel → Ask JARVIS.
6. **Lab → Vision / Wake**: stubs visible (camera off, wake opt-in off).
7. API checks:
   - `GET http://localhost:8002/health`
   - `GET http://localhost:8002/graph`
   - `GET http://localhost:8002/house/entities`
