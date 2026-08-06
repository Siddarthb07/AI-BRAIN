"""Web search helpers for JARVIS research (DuckDuckGo + optional API keys)."""

from __future__ import annotations

import os
import re
from typing import Any
from urllib.parse import quote_plus

import httpx

MAX_RESULTS = int(os.getenv("WEB_SEARCH_MAX_RESULTS", "8"))


async def search_web(query: str, *, max_results: int | None = None) -> list[dict[str, Any]]:
    """Return [{title, url, snippet}] — prefers Brave/Tavily if keyed, else DuckDuckGo."""
    q = (query or "").strip()
    if not q:
        return []
    limit = max(1, min(max_results or MAX_RESULTS, 12))

    brave_key = (os.getenv("BRAVE_API_KEY") or "").strip()
    if brave_key:
        hits = await _brave_search(q, brave_key, limit)
        if hits:
            return hits

    tavily_key = (os.getenv("TAVILY_API_KEY") or "").strip()
    if tavily_key:
        hits = await _tavily_search(q, tavily_key, limit)
        if hits:
            return hits

    return await _duckduckgo_search(q, limit)


async def _brave_search(query: str, key: str, limit: int) -> list[dict[str, Any]]:
    try:
        async with httpx.AsyncClient(timeout=20.0) as client:
            resp = await client.get(
                "https://api.search.brave.com/res/v1/web/search",
                params={"q": query, "count": limit},
                headers={"Accept": "application/json", "X-Subscription-Token": key},
            )
            if resp.status_code != 200:
                print(f"[search] Brave HTTP {resp.status_code}")
                return []
            data = resp.json()
            out = []
            for item in (data.get("web") or {}).get("results") or []:
                out.append(
                    {
                        "title": item.get("title") or "",
                        "url": item.get("url") or "",
                        "snippet": item.get("description") or "",
                    }
                )
            return out[:limit]
    except Exception as exc:
        print(f"[search] Brave failed: {exc}")
        return []


async def _tavily_search(query: str, key: str, limit: int) -> list[dict[str, Any]]:
    try:
        async with httpx.AsyncClient(timeout=25.0) as client:
            resp = await client.post(
                "https://api.tavily.com/search",
                json={"api_key": key, "query": query, "max_results": limit, "include_answer": False},
            )
            if resp.status_code != 200:
                print(f"[search] Tavily HTTP {resp.status_code}")
                return []
            data = resp.json()
            out = []
            for item in data.get("results") or []:
                out.append(
                    {
                        "title": item.get("title") or "",
                        "url": item.get("url") or "",
                        "snippet": item.get("content") or "",
                    }
                )
            return out[:limit]
    except Exception as exc:
        print(f"[search] Tavily failed: {exc}")
        return []


