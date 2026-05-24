from __future__ import annotations

from datetime import datetime, timezone
from typing import Dict, List, Optional
from uuid import uuid4

import requests

from app.services.embeddings import get_embedder
from app.services.storage import append_insights, append_learned_topics
from app.services.text_utils import extract_keywords
from app.services.vector_store import VectorDocument, get_vector_store


def _iso(ts: Optional[int]) -> str:
    if not ts:
        return datetime.now(timezone.utc).isoformat()
    return datetime.fromtimestamp(ts, tz=timezone.utc).isoformat()


def fetch_hn(limit: int = 8) -> List[Dict]:
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
                "timestamp": _iso(story.get("time")),
                "text": f"{title}. {story.get('text') or ''}",
                "metadata": {"score": story.get("score", 0), "comments": story.get("descendants", 0)},
            }
        )
    return items


def ingest_external(limit_each: int = 8) -> Dict:
    try:
        hn_items = fetch_hn(limit_each)
    except Exception:
        hn_items = []

    all_items = hn_items
    if not all_items:
        now_iso = datetime.now(timezone.utc).isoformat()
        all_items = [
            {
                "id": "fallback-hn",
                "source": "hackernews",
                "title": "New AI repo trending",
                "summary": "Fallback signal to keep pipeline active.",
                "url": "https://news.ycombinator.com/",
                "timestamp": now_iso,
                "text": "Fallback external signal for JARVIS pipeline.",
                "metadata": {"fallback": True},
            }
        ]

    embedder = get_embedder()
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

    try:
        get_vector_store().upsert(docs)
    except Exception:
        pass
    append_insights(all_items)

    keywords = extract_keywords(" ".join([item["title"] for item in all_items]), limit=10)
    append_learned_topics(keywords)

    return {
        "source": "external",
        "items_indexed": len(all_items),
        "message": f"Ingested {len(all_items)} external items.",
        "meta": {"hackernews": len(hn_items)},
    }
