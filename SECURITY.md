# JARVIS AI Brain — Threat Model (G0) & Security Gates

## Assets
- Local FastAPI control plane (chat, vault, house actuators)
- Google OAuth tokens, optional HA long-lived token
- Microphone / optional camera (opt-in)
- Obsidian vault markdown

## Adversaries
- LAN peer on shared Wi-Fi
- Malicious webpage (if API exposed beyond loopback)
- Prompt injection via vault notes / HN / RAG into tool proposals
- Confused deputy (model proposes unlock; UI auto-confirms)

## Mitigations shipped
| Gate | Status |
|------|--------|
| G0 Threat model | This file |
| G1 Loopback preferred | Document: bind uvicorn to 127.0.0.1 for local; Docker publishes ports — treat as LAN surface |
| G2 API token | `JARVIS_API_TOKEN` + `JarvisAuthMiddleware` (optional until set) |
| G3–G4 Secrets | `JARVIS_MASTER_KEY` Fernet for Google tokens; HA token via env only |
| G5–G6 Allowlists | `HA_ENTITY_ALLOWLIST`; critical domains blocked unless `HA_ALLOW_CRITICAL=1` |
| G7 Idempotency | Confirm tokens single-use; pending rows marked confirmed |
| G8 Confirm binding | SQLite `pending_actions` + `confirm_token` + TTL |
| G9 Audit | `audit_log` table |
| G10 Dry-run | Propose path (`confirm=false`) before execute |
| G11 Kill switch | `HOUSE_WRITES_ENABLED=0` default |
| G12 Degrade | HA missing → empty list / Sim still works |

## Non-goals (v1)
- Always-on wake word as write authority
- Multi-LLM agent fan-out
- Redis bus
