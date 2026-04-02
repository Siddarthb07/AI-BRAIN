from typing import List

import httpx

from app.services.config import get_settings


class OllamaClient:
    async def _ollama_chat(self, messages: List[dict]) -> str:
        settings = get_settings()
        payload = {
            "model": settings.ollama_model,
            "messages": messages,
            "stream": False,
            "options": {"temperature": 0.2},
        }
        async with httpx.AsyncClient(timeout=60.0) as client:
            response = await client.post(f"{settings.ollama_url}/api/chat", json=payload)
            response.raise_for_status()
            data = response.json()
            return data.get("message", {}).get("content", "").strip()

    async def _groq_chat(self, messages: List[dict]) -> str:
        settings = get_settings()
        if not settings.groq_api_key:
            raise RuntimeError("GROQ_API_KEY is required when LLM_PROVIDER=groq")

        payload = {
            "model": settings.groq_model,
            "messages": messages,
            "temperature": 0.2,
            "stream": False,
        }
        headers = {
            "Authorization": f"Bearer {settings.groq_api_key}",
            "Content-Type": "application/json",
        }

        async with httpx.AsyncClient(timeout=60.0) as client:
            response = await client.post(
                f"{settings.groq_url}/chat/completions", json=payload, headers=headers
            )
            response.raise_for_status()
            data = response.json()
            return data.get("choices", [{}])[0].get("message", {}).get("content", "").strip()

    async def chat(self, messages: List[dict]) -> str:
        settings = get_settings()
        provider = settings.llm_provider.strip().lower()
        if provider == "groq":
            return await self._groq_chat(messages)
        return await self._ollama_chat(messages)


ollama_client = OllamaClient()
