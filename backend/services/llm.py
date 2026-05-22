import os
import httpx
from typing import Optional

OLLAMA_URL = os.getenv("OLLAMA_URL", "http://localhost:11434")
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "llama3.2")
GROQ_API_KEY = os.getenv("GROQ_API_KEY", "")
GROQ_MODEL = os.getenv("GROQ_MODEL", "llama-3.3-70b-versatile")

FALLBACK_RESPONSES = {
    "chat": "I'm currently operating in offline mode. Based on your repository context, focus on completing your highest-priority task today. Break it into 25-minute focused sprints.",
    "brief": "Daily Brief: 1) Review open PRs and issues. 2) Focus on your top project milestone. 3) Allocate 2 hours for deep work. 4) Check HN for relevant tech news. Stay sharp.",
    "summary": "System summary unavailable in offline mode. Your projects are indexed and ready."
}

async def chat_completion(prompt: str, system: str = "", context: str = "") -> str:
    full_system = system or "You are JARVIS, a highly intelligent AI assistant for a developer. Be concise, actionable, and insightful."
    messages = []
    if context:
        messages.append({"role": "user", "content": f"Context:\n{context}"})
        messages.append({"role": "assistant", "content": "Understood. I have your context loaded."})
    messages.append({"role": "user", "content": prompt})

    # Try Ollama first
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.post(
                f"{OLLAMA_URL}/api/chat",
                json={
                    "model": OLLAMA_MODEL,
                    "messages": [{"role": "system", "content": full_system}] + messages,
                    "stream": False,
                    "options": {"temperature": 0.7, "num_predict": 512}
                }
            )
            if resp.status_code == 200:
                data = resp.json()
                return data["message"]["content"]
    except Exception as e:
        print(f"[Ollama] Failed: {e}")

    # Try Groq
    if GROQ_API_KEY:
        try:
            async with httpx.AsyncClient(timeout=20.0) as client:
                resp = await client.post(
                    "https://api.groq.com/openai/v1/chat/completions",
                    headers={"Authorization": f"Bearer {GROQ_API_KEY}", "Content-Type": "application/json"},
                    json={
                        "model": GROQ_MODEL,
                        "messages": [{"role": "system", "content": full_system}] + messages,
                        "max_tokens": 512,
                        "temperature": 0.7
                    }
                )
                if resp.status_code == 200:
                    data = resp.json()
                    return data["choices"][0]["message"]["content"]
        except Exception as e:
            print(f"[Groq] Failed: {e}")

    return FALLBACK_RESPONSES.get("chat", "JARVIS offline — stay focused on your top priority.")

async def is_ollama_available() -> bool:
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.get(f"{OLLAMA_URL}/api/tags")
            return resp.status_code == 200
    except:
        return False
