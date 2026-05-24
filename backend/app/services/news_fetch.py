from typing import Dict, List

import requests


def search_hn(query: str, limit: int = 3) -> List[Dict[str, str]]:
    query = query.strip()
    if not query:
        return []
    url = "https://hn.algolia.com/api/v1/search"
    params = {"query": query, "tags": "story", "hitsPerPage": limit}
    try:
        resp = requests.get(url, params=params, timeout=15)
        resp.raise_for_status()
        data = resp.json()
        links: List[Dict[str, str]] = []
        for hit in data.get("hits", []):
            link = hit.get("url") or f"https://news.ycombinator.com/item?id={hit.get('objectID')}"
            title = hit.get("title") or "Hacker News"
            if link:
                links.append({"title": title, "url": link})
        return links[:limit]
    except Exception:
        return []


def search_hn_news(query: str, limit: int = 3) -> List[Dict[str, str]]:
    return search_hn(query, limit=limit)
