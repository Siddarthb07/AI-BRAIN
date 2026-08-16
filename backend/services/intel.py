"""Intel layer — library scan, key armory (names only), provider-tagged search."""

from __future__ import annotations

import os
import re
import time
from typing import Any

import httpx

from services import event_bus, github, store, web_search
from services.manifests import merge_inventory

_BAD_QUAL = re.compile(r"\b(org|user|is|repo|filename|path|extension):[^\s]+", re.I)
_GH_CACHE: dict[str, tuple[float, dict[str, Any]]] = {}
_GH_LAST_AT = 0.0
_GH_MIN_INTERVAL = 2.0
_GH_CACHE_TTL = 60.0


def github_headers() -> dict[str, str]:
    h = {"Accept": "application/vnd.github.v3+json", "User-Agent": "JARVIS-Brain/1.0"}
    token = (os.getenv("GITHUB_TOKEN") or "").strip()
    if token:
        h["Authorization"] = f"Bearer {token}"
    return h


def key_armory() -> list[dict[str, Any]]:
    """Configured vs missing — never include values."""
    specs = [
        ("GROQ", "GROQ_API_KEY"),
        ("GITHUB", "GITHUB_TOKEN"),
        ("BRAVE", "BRAVE_API_KEY"),
        ("TAVILY", "TAVILY_API_KEY"),
        ("EXA", "EXA_API_KEY"),
        ("VAULT", "VAULT_PATH"),
        ("MASTER", "JARVIS_MASTER_KEY"),
        ("API", "JARVIS_API_TOKEN"),
    ]
    out = []
    for label, env_name in specs:
        raw = (os.getenv(env_name) or "").strip()
        out.append({"id": label.lower(), "label": label, "env": env_name, "armed": bool(raw)})
    return out


def boot_recap() -> dict[str, Any]:
    keys = key_armory()
    repos = store.get_repos()
    return {
        "armed": sum(1 for k in keys if k["armed"]),
        "keys_total": len(keys),
        "repos": len(repos),
        "keys": keys,
        "line": (
            f"{sum(1 for k in keys if k['armed'])} keys armed · "
            f"{len(repos)} repos · last scan ready"
        ),
    }


def _repo_libs(repo: dict) -> dict[str, str]:
    deps = repo.get("key_deps") or {}
    if isinstance(deps, dict) and deps:
        return {str(k).lower(): str(v) for k, v in deps.items()}
    libs: dict[str, str] = {}
    for name in repo.get("key_imports") or []:
        libs[str(name).lower()] = "*"
    return libs


def library_index() -> list[dict[str, Any]]:
    rows = []
    for repo in store.get_repos():
        name = repo.get("name") or ""
        libs = _repo_libs(repo)
        rows.append(
            {
                "name": name,
                "language": repo.get("language"),
                "description": repo.get("description") or "",
                "topics": repo.get("topics") or [],
                "deps": libs,
                "required_env": repo.get("required_env") or [],
                "entry_points": repo.get("entry_points") or [],
                "patterns": repo.get("patterns") or [],
            }
        )
    return rows


def which_repos_use(query: str) -> dict[str, Any]:
    q = (query or "").strip().lower()
    if not q:
        return {"query": "", "hits": []}
    hits = []
    for row in library_index():
        deps = {str(k).lower(): v for k, v in (row.get("deps") or {}).items()}
        blob = " ".join(
            [
                str(row.get("name") or ""),
                str(row.get("description") or ""),
                str(row.get("language") or ""),
                " ".join(row.get("topics") or []),
                " ".join(str(p) for p in (row.get("patterns") or [])),
                " ".join(deps.keys()),
            ]
        ).lower()
        kind = None
        if q in deps or any(q in k for k in deps):
            kind = "DECLARED"
        elif any(q in str(p).lower() for p in (row.get("patterns") or [])):
            kind = "IMPORT"
        elif q in blob:
            kind = "META"
        if kind:
            hits.append(
                {
                    "repo": row["name"],
                    "kind": kind,
                    "version": deps.get(q) or deps.get(next((k for k in deps if q in k), ""), ""),
                    "language": row.get("language"),
                }
            )
    return {"query": query, "hits": hits, "count": len(hits)}


