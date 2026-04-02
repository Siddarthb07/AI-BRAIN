from fastapi import APIRouter

from app.chat.rag_chat import generate_chat_reply
from app.models.schemas import ChatIn, ChatOut

router = APIRouter(tags=["chat"])


@router.post("/chat", response_model=ChatOut)
async def chat(payload: ChatIn) -> ChatOut:
    result = await generate_chat_reply(payload.message)
    return ChatOut(**result)

