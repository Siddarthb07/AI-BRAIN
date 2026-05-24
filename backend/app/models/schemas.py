from datetime import datetime
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field


class ContextIn(BaseModel):
    daily_goals: List[str] = Field(default_factory=list)
    active_project: str = ""
    focus_repos: List[str] = Field(default_factory=list)
    focus_topics: List[str] = Field(default_factory=list)


class ContextOut(ContextIn):
    updated_at: datetime


class GitHubIngestIn(BaseModel):
    repo: Optional[str] = None
    user: Optional[str] = None


class IngestResult(BaseModel):
    source: str
    items_indexed: int
    message: str
    meta: Dict[str, Any] = Field(default_factory=dict)


class BriefInsight(BaseModel):
    signal: str
    why_it_matters: str
    action: str
    effort: str
    priority: str


class BriefOut(BaseModel):
    insights: List[BriefInsight]


class InsightOut(BaseModel):
    id: str
    source: str
    title: str
    summary: str
    url: Optional[str] = None
    timestamp: str


class ChatIn(BaseModel):
    message: str
    include_context: bool = True
    session_id: Optional[str] = None


class ChatAction(BaseModel):
    id: str
    type: str
    label: str
    params: Dict[str, Any] = Field(default_factory=dict)
    requires_confirm: bool = True


class ChatCitation(BaseModel):
    id: int
    path: str
    snippet: str = ""
    score: Optional[float] = None


class ChatSource(BaseModel):
    id: str
    title: str
    source: str
    score: float


class ChatOut(BaseModel):
    reply: str
    session_id: Optional[str] = None
    sources: List[ChatSource] = Field(default_factory=list)
    citations: List[ChatCitation] = Field(default_factory=list)
    actions: List[ChatAction] = Field(default_factory=list)
    context_used: bool = False
    llm_offline: bool = False


class VaultSaveIn(BaseModel):
    content: str
    title: Optional[str] = None
    folder: str = "Chat"


class TTSIn(BaseModel):
    text: str
