from __future__ import annotations

from typing import Dict, List

from app.services.embeddings import get_embedder
from app.services.llm_client import llm_client
from app.services.storage import append_chat, get_chat, get_context
from app.services.vector_store import get_vector_store


def _system_prompt(context: Dict, snippets: List[Dict]) -> str:
    goals = context.get("daily_goals", [])
    active_project = context.get("active_project", "")
    snippet_text = "\n\n".join(
        [
            f"[{i + 1}] {s.get('title', 'untitled')} ({s.get('source', 'unknown')})\n"
            f"{s.get('summary', '')}\n{s.get('text', '')[:350]}"
            for i, s in enumerate(snippets)
        ]
    )
    return (
        "You are JARVIS, a concise personal AI operating system.\n"
        "Give actionable next steps tied to the user's goals and project.\n\n"
        f"Active project: {active_project}\n"
        f"Daily goals: {', '.join(goals) if goals else 'None set yet'}\n\n"
        "Retrieved context snippets:\n"
        f"{snippet_text if snippet_text else 'No indexed snippets found.'}"
    )


async def chat_reply(user_message: str) -> Dict:
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
            snippets.append(payload)
            sources.append(
                {
                    "id": hit.get("id", ""),
                    "title": payload.get("title", ""),
                    "source": payload.get("source", ""),
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

    try:
        reply = await llm_client.chat(messages)
    except Exception:
        goal_text = ", ".join(context.get("daily_goals", [])) or "No goals set."
        reply = (
            "JARVIS fallback mode: The model is unavailable. "
            f"Focus today on: {goal_text}. "
            "Run external ingestion, pick 3 repo topics, and define one concrete action per topic."
        )

    append_chat("user", user_message)
    append_chat("assistant", reply)
    return {"reply": reply, "sources": sources}
