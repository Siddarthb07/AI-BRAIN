import os
from typing import Optional

import httpx

from services.config import demo_mode, llm_max_tokens

OLLAMA_URL = os.getenv("OLLAMA_URL", "http://localhost:11434")
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "llama3.2")
GROQ_API_KEY = os.getenv("GROQ_API_KEY", "")
GROQ_MODEL = os.getenv("GROQ_MODEL", "llama-3.3-70b-versatile")

FALLBACK_RESPONSES = {
    "chat": "I'm currently operating in offline mode. Connect Ollama or set GROQ_API_KEY.",
    "brief": "Daily Brief unavailable — LLM offline.",
    "summary": "System summary unavailable in offline mode.",
}


class LLMOfflineError(Exception):
    """Raised when no LLM backend is reachable and DEMO_MODE is off."""


async def chat_completion(prompt: str, system: str = "", context: str = "") -> str:
    full_system = system or (
        "You are JARVIS, a local chief-of-staff assistant. "
        "Be direct, proactive, and factual."
    )
    messages = []
    if context:
        messages.append({"role": "user", "content": f"Context:\n{context}"})
        messages.append({"role": "assistant", "content": "Understood. I have your context loaded."})
    messages.append({"role": "user", "content": prompt})

    max_tokens = llm_max_tokens()

    try:
        async with httpx.AsyncClient(timeout=60.0) as client:
            resp = await client.post(
                f"{OLLAMA_URL}/api/chat",
                json={
                    "model": OLLAMA_MODEL,
                    "messages": [{"role": "system", "content": full_system}] + messages,
                    "stream": False,
                    "options": {"temperature": 0.7, "num_predict": max_tokens},
                },
            )
            if resp.status_code == 200:
                data = resp.json()
                return data["message"]["content"]
    except Exception as e:
        print(f"[Ollama] Failed: {e}")

    if GROQ_API_KEY:
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                resp = await client.post(
                    "https://api.groq.com/openai/v1/chat/completions",
                    headers={"Authorization": f"Bearer {GROQ_API_KEY}", "Content-Type": "application/json"},
                    json={
                        "model": GROQ_MODEL,
                        "messages": [{"role": "system", "content": full_system}] + messages,
                        "max_tokens": min(max_tokens, 8192),
                        "temperature": 0.7,
                    },
                )
                if resp.status_code == 200:
                    data = resp.json()
                    return data["choices"][0]["message"]["content"]
        except Exception as e:
            print(f"[Groq] Failed: {e}")

    if demo_mode():
        return FALLBACK_RESPONSES.get("chat", "JARVIS offline.")

    raise LLMOfflineError("No LLM backend available. Start Ollama or configure GROQ_API_KEY.")


async def is_ollama_available() -> bool:
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.get(f"{OLLAMA_URL}/api/tags")
            return resp.status_code == 200
    except Exception:
        return False
