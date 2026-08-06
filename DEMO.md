# 5-minute JARVIS demo (v2 + Demo Builder)

## Local URLs (Docker)

- **Frontend:** http://localhost:5050
- **Backend:** http://localhost:8001
- **API docs:** http://localhost:8001/docs
- **Qdrant:** http://localhost:6335/dashboard

Native (optional): frontend `:3000`, backend `:8002`.

## Walkthrough

1. Open **http://localhost:5050** — lands on **Dashboard** (brain stage + widgets). Wake is **opt-in** (Lab → Wake).
2. Work → Chat: `Remember the word ORBIT` then `What word?` (multi-turn + SSE stream). Needs Ollama or `GROQ_API_KEY`.
3. Click **+ NEW** in Threads, send a different message, switch back — sessions isolate.
4. **Site builder beat:** Chat `build me a website for a coastal linen shop called Shore & Thread` → confirm if prompted → **OPEN PREVIEW / EDIT / PUBLISH**. Or Lab → **Demos** → BUILD.
5. In Demos: Monaco edit `src/App.jsx` → SAVE → REBUILD → iframe updates. Optional **PUBLISH** (needs `cloudflared`).
6. Lab → Graph: click a node → NodePanel → Ask JARVIS. Demos appear on the graph; House layer is off.
7. **Research:** Chat `Research … and generate a report` → Groq Compound web search → vault `JARVIS/Reports/`.
8. Lab → Vision / Wake: camera capture (Groq Qwen vision), wake opt-in.
9. API checks:
   - `GET http://localhost:8001/health`
   - `GET http://localhost:8001/graph`
   - `GET http://localhost:8001/house/status` → `disabled: true`
   - `GET http://localhost:8001/demos`
   - `POST http://localhost:8001/research/search` with `{"query":"…"}`

House automation UI is parked — do not demo HA writes.
