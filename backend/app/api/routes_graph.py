from typing import Dict, List
from uuid import uuid4

from fastapi import APIRouter

from app.services.config import get_settings
from app.services.storage import get_user_context, list_insights
from app.services.news_fetch import search_hn_news
from app.services.youtube_scrape import search_youtube_with_fallback

router = APIRouter(tags=["graph"])


def _fallback_nodes(active_project: str) -> List[Dict]:
    base_nodes = [
        "LexProbe",
        "GeoQuant",
        "Health AI",
        "JARVIS",
        "CortexOS",
        "AtlasSynth",
        "NeuroFlow",
        "QuantaPulse",
        "FastAPI",
        "Docker",
        "RAG",
        "ML Models",
        "Whisper",
        "Qdrant",
    ]
    if active_project and active_project not in base_nodes:
        base_nodes.insert(0, active_project)
    nodes = []
    for name in base_nodes:
        nodes.append(
            {
                "id": name.lower().replace(" ", "-"),
                "name": name,
                "kind": "fallback",
                "tech": ["python", "rag", "api"] if name == "JARVIS" else ["ai"],
                "active": name == active_project or (not active_project and name == "JARVIS"),
            }
        )
    return nodes


def _derive_topics(metadata: Dict) -> List[str]:
    topics = metadata.get("topics") or []
    tech = metadata.get("tech_stack") or metadata.get("languages") or []
    keywords = metadata.get("keywords") or []
    pool = []
    for item in topics + tech + keywords:
        if isinstance(item, str) and item.strip():
            pool.append(item.strip())
    # Deduplicate
    seen = []
    for item in pool:
        if item.lower() not in [s.lower() for s in seen]:
            seen.append(item)
    # Ensure at least a few topics
    if not seen:
        seen = ["AI systems", "RAG", "FastAPI", "Docker", "LLMs", "Vector DB"]
    return seen[:10]


def _fetch_user_repos(username: str) -> List[Dict]:
    import requests

    settings = get_settings()
    headers = {"Accept": "application/vnd.github+json"}
    if settings.github_token:
        headers["Authorization"] = f"Bearer {settings.github_token}"

    repos: List[Dict] = []
    page = 1
    while page <= 4:
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
    context = get_user_context()
    active_project = context.get("active_project", "")
    insights = list_insights(limit=80)

    nodes: List[Dict] = []
    topic_nodes: List[Dict] = []
    for item in insights:
        if item.get("source") not in {"github_repo", "github_trending"}:
            continue
        title = item.get("title", "")
        metadata = item.get("metadata", {})
        tech = metadata.get("tech_stack") or metadata.get("languages") or metadata.get("topics") or []
        repo_node_id = f"repo-{uuid4()}"
        nodes.append(
            {
                "id": repo_node_id,
                "name": title,
                "kind": item.get("source", "repo"),
                "tech": tech,
                "active": title == active_project,
                "videos": [],
            }
        )
        topics = _derive_topics(metadata)[:10]
        for topic in topics[:8]:
            videos = search_youtube_with_fallback(f"{topic} latest tutorial", limit=5)
            news = search_hn_news(topic, limit=3)
            topic_nodes.append(
                {
                    "id": f"topic-{uuid4()}",
                    "name": topic,
                    "kind": "topic",
                    "tech": [topic],
                    "active": False,
                    "videos": videos,
                    "news": news,
                    "parent": repo_node_id,
                }
            )
        if len(nodes) >= 10:
            break

    if not nodes:
        settings = get_settings()
        repos = _fetch_user_repos(settings.graph_github_user)
        for repo in repos[:20]:
            name = repo.get("full_name") or repo.get("name") or "repo"
            topics = repo.get("topics") or []
            languages = [repo.get("language")] if repo.get("language") else []
            meta = {"topics": topics, "languages": languages, "keywords": [name]}
            repo_node_id = f"repo-{uuid4()}"
            nodes.append(
                {
                    "id": repo_node_id,
                    "name": name,
                    "kind": "github_repo",
                    "tech": topics or languages,
                    "active": name == active_project,
                    "videos": [],
                }
            )
            for topic in _derive_topics(meta)[:8]:
                videos = search_youtube_with_fallback(f"{topic} latest tutorial", limit=5)
                news = search_hn_news(topic, limit=3)
                topic_nodes.append(
                    {
                        "id": f"topic-{uuid4()}",
                        "name": topic,
                        "kind": "topic",
                        "tech": [topic],
                        "active": False,
                        "videos": videos,
                        "news": news,
                        "parent": repo_node_id,
                    }
                )

    if not nodes:
        nodes = _fallback_nodes(active_project)
        # add fallback topic nodes for first 4
        for repo in nodes[:4]:
            for topic in ["RAG", "FastAPI", "Docker", "LLM Ops", "Vector DB", "Agents"]:
                videos = search_youtube_with_fallback(f"{topic} latest", limit=5)
                news = search_hn_news(topic, limit=3)
                topic_nodes.append(
                    {
                        "id": f"topic-{uuid4()}",
                        "name": topic,
                        "kind": "topic",
                        "tech": [topic],
                        "active": False,
                        "videos": videos,
                        "news": news,
                        "parent": repo["id"],
                    }
                )

    if active_project:
        anchor_id = "active-project"
        nodes.insert(
            0,
            {
                "id": anchor_id,
                "name": active_project,
                "kind": "project",
                "tech": context.get("daily_goals", []),
                "active": True,
            },
        )
    else:
        anchor_id = nodes[0]["id"]

    edges = []
    for node in nodes[1:]:
        edges.append({"source": anchor_id, "target": node["id"]})
    for topic in topic_nodes:
        edges.append({"source": topic.get("parent"), "target": topic["id"]})

    return {"nodes": nodes + topic_nodes, "edges": edges}
