from __future__ import annotations

from typing import Dict, List

from app.services.config import get_settings
from app.services.embeddings import get_embedder
from app.services.llm_client import llm_client
from app.services.storage import append_chat, get_chat, get_context
from app.services.vector_store import get_vector_store


JARVIS_SYSTEM = (
    "You are JARVIS, a local chief-of-staff assistant. Help the user plan, write, and organize "
    "using their Obsidian vault and indexed knowledge. Be direct, proactive, and factual. "
    "Propose next actions as bullet points. Never claim consciousness or fabricate data."
)


def _format_citations(snippets: List[Dict]) -> List[Dict]:
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


def _system_prompt(context: Dict, snippets: List[Dict]) -> str:
    goals = context.get("daily_goals", [])
    active_project = context.get("active_project", "")
    snippet_text = "\n\n".join(
        [
            f"[{i + 1}] ({s.get('path', s.get('source', 'doc'))}) {s.get('title', 'untitled')}\n"
            f"{s.get('summary', '')}\n{s.get('text', '')[:350]}"
            for i, s in enumerate(snippets)
        ]
    )
    return (
        f"{JARVIS_SYSTEM}\n\n"
        f"Active project: {active_project}\n"
        f"Daily goals: {', '.join(goals) if goals else 'None set yet'}\n\n"
        "Retrieved context snippets:\n"
        f"{snippet_text if snippet_text else 'No indexed snippets found.'}"
    )


async def chat_reply(user_message: str) -> Dict:
    settings = get_settings()
    context = get_context()
    history = get_chat(limit=6)

    sources: List[Dict] = []
    snippets: List[Dict] = []
    try:
        embedder = get_embedder()
        query_vec = embedder.embed_text(user_message)
        hits = get_vector_store().search(query_vec, limit=5)
        for hit in hits:
            payload = hit.get("payload", {})
            payload["score"] = hit.get("score", 0.0)
            snippets.append(payload)
            sources.append(
                {
                    "id": hit.get("id", ""),
                    "title": payload.get("title", ""),
                    "source": payload.get("path") or payload.get("source", ""),
                    "score": round(hit.get("score", 0.0), 4),
                }
            )
    except Exception:
        snippets = []
        sources = []

    messages = [{"role": "system", "content": _system_prompt(context, snippets)}]
    for msg in history:
        if msg.get("role") in {"user", "assistant"}:
            messages.append({"role": msg.get("role"), "content": msg.get("content", "")})
    messages.append({"role": "user", "content": user_message})

    llm_offline = False
    try:
        reply = await llm_client.chat(messages)
    except Exception:
        if settings.demo_mode:
            goal_text = ", ".join(context.get("daily_goals", [])) or "No goals set."
            reply = (
                "JARVIS demo mode: The model is unavailable. "
                f"Focus today on: {goal_text}."
            )
        else:
            llm_offline = True
            reply = "No LLM backend available. Start Ollama or configure GROQ_API_KEY."

    append_chat("user", user_message)
    append_chat("assistant", reply)
    return {
        "reply": reply,
        "sources": sources,
        "citations": _format_citations(snippets),
        "llm_offline": llm_offline,
    }
