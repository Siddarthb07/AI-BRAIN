"""JARVIS Orchestration Layer v0 — context assembly + action proposals."""

from __future__ import annotations

import json
import uuid
from typing import Any

from services import chat_history, google_calendar, llm, rag, store, vault
from services.llm import LLMOfflineError

SYSTEM_PROMPT = """You are JARVIS, a local chief-of-staff assistant. Help the user plan, write, and organize using their Obsidian vault and indexed knowledge. Be direct, proactive, and factual. Propose next actions as bullet points. Never claim consciousness or fabricate data.

When helpful, end with a JSON block on its own line:
ACTIONS: [{"type":"save_note|sync_vault|search_vault|write_brief","label":"...","params":{}}]
Only include actions that make sense. Most replies need zero actions."""

_PENDING: dict[str, dict[str, Any]] = {}


async def assemble_context(message: str, include_context: bool = True) -> tuple[str, list[dict]]:
    if not include_context:
        return "", []

    results = await rag.search(message, top_k=5)
    rag_context = rag.get_context_string(results)
    citations = rag.format_citations(results)

    ctx = store.get_context()
    repos = store.get_repos()
    repo_names = ", ".join(repo["name"] for repo in repos[:8]) if repos else "none indexed yet"

    calendar_context = ""
    if google_calendar.is_connected():
        try:
            events = await google_calendar.get_upcoming_events(force_refresh=False, max_results=4)
            event_lines = google_calendar.events_to_context(events, limit=4)
            if event_lines:
                calendar_context = f"Upcoming schedule:\n{event_lines}\n\n"
        except Exception as exc:
            print(f"[JOL] Calendar sync failed: {exc}")

    vault_st = vault.vault_status()
    parts = [
        f"Developer context: Active project={ctx.get('active_project', 'unknown')}, "
        f"Goals={', '.join(ctx.get('daily_goals', []))}, Repos={repo_names}",
        f"Vault: {vault_st.get('vault_path')} ({vault_st.get('note_count', 0)} notes)",
    ]
    if calendar_context:
        parts.append(calendar_context.strip())
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
    import json
    from datetime import datetime, timezone

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

    try:
        raw = await llm.chat_completion(message, system=SYSTEM_PROMPT, context=context_str)
        llm_offline = False
    except LLMOfflineError as exc:
        raw = str(exc)
        llm_offline = True

    reply, actions = _parse_actions(raw) if not llm_offline else (raw, [])

    chat_history.append_message(sid, "user", message)
    chat_history.append_message(
        sid,
        "assistant",
        reply,
        meta={"citations": citations, "actions": [a["id"] for a in actions], "llm_offline": llm_offline},
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
            from routers import brief as brief_router

            data = await brief_router.get_brief()
            md = _brief_to_markdown(data)
            saved = vault.save_markdown(md, title=f"Brief {data.get('date', '')}", folder="Briefs", source="jarvis-brief")
            result = saved.get("relative_path", "saved")
        elif atype == "save_note":
            content = params.get("content") or params.get("body") or ""
            if not content:
                return {"ok": False, "error": "No content to save"}
            saved = vault.save_markdown(content, title=params.get("title"), folder=params.get("folder", "Chat"))
            result = saved.get("relative_path", "saved")
        elif atype == "search_vault":
            q = params.get("query") or params.get("q") or ""
            hits = await rag.search(q, top_k=5)
            result = rag.get_context_string(hits) or "no hits"
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
    lines = [f"# Daily Brief — {data.get('date', '')}", "", data.get("greeting", ""), ""]
    lines.append("## Priority actions")
    for item in data.get("priority_actions") or []:
        lines.append(f"- [ ] {item}")
    lines.append("")
    lines.append("## Insights")
    for item in data.get("insights") or []:
        lines.append(f"- {item}")
    return "\n".join(lines)
