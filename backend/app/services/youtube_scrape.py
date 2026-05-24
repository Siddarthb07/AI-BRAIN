import json
import re
from typing import Dict, Iterable, List

import requests


def _extract_yt_initial_data(html: str) -> Dict:
    marker = "ytInitialData"
    idx = html.find(marker)
    if idx == -1:
        return {}
    start = html.find("{", idx)
    if start == -1:
        return {}
    depth = 0
    in_string = False
    escape = False
    for i in range(start, len(html)):
        ch = html[i]
        if in_string:
            if escape:
                escape = False
            elif ch == "\\":
                escape = True
            elif ch == '"':
                in_string = False
            continue
        if ch == '"':
            in_string = True
            continue
        if ch == "{":
            depth += 1
        elif ch == "}":
            depth -= 1
            if depth == 0:
                blob = html[start : i + 1]
                try:
                    return json.loads(blob)
                except json.JSONDecodeError:
                    return {}
    return {}


def _walk_for_video_renderers(node: object) -> Iterable[Dict]:
    if isinstance(node, dict):
        if "videoRenderer" in node and isinstance(node["videoRenderer"], dict):
            yield node["videoRenderer"]
        for value in node.values():
            yield from _walk_for_video_renderers(value)
    elif isinstance(node, list):
        for item in node:
            yield from _walk_for_video_renderers(item)


def _video_title(renderer: Dict) -> str:
    title = renderer.get("title", {})
    if isinstance(title, dict):
        runs = title.get("runs")
        if isinstance(runs, list) and runs:
            return runs[0].get("text", "")
        return title.get("simpleText", "")
    return ""


def search_youtube(query: str, limit: int = 5) -> List[Dict[str, str]]:
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

    data = _extract_yt_initial_data(html)
    results: List[Dict[str, str]] = []
    seen = set()
    for renderer in _walk_for_video_renderers(data):
        video_id = renderer.get("videoId")
        title = _video_title(renderer)
        if not video_id or not title:
            continue
        if video_id in seen:
            continue
        seen.add(video_id)
        results.append(
            {
                "title": title,
                "url": f"https://www.youtube.com/watch?v={video_id}",
            }
        )
        if len(results) >= limit:
            break

    if results:
        return results

    ids = re.findall(r"watch\\?v=([a-zA-Z0-9_-]{11})", html)
    for vid in ids:
        if vid in seen:
            continue
        seen.add(vid)
        results.append(
            {
                "title": f"{query} tutorial",
                "url": f"https://www.youtube.com/watch?v={vid}",
            }
        )
        if len(results) >= limit:
            break
    return results


def search_youtube_with_fallback(query: str, limit: int = 5) -> List[Dict[str, str]]:
    results = search_youtube(query, limit=limit)
    if results:
        return results
    return [
        {
            "title": f"Search YouTube for {query}",
            "url": f"https://www.youtube.com/results?search_query={query.replace(' ', '+')}",
        }
    ]
