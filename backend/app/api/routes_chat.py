import json
from typing import List, Optional

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from app.services import chat_history, jarvis_orchestrator, vault

router = APIRouter(tags=["chat"])


class ChatMessage(BaseModel):
    message: str
    include_context: bool = True
    session_id: Optional[str] = None


class SaveChatRequest(BaseModel):
    content: str
    title: Optional[str] = None
    folder: str = "Chat"


class ConfirmActionRequest(BaseModel):
    action_id: str
    session_id: Optional[str] = None


@router.get("/chat/stream")
async def chat_stream(message: str, session_id: Optional[str] = None):
    """SSE streaming stub — streams full reply when Ollama available."""

    async def event_gen():
        result = await jarvis_orchestrator.run_chat(message, session_id=session_id)
        yield f"data: {{\"type\":\"token\",\"text\":{json.dumps(result['reply'])}}}\n\n"
        yield f"data: {{\"type\":\"done\",\"session_id\":{json.dumps(result['session_id'])}}}\n\n"

    return StreamingResponse(event_gen(), media_type="text/event-stream")


@router.post("/chat")
async def chat(payload: ChatMessage):
    if not payload.message.strip():
        raise HTTPException(400, "Message is empty")
    return await jarvis_orchestrator.run_chat(
        payload.message,
        session_id=payload.session_id,
        include_context=payload.include_context,
    )


@router.post("/chat/save")
async def save_message(payload: SaveChatRequest):
    if not payload.content.strip():
        raise HTTPException(400, "Content is empty")
    saved = vault.save_markdown(
        payload.content,
        title=payload.title,
        folder=payload.folder,
        source="jarvis-chat",
    )
    return {"saved": saved}


@router.post("/chat/action/confirm")
async def confirm_action(payload: ConfirmActionRequest):
    return await jarvis_orchestrator.confirm_action(payload.action_id, payload.session_id)


@router.get("/chat/sessions")
async def list_sessions():
    return {"sessions": chat_history.list_sessions()}


@router.post("/chat/sessions")
async def create_session(title: str = "New chat"):
    return chat_history.create_session(title)


@router.get("/chat/sessions/{session_id}")
async def get_session_messages(session_id: str):
    if not chat_history.get_session(session_id):
        raise HTTPException(404, "Session not found")
    return {
        "session": chat_history.get_session(session_id),
        "messages": chat_history.get_messages(session_id),
    }


@router.delete("/chat/sessions/{session_id}")
async def delete_session(session_id: str):
    if not chat_history.delete_session(session_id):
        raise HTTPException(404, "Session not found")
    return {"status": "deleted"}


@router.get("/chat/history")
async def get_history(session_id: Optional[str] = None):
    if session_id:
        return {"history": chat_history.get_messages(session_id), "session_id": session_id}
    sessions = chat_history.list_sessions()
    if not sessions:
        sid = chat_history.create_session()["id"]
        return {"history": [], "session_id": sid, "sessions": [chat_history.get_session(sid)]}
    sid = sessions[0]["id"]
    return {
        "history": chat_history.get_messages(sid),
        "session_id": sid,
        "sessions": sessions,
    }


@router.delete("/chat/history")
async def clear_history(session_id: Optional[str] = None):
    if session_id:
        chat_history.delete_session(session_id)
    return {"status": "cleared"}
