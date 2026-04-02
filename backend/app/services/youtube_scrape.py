import re
from typing import List

import requests


def search_youtube(query: str, limit: int = 5) -> List[str]:
    query = query.strip()
    if not query:
        return []
    url = "https://www.youtube.com/results"
    params = {"search_query": query}
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36"
    }
    try:
        resp = requests.get(url, params=params, headers=headers, timeout=20)
        resp.raise_for_status()
        html = resp.text
    except Exception:
        return []

    # Extract watch IDs; YouTube search HTML includes many duplicates.
    ids = re.findall(r"watch\\?v=([a-zA-Z0-9_-]{11})", html)
    seen = []
    for vid in ids:
        if vid not in seen:
            seen.append(vid)
        if len(seen) >= limit:
            break
    return [f"https://www.youtube.com/watch?v={vid}" for vid in seen]


def search_youtube_with_fallback(query: str, limit: int = 5) -> List[str]:
    results = search_youtube(query, limit=limit)
    if results:
        return results
    # Fallback stable links (search result pages).
    return [
        f"https://www.youtube.com/results?search_query={query.replace(' ', '+')}",
    ]
