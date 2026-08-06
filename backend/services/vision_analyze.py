"""Webcam / image analysis via Groq vision models (with offline fallback)."""

from __future__ import annotations

import asyncio
import base64
import os

import httpx

from services import llm
from services.config import demo_mode

GROQ_API_KEY = os.getenv("GROQ_API_KEY", "")


def _vision_models() -> list[str]:
    """Models that accept multimodal content on this account.

    Prefer Qwen3.6 27B (text+image on Groq). Llama-4 scout as optional fallback.
    """
    primary = (os.getenv("GROQ_VISION_MODEL") or "qwen/qwen3.6-27b").strip()
    fallbacks = [
        m.strip()
        for m in (
            os.getenv("GROQ_VISION_FALLBACK_MODELS")
            or "qwen/qwen3.6-27b,meta-llama/llama-4-scout-17b-16e-instruct,meta-llama/llama-4-maverick-17b-128e-instruct"
        ).split(",")
        if m.strip()
    ]
    models: list[str] = []
    for m in [primary, *fallbacks]:
        if m and m not in models:
            models.append(m)
    return models or ["qwen/qwen3.6-27b"]


def _data_url(image_bytes: bytes, mime: str = "image/jpeg") -> str:
    b64 = base64.b64encode(image_bytes).decode("ascii")
    return f"data:{mime};base64,{b64}"


def _strip_thinking(text: str) -> str:
    """Qwen reasoning models may wrap chain-of-thought in <think>…</think>."""
    if not text:
        return text
    import re

    cleaned = re.sub(r"<think>[\s\S]*?</think>", "", text, flags=re.I).strip()
    return cleaned or text.strip()


async def analyze_image(
    image_bytes: bytes,
    prompt: str = "",
    mime: str = "image/jpeg",
) -> dict:
    """Return {analysis, model, provider} for a captured frame."""
    question = (prompt or "").strip() or (
        "Describe what you see. Note objects, text, UI, code on screen, "
        "and anything actionable for a developer assistant. Be concise."
    )

    if not image_bytes:
        return {"analysis": "", "error": "empty_image", "provider": None, "model": None}

    key = (os.getenv("GROQ_API_KEY", "") or GROQ_API_KEY).strip()
    last_err = None
    if key:
        messages = [
            {
                "role": "system",
                "content": (
                    "You are JARVIS vision. Describe the camera frame clearly and "
                    "flag anything useful for engineering work. No fluff."
                ),
            },
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": question},
                    {
                        "type": "image_url",
                        "image_url": {"url": _data_url(image_bytes, mime)},
                    },
                ],
            },
        ]
        try:
            async with httpx.AsyncClient(timeout=90.0) as client:
                for model in _vision_models():
                    for attempt in range(3):
                        resp = await client.post(
                            "https://api.groq.com/openai/v1/chat/completions",
                            headers={
                                "Authorization": f"Bearer {key}",
                                "Content-Type": "application/json",
                            },
                            json={
                                "model": model,
                                "messages": messages,
                                "max_tokens": 1024,
                                "temperature": 0.3,
                            },
                        )
                        if resp.status_code == 200:
                            text = resp.json()["choices"][0]["message"]["content"]
                            text = _strip_thinking(text)
                            return {
                                "analysis": text,
                                "provider": "groq",
                                "model": model,
                                "error": None,
                            }
                        last_err = f"{model} HTTP {resp.status_code}: {resp.text[:220]}"
                        print(f"[Vision] {last_err}")
                        # text-only models reject image payloads
                        if resp.status_code == 400 and "must be a string" in resp.text:
                            break
                        if resp.status_code in (404,):
                            break
                        if resp.status_code in (429, 503):
                            await asyncio.sleep(1.5 * (attempt + 1))
                            continue
                        break
        except Exception as exc:
            last_err = str(exc)
            print(f"[Vision] Groq failed: {exc}")

    # One more pass after cooldown if rate-limited
    if key and last_err and "429" in str(last_err):
        await asyncio.sleep(3.0)
        try:
            async with httpx.AsyncClient(timeout=90.0) as client:
                for model in _vision_models():
                    resp = await client.post(
                        "https://api.groq.com/openai/v1/chat/completions",
                        headers={
                            "Authorization": f"Bearer {key}",
                            "Content-Type": "application/json",
                        },
                        json={
                            "model": model,
                            "messages": messages,
                            "max_tokens": 512,
                            "temperature": 0.3,
                        },
                    )
                    if resp.status_code == 200:
                        text = _strip_thinking(resp.json()["choices"][0]["message"]["content"])
                        return {
                            "analysis": text,
                            "provider": "groq",
                            "model": model,
                            "error": None,
                        }
                    last_err = f"{model} HTTP {resp.status_code}: {resp.text[:220]}"
                    if resp.status_code == 429:
                        await asyncio.sleep(2.0)
                        continue
                    break
        except Exception as exc:
            last_err = str(exc)

    # Honest fallback — do not pretend vision worked
    try:
        text = await llm.chat_completion(
            f"Camera frame was captured ({len(image_bytes)} bytes) but multimodal vision failed "
            f"({last_err or 'no vision model on this Groq key'}). "
            f"User asked: {question}\n"
            "Reply in 2 short sentences: say vision is unavailable on this key right now, "
            "and that the capture itself succeeded.",
            system="You are JARVIS. Be direct.",
        )
        return {
            "analysis": text,
            "provider": "text_fallback",
            "model": None,
            "error": last_err or "vision_model_unavailable",
        }
    except Exception:
        if demo_mode():
            return {
                "analysis": "Demo mode: image captured. Connect a Groq vision-capable model to analyze.",
                "provider": "demo",
                "model": None,
                "error": None,
            }
        return {
            "analysis": "",
            "provider": None,
            "model": None,
            "error": last_err or "vision_unavailable",
        }
