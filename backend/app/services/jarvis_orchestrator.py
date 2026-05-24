"""JARVIS Orchestration Layer v0 — context assembly + action proposals."""

from __future__ import annotations

import json
import uuid
from datetime import datetime, timezone
from typing import Any

from app.services import chat_history, vault
from app.services.config import get_settings
from app.services.embeddings import get_embedder
from app.services.llm_client import LLMOfflineError, llm_client
from app.services.storage import get_context, get_repo_cache
from app.services.vector_store import get_vector_store

SYSTEM_PROMPT = """You are JARVIS, a local chief-of-staff assistant. Help the user plan, write, and organize using their Obsidian vault and indexed knowledge. Be direct, proactive, and factual. Propose next actions as bullet points. Never claim consciousness or fabricate data.

When helpful, end with a JSON block on its own line:
ACTIONS: [{"type":"save_note|sync_vault|search_vault|write_brief","label":"...","params":{}}]
Only include actions that make sense. Most replies need zero actions."""

_PENDING: dict[str, dict[str, Any]] = {}


def _format_citations(snippets: list[dict]) -> list[dict]:
    citations = []
    for i, s in enumerate(snippets, start=1):
        path = s.get("path") or s.get("source") or s.get("title") or "unknown"
        citations.append(
            {
                "id": i,
                "path": path,
                "snippet": (s.get("text") or s.get("summary") or "")[:200],
                "score": s.get("score"),
            }
        )
    return citations


def _context_string(snippets: list[dict]) -> str:
    if not snippets:
        return ""
    lines = []
    for i, s in enumerate(snippets, start=1):
        path = s.get("path") or s.get("source") or "doc"
        title = s.get("title") or "untitled"
        text = (s.get("text") or s.get("summary") or "")[:350]
        lines.append(f"[{i}] ({path}) {title}\n{text}")
    return "\n\n".join(lines)


async def _search(query: str, top_k: int = 5) -> list[dict]:
    try:
        embedder = get_embedder()
        query_vec = embedder.embed_text(query)
        hits = get_vector_store().search(query_vec, limit=top_k)
        snippets = []
        for hit in hits:
            payload = hit.get("payload", {})
            payload["score"] = hit.get("score", 0.0)
            snippets.append(payload)
        return snippets
    except Exception:
        return []


async def assemble_context(message: str, include_context: bool = True) -> tuple[str, list[dict]]:
    if not include_context:
        return "", []

    snippets = await _search(message, top_k=5)
    rag_context = _context_string(snippets)
    citations = _format_citations(snippets)

    ctx = get_context()
    repos = get_repo_cache()
    repo_names = ", ".join((repo.get("name") or repo.get("full_name") or "") for repo in repos[:8]) if repos else "none indexed yet"

    vault_st = vault.vault_status()
    parts = [
        f"Developer context: Active project={ctx.get('active_project', 'unknown')}, "
        f"Goals={', '.join(ctx.get('daily_goals', []))}, Repos={repo_names}",
        f"Vault: {vault_st.get('vault_path')} ({vault_st.get('note_count', 0)} notes)",
    ]
    if rag_context:
        parts.append(f"Relevant knowledge:\n{rag_context}")

    return "\n\n".join(parts), citations


def _parse_actions(raw: str) -> tuple[str, list[dict]]:
    marker = "ACTIONS:"
    if marker not in raw:
        return raw.strip(), []

    reply, _, tail = raw.partition(marker)
    actions = []
    try:
        actions = json.loads(tail.strip())
        if not isinstance(actions, list):
            actions = []
    except json.JSONDecodeError:
        actions = []

    cleaned = []
    for item in actions:
        if not isinstance(item, dict):
            continue
        action_type = item.get("type")
        if action_type not in {"save_note", "sync_vault", "search_vault", "write_brief", "open_in_explorer"}:
            continue
        aid = str(uuid.uuid4())
        entry = {
            "id": aid,
            "type": action_type,
            "label": item.get("label") or action_type.replace("_", " ").title(),
            "params": item.get("params") or {},
            "requires_confirm": True,
        }
        _PENDING[aid] = entry
        cleaned.append(entry)
    return reply.strip(), cleaned