async def _duckduckgo_search(query: str, limit: int) -> list[dict[str, Any]]:
    """HTML scrape of DuckDuckGo — no API key required."""
    headers = {
        "User-Agent": "Mozilla/5.0 (compatible; JARVIS-Research/1.0)",
        "Accept": "text/html,application/xhtml+xml",
    }
    try:
        async with httpx.AsyncClient(timeout=20.0, follow_redirects=True, headers=headers) as client:
            resp = await client.post(
                "https://html.duckduckgo.com/html/",
                data={"q": query},
            )
            if resp.status_code != 200:
                print(f"[search] DDG html HTTP {resp.status_code}")
                lite = await client.get(f"https://lite.duckduckgo.com/lite/?q={quote_plus(query)}")
                html = lite.text if lite.status_code == 200 else ""
            else:
                html = resp.text
    except Exception as exc:
        print(f"[search] DDG html failed: {exc}")
        return await _wikipedia_fallback(query, limit)

    results: list[dict[str, Any]] = []
    # html.duckduckgo.com result links
    link_pat = re.compile(
        r'<a[^>]+class="[^"]*result__a[^"]*"[^>]+href="([^"]+)"[^>]*>(.*?)</a>',
        re.I | re.S,
    )
    snip_pat = re.compile(r'class="result__snippet"[^>]*>(.*?)</(?:a|td|div)', re.I | re.S)
    snippets = [re.sub(r"<[^>]+>", " ", m.group(1)) for m in snip_pat.finditer(html)]
    for i, match in enumerate(link_pat.finditer(html)):
        href = match.group(1).strip()
        title = re.sub(r"<[^>]+>", "", match.group(2)).strip()
        # unwrap ddg redirect
        if "uddg=" in href:
            from urllib.parse import parse_qs, urlparse, unquote

            qs = parse_qs(urlparse(href).query)
            href = unquote(qs.get("uddg", [href])[0])
        if not href.startswith("http"):
            continue
        snip = re.sub(r"\s+", " ", (snippets[i] if i < len(snippets) else "")).strip()[:280]
        results.append({"title": title or href, "url": href, "snippet": snip})
        if len(results) >= limit:
            break

    if results:
        return results

    # lite fallback pattern
    link_pat2 = re.compile(
        r'<a[^>]+rel="nofollow"[^>]+href="([^"]+)"[^>]*>(.*?)</a>',
        re.I | re.S,
    )
    for match in link_pat2.finditer(html):
        href = match.group(1).strip()
        title = re.sub(r"<[^>]+>", "", match.group(2)).strip()
        if not href.startswith("http") or "duckduckgo.com" in href:
            continue
        results.append({"title": title or href, "url": href, "snippet": ""})
        if len(results) >= limit:
            break

    if results:
        return results

    instant = await _duckduckgo_instant(query, limit)
    if instant:
        return instant
    return await _wikipedia_fallback(query, limit)


async def _wikipedia_fallback(query: str, limit: int) -> list[dict[str, Any]]:
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.get(
                "https://en.wikipedia.org/w/api.php",
                params={
                    "action": "opensearch",
                    "search": query,
                    "limit": limit,
                    "namespace": 0,
                    "format": "json",
                },
            )
            if resp.status_code != 200:
                return []
            data = resp.json()
            titles = data[1] if len(data) > 1 else []
            descs = data[2] if len(data) > 2 else []
            urls = data[3] if len(data) > 3 else []
            out = []
            for i, title in enumerate(titles):
                out.append(
                    {
                        "title": title,
                        "url": urls[i] if i < len(urls) else "",
                        "snippet": descs[i] if i < len(descs) else "",
                    }
                )
            return out[:limit]
    except Exception as exc:
        print(f"[search] Wikipedia failed: {exc}")
        return []


async def _duckduckgo_instant(query: str, limit: int) -> list[dict[str, Any]]:
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.get(
                "https://api.duckduckgo.com/",
                params={"q": query, "format": "json", "no_html": 1, "skip_disambig": 1},
            )
            if resp.status_code != 200:
                return []
            data = resp.json()
    except Exception as exc:
        print(f"[search] DDG instant failed: {exc}")
        return []

    out: list[dict[str, Any]] = []
    abstract = (data.get("AbstractText") or "").strip()
    abs_url = (data.get("AbstractURL") or "").strip()
    if abstract and abs_url:
        out.append(
            {
                "title": data.get("Heading") or query,
                "url": abs_url,
                "snippet": abstract[:400],
            }
        )
    for topic in data.get("RelatedTopics") or []:
        if not isinstance(topic, dict):
            continue
        if "Topics" in topic:
            for sub in topic.get("Topics") or []:
                if isinstance(sub, dict) and sub.get("FirstURL"):
                    out.append(
                        {
                            "title": (sub.get("Text") or "")[:120],
                            "url": sub.get("FirstURL") or "",
                            "snippet": sub.get("Text") or "",
                        }
                    )
        elif topic.get("FirstURL"):
            out.append(
                {
                    "title": (topic.get("Text") or "")[:120],
                    "url": topic.get("FirstURL") or "",
                    "snippet": topic.get("Text") or "",
                }
            )
        if len(out) >= limit:
            break
    return out[:limit]


def format_hits_for_context(hits: list[dict[str, Any]]) -> str:
    if not hits:
        return "No web results."
    lines = []
    for i, h in enumerate(hits, 1):
        lines.append(f"[{i}] {h.get('title')}\nURL: {h.get('url')}\n{(h.get('snippet') or '')[:320]}")
    return "\n\n".join(lines)
