from datetime import datetime
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field, HttpUrl


class ContextIn(BaseModel):
    daily_goals: List[str] = Field(default_factory=list)
    active_project: str = ""


class ContextOut(ContextIn):
    updated_at: datetime


class GitHubIngestIn(BaseModel):
    repo: str = Field(
        ...,
        description="GitHub repo in owner/repo form or full URL.",
        examples=["owner/repo", "https://github.com/owner/repo"],
    )


class IngestResult(BaseModel):
    source: str
    items_indexed: int
    message: str
    meta: Dict[str, Any] = Field(default_factory=dict)


class ExternalInsight(BaseModel):
    id: str
    source: str
    title: str
    summary: str
    url: Optional[HttpUrl] = None
    timestamp: datetime
    metadata: Dict[str, Any] = Field(default_factory=dict)


class RankedInsight(BaseModel):
    id: str
    source: str
    title: str
    summary: str
    score: float
    project_relevance: float
    goal_alignment: float
    recency: float
    novelty: float
    actionability: float
    url: Optional[str] = None
    metadata: Dict[str, Any] = Field(default_factory=dict)


class BriefInsight(BaseModel):
    signal: str
    why_it_matters: str
    action: str
    effort: str
    priority: str


class BriefOut(BaseModel):
    insights: List[BriefInsight]


class ChatIn(BaseModel):
    message: str


class ChatSource(BaseModel):
    id: str
    title: str
    source: str
    score: float


class ChatOut(BaseModel):
    reply: str
    sources: List[ChatSource] = Field(default_factory=list)


class TTSIn(BaseModel):
    text: str

