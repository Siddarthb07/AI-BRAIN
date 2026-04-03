from datetime import datetime
from typing import List

from fastapi import APIRouter
from pydantic import BaseModel

from services import google_calendar, llm, rag, store

router = APIRouter()

SYSTEM_PROMPT = """You are JARVIS, an elite AI assistant embedded in a developer's brain interface.
You have access to repository context, today's tech signals, and the user's current goals and schedule.
Be concise, sharp, technically precise, and actionable.
Think like a senior engineer and strategic advisor combined.
Use calendar context when it affects prioritization, timing, or tradeoffs.
Speak in first person as JARVIS. Keep responses under 200 words unless asked for detail."""

_history: List[dict] = []


class ChatMessage(BaseModel):
    message: str
    include_context: bool = True
    reset_history: bool = False


@router.post("")
async def chat(payload: ChatMessage):
    global _history

    if payload.reset_history:
        _history = []

    context_str = ""
    sources_used = 0
    if payload.include_context:
        results = await rag.search(payload.message, top_k=3)
        rag_context = rag.get_context_string(results)
        sources_used = len(results)

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
                print(f"[Chat] Calendar sync failed: {exc}")

        context_str = (
            f"Developer context: Active project={ctx.get('active_project', 'unknown')}, "
            f"Goals={', '.join(ctx.get('daily_goals', []))}, "
            f"Repos={repo_names}\n\n"
        )
        context_str += calendar_context
        if rag_context:
            context_str += f"Relevant knowledge:\n{rag_context}"

    response = await llm.chat_completion(
        prompt=payload.message,
        system=SYSTEM_PROMPT,
        context=context_str,
    )

    _history.append({"role": "user", "content": payload.message, "timestamp": datetime.now().isoformat()})
    _history.append({"role": "assistant", "content": response, "timestamp": datetime.now().isoformat()})

    if len(_history) > 20:
        _history = _history[-20:]

    return {
        "response": response,
        "sources": sources_used,
        "context_used": bool(context_str),
        "timestamp": datetime.now().isoformat(),
    }


@router.get("/history")
async def get_history():
    return {"history": _history, "count": len(_history)}


@router.delete("/history")
async def clear_history():
    global _history
    _history = []
    return {"status": "cleared"}
