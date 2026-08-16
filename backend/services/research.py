"""Research + report generation — web search + Groq synthesis (Compound when available)."""

from __future__ import annotations

import os
import re
from datetime import datetime, timezone
from typing import Any

from services import llm, vault, web_search
from services.time_utils import format_ist_brief_label

RESEARCH_INTENT = re.compile(
    r"\b("
    r"research|investigate|look\s+up|search\s+(the\s+)?(web|internet|online)|"
    r"generate\s+(a\s+)?report|write\s+(a\s+)?report|deep\s*dive|"
    r"what'?s\s+the\s+latest|latest\s+on|news\s+about"
    r")\b",
    re.I,
)

TOPIC_STRIP = re.compile(
    r"^(please\s+)?(can\s+you\s+)?"
    r"(research|investigate|look\s+up|search\s+(the\s+)?(web|internet|online)\s+(for\s+)?|"
    r"generate\s+(a\s+)?report\s+(on|about)\s+|write\s+(a\s+)?report\s+(on|about)\s+|"
    r"deep\s*dive\s+(into|on)\s+|what'?s\s+the\s+latest\s+(on|about)\s+|latest\s+on\s+|news\s+about\s+)"
    r",?\s*",
    re.I,
)


def is_research_intent(message: str) -> bool:
    return bool(RESEARCH_INTENT.search(message or ""))


def extract_topic(message: str) -> str:
    text = (message or "").strip()
    cleaned = TOPIC_STRIP.sub("", text).strip(" .?!")
    return cleaned or text


async def research_topic(
    topic: str,
    *,
    save: bool = True,
    use_compound: bool = True,
) -> dict[str, Any]:
    """Search the web and produce a structured markdown report via Groq."""
    topic = (topic or "").strip()
    if not topic:
        raise ValueError("research topic required")

    compound_model = (os.getenv("GROQ_RESEARCH_MODEL") or "groq/compound").strip()
    synthesis_model = (
        os.getenv("GROQ_REPORT_MODEL")
        or os.getenv("GROQ_MODEL")
        or "openai/gpt-oss-120b"
    ).strip()

    hits: list[dict[str, Any]] = []
    report = ""
    provider = None
    tools_used: list[Any] = []

    # Path A: Groq Compound (built-in web search + code tools)
    if use_compound and llm.GROQ_API_KEY:
        compound_prompt = (
            f"Research topic: {topic}\n\n"
            "Use web search. Produce a structured markdown report with:\n"
            "1. Executive summary (5–8 lines)\n"
            "2. Key findings (bullets with facts + dates when known)\n"
            "3. Risks / open questions\n"
            "4. Practical next steps for an engineer/founder\n"
            "5. Sources (title + URL)\n"
            "Be factual. Do not invent URLs. Note uncertainty.\n"
            f"Timestamp context: {format_ist_brief_label()}"
        )
        try:
            result = await llm.chat_completion_detailed(
                compound_prompt,
                system=(
                    "You are JARVIS research. Prefer primary sources. "
                    "Cite URLs you actually retrieved. No fluff. "
                    "Do not include chain-of-thought or <think> tags in the final report."
                ),
                model=compound_model,
                max_tokens=4096,
                temperature=0.35,
            )
            text = (result.get("text") or "").strip()
            # strip accidental thinking wrappers
            import re as _re

            text = _re.sub(r"<think>[\s\S]*?</think>", "", text, flags=_re.I).strip()
            # Prefer Compound only when it actually used tools (or clearly web-cited)
            tools = result.get("executed_tools") or []
            used_compound = (result.get("model") or "").startswith("groq/compound") and (
                bool(tools) or "http" in text.lower()
            )
            if used_compound and text and len(text) > 80:
                report = text
                provider = result.get("provider")
                tools_used = tools
            elif text and len(text) > 80 and (result.get("model") or "").startswith("groq/compound"):
                report = text
                provider = result.get("provider")
                tools_used = tools
        except Exception as exc:
            print(f"[research] compound failed: {exc}")

    try:
        hits = await web_search.search_web(topic, max_results=8)
    except Exception:
        hits = []

    # Path B: local search + strong synthesizer
    if not report:
        ctx = web_search.format_hits_for_context(hits)
        synth_prompt = (
            f"Topic: {topic}\n\nWEB RESULTS:\n{ctx}\n\n"
            "Write a structured markdown research report with:\n"
            "## Executive summary\n## Key findings\n## Risks / open questions\n"
            "## Next steps\n## Sources\n"
            "Only cite URLs from WEB RESULTS. If thin, say what is missing."
        )
        report = await llm.chat_completion(
            synth_prompt,
            system="You are JARVIS research. Direct, sourced, no invented citations.",
            model=synthesis_model,
            max_tokens=4096,
        )
        provider = f"groq:{synthesis_model}+web_search"

    saved = None
    if save and report:
        title = f"Research — {topic[:80]}"
        md = (
            f"# {title}\n\n"
            f"_Generated {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M UTC')} "
            f"· {format_ist_brief_label()}_\n\n"
            f"{report.strip()}\n"
        )
        saved = vault.save_markdown(md, title=title, folder="Reports", source="jarvis-research")

    return {
        "topic": topic,
        "report": report,
        "hits": hits,
        "provider": provider,
        "executed_tools": tools_used,
        "vault_path": (saved or {}).get("relative_path"),
        "saved": bool(saved),
    }
