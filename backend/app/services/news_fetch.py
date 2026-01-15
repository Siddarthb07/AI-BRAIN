from typing import List

import requests


def search_hn_news(query: str, limit: int = 3) -> List[str]:
    query = query.strip()
    if not query:
        return []
    url = "https://hn.algolia.com/api/v1/search"
    params = {"query": query, "tags": "story", "hitsPerPage": limit}
    try:
        resp = requests.get(url, params=params, timeout=15)
        resp.raise_for_status()
        data = resp.json()
        links = []
        for hit in data.get("hits", []):
            link = hit.get("url") or f"https://news.ycombinator.com/item?id={hit.get('objectID')}"
            if link:
                links.append(link)
        return links[:limit]
    except Exception:
        return []
