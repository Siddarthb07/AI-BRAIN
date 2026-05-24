from typing import List

import httpx

from app.services.config import get_settings


class LLMOfflineError(RuntimeError):
    """Raised when no LLM backend is reachable."""


class LLMClient:
    async def chat(self, messages: List[dict]) -> str:
        settings = get_settings()
        provider = settings.llm_provider.strip().lower()
        if provider == "groq":
            return await self._groq(messages)
        return await self._ollama(messages)

    async def _ollama(self, messages: List[dict]) -> str:
        settings = get_settings()
        payload = {
            "model": settings.ollama_model,
            "messages": messages,
            "stream": False,
            "options": {"temperature": 0.2, "num_predict": settings.llm_max_tokens},
        }
        try:
            async with httpx.AsyncClient(timeout=httpx.Timeout(12.0, connect=4.0)) as client:
                resp = await client.post(f"{settings.ollama_url}/api/chat", json=payload)
                resp.raise_for_status()
                data = resp.json()
                return data.get("message", {}).get("content", "").strip()
        except (httpx.HTTPError, httpx.TimeoutException) as exc:
            raise LLMOfflineError("No LLM backend available. Start Ollama or configure GROQ_API_KEY.") from exc

    async def _groq(self, messages: List[dict]) -> str:
        settings = get_settings()
        if not settings.groq_api_key:
            raise RuntimeError("GROQ_API_KEY not set")
        payload = {
            "model": settings.groq_model,
            "messages": messages,
            "temperature": 0.2,
            "stream": False,
        }
        headers = {"Authorization": f"Bearer {settings.groq_api_key}"}
        try:
            async with httpx.AsyncClient(timeout=httpx.Timeout(12.0, connect=4.0)) as client:
                resp = await client.post(
                    f"{settings.groq_url}/chat/completions", json=payload, headers=headers
                )
                resp.raise_for_status()
                data = resp.json()
                return data.get("choices", [{}])[0].get("message", {}).get("content", "").strip()
        except (httpx.HTTPError, httpx.TimeoutException) as exc:
            raise LLMOfflineError("No LLM backend available. Start Ollama or configure GROQ_API_KEY.") from exc


llm_client = LLMClient()
