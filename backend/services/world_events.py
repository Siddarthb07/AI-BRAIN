"""World-event markers for the holographic map. Not a live intel feed."""

from __future__ import annotations

import re
from typing import Any

import httpx

from services import store, web_search

HOTSPOTS: list[dict[str, Any]] = [
    {"id": "ua", "title": "Ukraine war", "lat": 48.4, "lon": 31.2, "kind": "war", "region": "ukraine"},
    {"id": "gaza", "title": "Gaza / Israel", "lat": 31.5, "lon": 34.45, "kind": "war", "region": "gaza"},
    {"id": "sd", "title": "Sudan civil war", "lat": 15.5, "lon": 32.5, "kind": "war", "region": "sudan"},
    {"id": "mm", "title": "Myanmar conflict", "lat": 21.9, "lon": 96.1, "kind": "war", "region": "myanmar"},
    {"id": "ye", "title": "Yemen", "lat": 15.55, "lon": 48.5, "kind": "war", "region": "yemen"},
    {"id": "sy", "title": "Syria", "lat": 35.0, "lon": 38.0, "kind": "war", "region": "syria"},
    {"id": "sahel", "title": "Sahel insurgency", "lat": 16.0, "lon": 0.0, "kind": "war", "region": "sahel"},
    {"id": "ht", "title": "Haiti crisis", "lat": 18.97, "lon": -72.28, "kind": "crisis", "region": "haiti"},
    {"id": "tw", "title": "Taiwan strait", "lat": 23.7, "lon": 121.0, "kind": "tension", "region": "taiwan"},
    {"id": "kr", "title": "Korean peninsula", "lat": 38.3, "lon": 127.2, "kind": "tension", "region": "korea"},
    {"id": "in", "title": "India — regional watch", "lat": 22.0, "lon": 79.0, "kind": "watch", "region": "india"},
]

REGIONS: dict[str, dict[str, float | str]] = {
    "world": {"lat": 20.0, "lon": 20.0, "distance": 14, "label": "WORLD"},
    "india": {"lat": 22.0, "lon": 79.0, "distance": 6.2, "label": "INDIA"},
    "ukraine": {"lat": 48.4, "lon": 31.2, "distance": 5.8, "label": "UKRAINE"},
    "gaza": {"lat": 31.5, "lon": 34.45, "distance": 5.2, "label": "LEVANT"},
    "sudan": {"lat": 15.5, "lon": 32.5, "distance": 6.0, "label": "SUDAN"},
    "taiwan": {"lat": 23.7, "lon": 121.0, "distance": 5.8, "label": "TAIWAN"},
    "usa": {"lat": 39.0, "lon": -98.0, "distance": 7.5, "label": "USA"},
    "europe": {"lat": 50.0, "lon": 10.0, "distance": 7.2, "label": "EUROPE"},
    "china": {"lat": 35.0, "lon": 105.0, "distance": 7.0, "label": "CHINA"},
}


def resolve_region(name: str) -> dict[str, Any] | None:
    key = (name or "").strip().lower().replace(" map", "").replace("the ", "")
    aliases = {"indian": "india", "bharat": "india", "us": "usa", "america": "usa", "uk": "europe"}
    key = aliases.get(key, key)
    return REGIONS.get(key)


async def world_feed() -> dict[str, Any]:
    news = []
    try:
        hits = await web_search.search_web("major world news wars conflicts today", max_results=6)
        for h in hits:
            news.append(
                {
                    "title": h.get("title") or "",
                    "url": h.get("url") or "",
                    "snippet": h.get("snippet") or h.get("content") or "",
                    "provider": h.get("provider"),
                }
            )
    except Exception:
        news = []
    hn = []
    for s in (store.get_hn_stories() or [])[:8]:
        hn.append({"title": s.get("title"), "url": s.get("url"), "id": s.get("id")})
    return {"hotspots": HOTSPOTS, "news": news, "hn": hn}


async def _gdelt(query: str, limit: int = 8) -> list[dict[str, Any]]:
    try:
        async with httpx.AsyncClient(timeout=12.0) as client:
            resp = await client.get(
                "https://api.gdeltproject.org/api/v2/doc/doc",
                params={
                    "query": f"{query} sourcelang:english",
                    "mode": "ArtList",
                    "maxrecords": str(limit),
                    "format": "json",
                    "sort": "datedesc",
                },
            )
            if resp.status_code != 200:
                return []
            data = resp.json() or {}
            out = []
            for art in data.get("articles") or []:
                out.append(
                    {
                        "title": art.get("title") or "",
                        "url": art.get("url") or "",
                        "snippet": f"{art.get('domain') or ''} · {art.get('seendate') or ''}".strip(" ·"),
                        "provider": "gdelt",
                    }
                )
            return out[:limit]
    except Exception:
        return []


async def hotspot_brief(title: str, region: str = "") -> dict[str, Any]:
    """Live headlines for a map pin — GDELT first, then web search."""
    q = " ".join(p for p in [title, region, "latest news"] if p).strip()
    gdelt_q = re.sub(r"[^a-zA-Z0-9 ]+", " ", title or region or "world news").strip()
    hits: list[dict[str, Any]] = []
    seen: set[str] = set()

    def add(items: list[dict[str, Any]]) -> None:
        for h in items:
            url = (h.get("url") or h.get("title") or "").strip()
            if not url or url in seen:
                continue
            seen.add(url)
            hits.append(h)

    add(await _gdelt(gdelt_q or "world news", 8))
    try:
        add(await web_search.search_web(q, max_results=8))
    except Exception:
        pass
    return {
        "title": title,
        "region": region,
        "hits": hits[:10],
        "count": len(hits[:10]),
        "source": "gdelt+web" if hits else "empty",
    }