def _audit(action_type: str, params: dict, result: str, session_id: str | None) -> None:
    log_path = vault._vault_root() / vault.VAULT_SUBROOT / "Logs" / "actions.jsonl"
    log_path.parent.mkdir(parents=True, exist_ok=True)
    line = {
        "ts": datetime.now(timezone.utc).isoformat(),
        "action_type": action_type,
        "params": params,
        "result": result,
        "session_id": session_id,
    }
    with log_path.open("a", encoding="utf-8") as f:
        f.write(json.dumps(line) + "\n")


async def run_chat(
    message: str,
    *,
    session_id: str | None = None,
    include_context: bool = True,
) -> dict[str, Any]:
    sid = chat_history.ensure_session(session_id)
    context_str, citations = await assemble_context(message, include_context)

    messages = [{"role": "system", "content": SYSTEM_PROMPT}]
    if context_str:
        messages.append({"role": "system", "content": f"Context:\n{context_str}"})
    messages.append({"role": "user", "content": message})

    try:
        raw = await llm_client.chat(messages)
        llm_offline = False
    except LLMOfflineError as exc:
        raw = str(exc)
        llm_offline = True
    except Exception:
        settings = get_settings()
        if settings.demo_mode:
            ctx = get_context()
            goal_text = ", ".join(ctx.get("daily_goals", [])) or "No goals set."
            raw = f"JARVIS demo mode: The model is unavailable. Focus today on: {goal_text}."
            llm_offline = False
        else:
            raw = "No LLM backend available. Start Ollama or configure GROQ_API_KEY."
            llm_offline = True

    reply, actions = _parse_actions(raw) if not llm_offline else (raw, [])

    chat_history.append_message(sid, "user", message)
    chat_history.append_message(
        sid,
        "assistant",
        reply,
        meta={"citations": citations, "actions": actions, "llm_offline": llm_offline},
    )

    return {
        "reply": reply,
        "session_id": sid,
        "citations": citations,
        "actions": actions,
        "sources": len(citations),
        "context_used": bool(context_str),
        "llm_offline": llm_offline,
    }


async def confirm_action(action_id: str, session_id: str | None = None) -> dict[str, Any]:
    action = _PENDING.pop(action_id, None)
    if not action:
        return {"ok": False, "error": "Unknown or expired action"}

    atype = action["type"]
    params = action.get("params") or {}
    result = "ok"

    try:
        if atype == "sync_vault":
            out = await vault.sync_vault_to_rag()
            result = f"indexed {out.get('indexed_chunks', 0)} chunks"
        elif atype == "write_brief":
            from app.brief import generate_brief

            data = generate_brief()
            md = _brief_to_markdown(data)
            saved = vault.save_markdown(
                md,
                title="Daily Brief",
                folder="Briefs",
                source="jarvis-brief",
            )
            result = saved.get("relative_path", "saved")
        elif atype == "save_note":
            content = params.get("content") or params.get("body") or ""
            if not content:
                return {"ok": False, "error": "No content to save"}
            saved = vault.save_markdown(
                content,
                title=params.get("title"),
                folder=params.get("folder", "Chat"),
            )
            result = saved.get("relative_path", "saved")
        elif atype == "search_vault":
            q = params.get("query") or params.get("q") or ""
            hits = await _search(q, top_k=5)
            result = _context_string(hits) or "no hits"
        elif atype == "open_in_explorer":
            import platform
            import subprocess

            path = vault.vault_status()["vault_path"]
            if platform.system() == "Windows":
                subprocess.Popen(["explorer", path])  # noqa: S603
            result = path
        else:
            return {"ok": False, "error": f"Unsupported action {atype}"}
    except Exception as exc:
        result = f"error: {exc}"
        _audit(atype, params, result, session_id)
        return {"ok": False, "error": str(exc)}

    _audit(atype, params, result, session_id)
    return {"ok": True, "type": atype, "result": result}


def _brief_to_markdown(data: dict) -> str:
    lines = ["# Daily Brief", "", "## Insights"]
    for item in data.get("insights") or []:
        signal = item.get("signal", "")
        action = item.get("action", "")
        lines.append(f"- **{signal}** — {item.get('why_it_matters', '')}")
        if action:
            lines.append(f"  - Action: {action}")
    return "\n".join(lines)
