"""Research + web search API."""

from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from services import research, web_search
from services.llm import LLMOfflineError

router = APIRouter()


class ResearchBody(BaseModel):
    topic: str = Field(..., min_length=3)
    save: bool = True
    use_compound: bool = True


class SearchBody(BaseModel):
    query: str = Field(..., min_length=2)
    max_results: Optional[int] = 8


@router.post("/report")
async def create_report(body: ResearchBody):
    try:
        return await research.research_topic(
            body.topic,
            save=body.save,
            use_compound=body.use_compound,
        )
    except LLMOfflineError as exc:
        raise HTTPException(503, str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc
    except Exception as exc:
        raise HTTPException(500, f"Research failed: {exc}") from exc


@router.post("/search")
async def search(body: SearchBody):
    hits = await web_search.search_web(body.query, max_results=body.max_results)
    return {"query": body.query, "hits": hits, "formatted": web_search.format_hits_for_context(hits)}


@router.get("/status")
def research_status():
    import os

    return {
        "research_model": os.getenv("GROQ_RESEARCH_MODEL", "groq/compound"),
        "report_model": os.getenv("GROQ_REPORT_MODEL") or os.getenv("GROQ_MODEL", "openai/gpt-oss-120b"),
        "brave_configured": bool(os.getenv("BRAVE_API_KEY")),
        "tavily_configured": bool(os.getenv("TAVILY_API_KEY")),
        "fallback": "duckduckgo",
    }
