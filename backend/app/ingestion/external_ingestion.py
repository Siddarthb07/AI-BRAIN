from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Dict, List
from uuid import uuid4

import requests
from bs4 import BeautifulSoup

from app.services.embeddings import get_embedding_service
from app.services.storage import append_insights
from app.services.vector_store import VectorDocument, get_vector_store


def _iso_from_unix(ts: int | None) -> str:
    if not ts:
        return datetime.now(timezone.utc).isoformat()
    return datetime.fromtimestamp(ts, tz=timezone.utc).isoformat()


def fetch_hackernews(limit: int = 8) -> List[Dict]:
    top = requests.get("https://hacker-news.firebaseio.com/v0/topstories.json", timeout=20).json()
    items: List[Dict] = []
    for story_id in top[: limit * 2]:
        if len(items) >= limit:
            break
        res = requests.get(
            f"https://hacker-news.firebaseio.com/v0/item/{story_id}.json", timeout=20
        )
        if not res.ok:
            continue
        story = res.json() or {}
        title = story.get("title")
        if not title:
            continue
        items.append(
            {
                "id": f"hn-{story_id}",
                "source": "hackernews",
                "title": title,
                "summary": f"Score {story.get('score', 0)} | Comments {story.get('descendants', 0)}",
                "url": story.get("url") or f"https://news.ycombinator.com/item?id={story_id}",
                "timestamp": _iso_from_unix(story.get("time")),
                "text": f"{title}. {story.get('text') or ''}",
                "metadata": {
                    "score": story.get("score", 0),
                    "comments": story.get("descendants", 0),
                    "author": story.get("by", ""),
                },
            }
        )
    return items


def _github_trending_from_html(limit: int = 8) -> List[Dict]:
    resp = requests.get("https://github.com/trending?since=daily", timeout=20)
    resp.raise_for_status()
    soup = BeautifulSoup(resp.text, "html.parser")
    articles = soup.select("article.Box-row")
    items: List[Dict] = []
    now_iso = datetime.now(timezone.utc).isoformat()

    for row in articles:
        if len(items) >= limit:
            break
        h2 = row.select_one("h2 a")
        if not h2:
            continue
        repo_name = " ".join(h2.get_text(" ", strip=True).split())
        repo_name = repo_name.replace(" / ", "/").replace(" ", "")
        desc_el = row.select_one("p")
        desc = desc_el.get_text(" ", strip=True) if desc_el else "Trending GitHub repository."
        repo_url = f"https://github.com/{repo_name}"
        items.append(
            {
                "id": f"ghtrend-{repo_name.lower().replace('/', '-')}",
                "source": "github_trending",
                "title": repo_name,
                "summary": desc,
                "url": repo_url,
                "timestamp": now_iso,
                "text": f"{repo_name}. {desc}",
                "metadata": {"kind": "daily_trending"},
            }
        )
    return items


def _github_trending_from_search(limit: int = 8) -> List[Dict]:
    since = (datetime.now(timezone.utc) - timedelta(days=7)).strftime("%Y-%m-%d")
    url = (
        "https://api.github.com/search/repositories"
        f"?q=created:>{since}&sort=stars&order=desc&per_page={limit}"
    )
    resp = requests.get(url, timeout=20)
    resp.raise_for_status()
    data = resp.json()
    now_iso = datetime.now(timezone.utc).isoformat()
    items: List[Dict] = []
    for repo in data.get("items", []):
        full_name = repo.get("full_name")
        if not full_name:
            continue
        items.append(
            {
                "id": f"ghsearch-{repo.get('id')}",
                "source": "github_trending",
                "title": full_name,
                "summary": repo.get("description") or "Fast-growing GitHub repository this week.",
                "url": repo.get("html_url"),
                "timestamp": now_iso,
                "text": f"{full_name}. {repo.get('description') or ''}",
                "metadata": {
                    "stars": repo.get("stargazers_count", 0),
                    "language": repo.get("language"),
                    "fallback": "search_api",
                },
            }
        )
    return items


def fetch_github_trending(limit: int = 8) -> List[Dict]:
    try:
        items = _github_trending_from_html(limit=limit)
        if items:
            return items
    except Exception:
        pass
    return _github_trending_from_search(limit=limit)


def ingest_external(limit_each: int = 8) -> Dict:
    try:
        hn_items = fetch_hackernews(limit_each)
    except Exception:
        hn_items = []

    try:
        gh_items = fetch_github_trending(limit_each)
    except Exception:
        gh_items = []

    all_items = hn_items + gh_items

    if not all_items:
        now_iso = datetime.now(timezone.utc).isoformat()
        all_items = [
            {
                "id": "fallback-hn-1",
                "source": "hackernews",
                "title": "New AI repo trending",
                "summary": "Mock external signal to keep pipeline active.",
                "url": "https://news.ycombinator.com/",
                "timestamp": now_iso,
                "text": "Fallback Hacker News item for local pipeline validation.",
                "metadata": {"fallback": True},
            },
            {
                "id": "fallback-gh-1",
                "source": "github_trending",
                "title": "fastapi/fastapi",
                "summary": "Mock trending repo for local pipeline validation.",
                "url": "https://github.com/tiangolo/fastapi",
                "timestamp": now_iso,
                "text": "Fallback GitHub trending item for local pipeline validation.",
                "metadata": {"fallback": True},
            },
        ]

    embedder = get_embedding_service()
    vectors = embedder.embed_texts([item["text"] for item in all_items])

    docs: List[VectorDocument] = []
    for item, vec in zip(all_items, vectors):
        docs.append(
            VectorDocument(
                id=str(uuid4()),
                vector=vec,
                payload={
                    "source": item["source"],
                    "title": item["title"],
                    "summary": item["summary"],
                    "text": item["text"],
                    "timestamp": item["timestamp"],
                    "url": item.get("url"),
                    "metadata": item.get("metadata", {}),
                },
            )
        )

    vector_store = get_vector_store()
    vector_store.upsert(docs)
    append_insights(all_items)

    return {
        "source": "external",
        "items_indexed": len(all_items),
        "message": f"Ingested {len(hn_items)} Hacker News + {len(gh_items)} GitHub trending items.",
        "meta": {"hackernews": len(hn_items), "github_trending": len(gh_items)},
    }
