from __future__ import annotations

from typing import Dict, List

from app.services.embeddings import get_embedding_service
from app.services.ollama_client import ollama_client
from app.services.storage import append_chat_message, get_chat_history, get_user_context
from app.services.vector_store import get_vector_store


def _build_system_prompt(context: Dict, snippets: List[Dict]) -> str:
    goals = context.get("daily_goals", [])
    active_project = context.get("active_project", "")
    snippet_text = "\n\n".join(
        [
            f"[{i + 1}] {s.get('title', 'untitled')} ({s.get('source', 'unknown')})\n"
            f"{s.get('summary', '')}\n{s.get('text', '')[:450]}"
            for i, s in enumerate(snippets)
        ]
    )
    return (
        "You are JARVIS, a practical personal AI operating system.\n"
        "Respond with concise, actionable guidance.\n"
        "Always tie recommendations to the user's active project and daily goals.\n\n"
        f"Active project: {active_project}\n"
        f"Daily goals: {', '.join(goals) if goals else 'None set yet'}\n\n"
        "Retrieved context snippets:\n"
        f"{snippet_text if snippet_text else 'No indexed snippets found.'}"
    )


async def generate_chat_reply(user_message: str) -> Dict:
    context = get_user_context()
    history = get_chat_history(limit=8)

    sources: List[Dict] = []
    snippets: List[Dict] = []
    try:
        embedder = get_embedding_service()
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

    messages = [{"role": "system", "content": _build_system_prompt(context, snippets)}]
    for msg in history[-6:]:
        role = msg.get("role")
        if role in {"user", "assistant"}:
            messages.append({"role": role, "content": msg.get("content", "")})
    messages.append({"role": "user", "content": user_message})

    try:
        reply = await ollama_client.chat(messages)
    except Exception as exc:
        reply = (
            "I could not reach the local Ollama server. "
            "Start Ollama and pull a model (for example: `ollama pull llama3`) "
            f"then retry. Technical detail: {exc}"
        )

    append_chat_message("user", user_message)
    append_chat_message("assistant", reply)

    return {"reply": reply, "sources": sources}