async def github_code_search(query: str, username: str = "") -> dict[str, Any]:
    cleaned = _BAD_QUAL.sub("", query or "").strip()
    if not cleaned:
        return {"hits": [], "error": "empty query", "status": 0}
    key = cleaned.lower()
    now = time.time()
    cached = _GH_CACHE.get(key)
    if cached and now - cached[0] < _GH_CACHE_TTL:
        return cached[1]
    global _GH_LAST_AT
    if now - _GH_LAST_AT < _GH_MIN_INTERVAL:
        if cached:
            return cached[1]
        return {"hits": [], "error": "THROTTLED", "status": 429}
    _GH_LAST_AT = now
    user = (username or os.getenv("GITHUB_USERNAME") or "").strip()
    q = f"{cleaned} in:file"
    if user:
        q = f"{cleaned} user:{user}"
    try:
        async with httpx.AsyncClient(timeout=12.0) as client:
            resp = await client.get(
                "https://api.github.com/search/code",
                headers=github_headers(),
                params={"q": q, "per_page": 8},
            )
            if resp.status_code != 200:
                out = {
                    "hits": [],
                    "error": f"HTTP {resp.status_code}",
                    "status": resp.status_code,
                }
                _GH_CACHE[key] = (now, out)
                return out
            items = resp.json().get("items") or []
            hits = [
                {
                    "repo": (it.get("repository") or {}).get("name"),
                    "path": it.get("path"),
                    "kind": "FILE",
                    "html_url": it.get("html_url"),
                    "url": it.get("html_url"),
                }
                for it in items
                if (it.get("repository") or {}).get("name")
            ]
            out = {"hits": hits, "error": None, "status": 200}
            _GH_CACHE[key] = (now, out)
            return out
    except Exception as exc:
        print(f"[intel] code search failed: {type(exc).__name__}")
        return {"hits": [], "error": "NETWORK", "status": 0}


async def scan_library(query: str) -> dict[str, Any]:
    local = which_repos_use(query)
    remote = await github_code_search(query)
    hits = list(local.get("hits") or [])
    hits.extend(remote.get("hits") or [])
    await event_bus.publish("intel.scan", {"query": query, "count": len(hits)})
    return {
        "query": query,
        "hits": hits,
        "count": len(hits),
        "github_error": remote.get("error"),
        "github_status": remote.get("status"),
    }


async def summarize_web_hit(title: str, snippet: str, url: str) -> dict[str, Any]:
    from services import llm

    prompt = (
        f"Summarize this web result in 4-6 short lines for an operator HUD.\n"
        f"Title: {title or '(none)'}\nURL: {url or ''}\nSnippet: {(snippet or '')[:800]}"
    )
    try:
        text = await llm.chat_completion(
            prompt,
            system="You are JARVIS. Be concrete. No fluff. No markdown headings.",
            max_tokens=280,
            temperature=0.2,
        )
        return {"summary": (text or "").strip(), "url": url, "title": title}
    except Exception as exc:
        return {"summary": "", "error": type(exc).__name__, "url": url, "title": title}


async def radar_search(query: str) -> dict[str, Any]:
    hits = await web_search.search_web(query, max_results=8)
    await event_bus.publish("intel.radar", {"query": query, "n": len(hits)})
    return {"query": query, "hits": hits}


def xray(repo_name: str) -> dict[str, Any]:
    target = (repo_name or "").lower()
    for repo in store.get_repos():
        if str(repo.get("name") or "").lower() == target:
            return {
                "name": repo.get("name"),
                "language": repo.get("language"),
                "languages": repo.get("languages") or {},
                "deps": _repo_libs(repo),
                "required_env": repo.get("required_env") or [],
                "entry_points": repo.get("entry_points") or [],
                "patterns": repo.get("patterns") or [],
                "file_count": repo.get("file_count") or 0,
                "description": repo.get("description"),
            }
    return {"name": repo_name, "deps": {}, "required_env": []}


def venn(left: str, right: str) -> dict[str, Any]:
    a = xray(left)
    b = xray(right)
    sa, sb = set((a.get("deps") or {})), set((b.get("deps") or {}))
    return {
        "left": left,
        "right": right,
        "shared": sorted(sa & sb),
        "only_left": sorted(sa - sb)[:24],
        "only_right": sorted(sb - sa)[:24],
    }


def apply_inventory_to_repo(owner: str, repo: str, chunks: list[dict]) -> dict[str, Any]:
    inv = merge_inventory(chunks)
    data = {"name": repo, "owner": owner, **inv}
    existing = next((r for r in store.get_repos() if str(r.get("name")) == repo), None)
    if existing:
        store.add_repo({**existing, **inv})
    return inv
