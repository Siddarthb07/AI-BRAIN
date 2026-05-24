from typing import Dict, List, Optional
from uuid import uuid4

from fastapi import APIRouter

from app.services.config import get_settings
from app.services.news_fetch import search_hn
from app.services.storage import get_context, get_repo_cache, set_repo_cache
from app.services.youtube_scrape import search_youtube_with_fallback
import requests

router = APIRouter(tags=["graph"])


def _derive_topics(repo: Dict) -> List[str]:
    topics = repo.get("topics") or []
    language = repo.get("language")
    pool = topics + ([language] if language else [])
    pool = [p for p in pool if p]
    if not pool:
        pool = ["RAG", "FastAPI", "Docker", "LLM Ops", "Vector DB", "Agents"]
    seen = []
    for item in pool:
        if item.lower() not in [s.lower() for s in seen]:
            seen.append(item)
    return seen[:10]


def _video_query(repo_name: str, topic: str, language: Optional[str], topics: List[str]) -> str:
    parts = [repo_name, topic]
    if language:
        parts.append(language)
    for extra in topics[:2]:
        if extra not in parts:
            parts.append(extra)
    return " ".join([p for p in parts if p]) + " tutorial"


def _fetch_user_repos(username: str) -> List[Dict]:
    settings = get_settings()
    headers = {"Accept": "application/vnd.github+json"}
    if settings.github_token:
        headers["Authorization"] = f"Bearer {settings.github_token}"

    repos: List[Dict] = []
    page = 1
    while page <= 5:
        resp = requests.get(
            f"https://api.github.com/users/{username}/repos",
            headers=headers,
            params={"per_page": 100, "page": page, "sort": "updated"},
            timeout=20,
        )
        if not resp.ok:
            break
        batch = resp.json() or []
        if not batch:
            break
        repos.extend(batch)
        page += 1
    return repos


@router.get("/graph")
def get_graph() -> Dict:
    settings = get_settings()
    context = get_context()
    active_project = context.get("active_project", "")
    focus_repos = context.get("focus_repos", [])
    focus_topics = context.get("focus_topics", [])
    learned_topics = context.get("learned_topics", [])

    repos = get_repo_cache()
    if not repos or len(repos) < 5:
        repos = _fetch_user_repos(settings.github_user)
        if repos:
            set_repo_cache(repos)
    nodes: List[Dict] = []
    edges: List[Dict] = []

    if not repos:
        repos = [
            {"name": "JARVIS", "full_name": "JARVIS", "topics": ["AI", "RAG"], "language": "Python"},
            {"name": "FastAPI", "full_name": "FastAPI", "topics": ["API"], "language": "Python"},
            {"name": "Docker", "full_name": "Docker", "topics": ["Containers"], "language": "Go"},
            {"name": "Vector DB", "full_name": "Vector DB", "topics": ["Qdrant"], "language": "Rust"},
        ]

    repo_nodes = []
    for repo in repos[:40]:
        name = repo.get("full_name") or repo.get("name") or "repo"
        short_name = name.split("/")[-1]
        language = repo.get("language")
        repo_topics = repo.get("topics") or []
        repo_id = f"repo-{uuid4()}"
        repo_nodes.append(
            {
                "id": repo_id,
                "name": name,
                "kind": "github_repo",
                "tech": repo.get("topics") or ([repo.get("language")] if repo.get("language") else []),
                "active": name == active_project or name in focus_repos,
                "videos": [],
            }
        )
        topics = _derive_topics(repo)[:10]
        for topic in topics:
            query = _video_query(short_name, topic, language, repo_topics)
            videos = search_youtube_with_fallback(query, limit=5)
            news = search_hn(topic, limit=3)
            topic_id = f"topic-{uuid4()}"
            nodes.append(
                {
                    "id": topic_id,
                    "name": topic,
                    "kind": "topic",
                    "tech": [topic],
                    "active": False,
                    "videos": videos,
                    "news": news,
                    "parent": repo_id,
                }
            )
            edges.append({"source": repo_id, "target": topic_id})

    nodes = repo_nodes + nodes

    if learned_topics or focus_topics:
        hub_id = "learning-hub"
        nodes.append(
            {
                "id": hub_id,
                "name": "Learning Hub",
                "kind": "topic",
                "tech": ["learning"],
                "active": True,
            }
        )
        for topic in list(dict.fromkeys(focus_topics + learned_topics))[:20]:
            topic_id = f"learn-{uuid4()}"
            nodes.append(
                {
                    "id": topic_id,
                    "name": topic,
                    "kind": "topic",
                    "tech": [topic],
                    "active": True,
                    "videos": search_youtube_with_fallback(
                        _video_query(active_project or "project", topic, None, []), limit=4
                    ),
                    "news": search_hn(topic, limit=2),
                    "parent": hub_id,
                }
            )
            edges.append({"source": hub_id, "target": topic_id})

    if active_project:
        anchor = {
            "id": "project",
            "name": active_project,
            "kind": "project",
            "tech": context.get("daily_goals", []),
            "active": True,
        }
        nodes.insert(0, anchor)
        for repo in repo_nodes:
            edges.append({"source": "project", "target": repo["id"]})
    else:
        for repo in repo_nodes[:10]:
            edges.append({"source": repo_nodes[0]["id"], "target": repo["id"]})

    return {"nodes": nodes, "edges": edges}
