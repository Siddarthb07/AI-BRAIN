import os
import asyncio
import httpx
from typing import List, Dict, Optional

from services.config import demo_mode

FALLBACK_REPOS = [
    {"name": "lexprobe", "description": "Indian legal AI with RAG and citation verification", "language": "Python", "topics": ["ai", "legal", "rag", "fastapi"], "stars": 12, "updated": "2025-01-01", "url": "https://github.com/example/lexprobe"},
    {"name": "health-ai", "description": "Clinical risk calculator with validated algorithms", "language": "Python", "topics": ["health", "machine-learning", "flask", "clinical"], "stars": 8, "updated": "2025-01-01", "url": "https://github.com/example/health-ai"},
    {"name": "geoquant", "description": "Geopolitical risk quantification trading platform", "language": "Python", "topics": ["finance", "ml", "fastapi", "trading"], "stars": 5, "updated": "2025-01-01", "url": "https://github.com/example/geoquant"},
    {"name": "drone-sim", "description": "Vortex ring dynamics simulation for drone propellers", "language": "Python", "topics": ["simulation", "aerospace", "physics", "numpy"], "stars": 3, "updated": "2025-01-01", "url": "https://github.com/example/drone-sim"},
    {"name": "athera", "description": "Workflow automation platform with AI agents", "language": "TypeScript", "topics": ["automation", "ai", "nextjs", "n8n"], "stars": 7, "updated": "2025-01-01", "url": "https://github.com/example/athera"},
]

def _headers():
    h = {"Accept": "application/vnd.github.v3+json", "User-Agent": "JARVIS-Brain/1.0"}
    token = os.getenv("GITHUB_TOKEN", "").strip()
    if token:
        h["Authorization"] = f"token {token}"
    return h

async def fetch_repo(owner: str, repo: str) -> Dict:
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.get(f"https://api.github.com/repos/{owner}/{repo}", headers=_headers())
            if resp.status_code == 200:
                d = resp.json()
                return {
                    "name": d.get("name"),
                    "description": d.get("description") or f"A repository by {owner}",
                    "language": d.get("language") or "Unknown",
                    "topics": d.get("topics", []),
                    "stars": d.get("stargazers_count", 0),
                    "updated": d.get("updated_at", "")[:10],
                    "url": d.get("html_url", ""),
                    "owner": owner,
                    "has_pages": bool(d.get("has_pages")),
                    "homepage": d.get("homepage") or "",
                }
    except Exception as e:
        print(f"[GitHub] fetch_repo failed: {e}")
    return None

async def fetch_user_repos(username: str) -> List[Dict]:
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            repos = []
            page = 1
            while len(repos) < 50:
                resp = await client.get(
                    f"https://api.github.com/users/{username}/repos",
                    headers=_headers(),
                    params={"per_page": 30, "page": page, "sort": "updated", "type": "owner"}
                )
                if resp.status_code != 200:
                    print(f"[GitHub] fetch_user_repos HTTP {resp.status_code}: {resp.text[:200]}")
                    if page == 1 and resp.status_code in {401, 403, 502, 503}:
                        raise RuntimeError(f"GitHub repos HTTP {resp.status_code}")
                    break
                data = resp.json()
                if not data:
                    break
                for d in data:
                    if not d.get("fork"):
                        repos.append({
                            "name": d.get("name"),
                            "description": d.get("description") or f"Repository by {username}",
                            "language": d.get("language") or "Unknown",
                            "topics": d.get("topics", []),
                            "stars": d.get("stargazers_count", 0),
                            "updated": d.get("updated_at", "")[:10],
                            "url": d.get("html_url", ""),
                            "owner": username,
                            "has_pages": bool(d.get("has_pages")),
                            "homepage": d.get("homepage") or "",
                            "archived": bool(d.get("archived")),
                        })
                page += 1
            return repos if repos else (FALLBACK_REPOS if demo_mode() else [])
    except Exception as e:
        print(f"[GitHub] fetch_user_repos failed: {e}")
        if demo_mode():
            return FALLBACK_REPOS
        raise


def _normalize_site_url(url: str) -> str:
    return (url or "").strip().rstrip("/").lower()


async def fetch_repo_pages(owner: str, repo: str) -> Optional[Dict]:
    """Return a confirmed built Pages deployment, or None when Pages is inactive."""
    last_exc: Optional[Exception] = None
    for attempt in range(3):
        try:
            async with httpx.AsyncClient(timeout=20.0, follow_redirects=True) as client:
                resp = await client.get(
                    f"https://api.github.com/repos/{owner}/{repo}/pages",
                    headers=_headers(),
                )
            if resp.status_code == 404:
                return None
            if resp.status_code != 200:
                raise RuntimeError(f"Pages HTTP {resp.status_code}")
            data = resp.json()
            # GitHub keeps has_pages / pages metadata around after disable; only live statuses count.
            if data.get("status") not in {"built", "building", "queued"}:
                return None
            url = (data.get("html_url") or "").rstrip("/") + "/"
            if not url.strip("/"):
                return None
            return {
                "id": f"{owner}/{repo}",
                "owner": owner,
                "repo": repo,
                "url": url,
                "cname": data.get("cname"),
                "status": data.get("status"),
                "build_type": data.get("build_type"),
                "source": data.get("source") or {},
                "https_enforced": bool(data.get("https_enforced")),
                "protection": data.get("protected_domain_state"),
                "discovery": "pages_api",
            }
        except Exception as exc:
            last_exc = exc
            await asyncio.sleep(0.4 * (attempt + 1))
    print(f"[GitHub] pages lookup failed for {owner}/{repo}: {last_exc}")
    raise RuntimeError(f"Pages lookup failed for {owner}/{repo}: {last_exc}")


async def discover_user_pages_sites(username: str) -> List[Dict]:
    """Discover confirmed Pages deployments (no homepage-guess false positives)."""
    last_error: Optional[Exception] = None
    repos: List[Dict] = []
    for attempt in range(3):
        try:
            repos = await fetch_user_repos(username)
            last_error = None
            break
        except Exception as exc:
            last_error = exc
            await asyncio.sleep(0.6 * (attempt + 1))
    if last_error is not None:
        raise RuntimeError(f"GitHub repo list unavailable: {last_error}") from last_error

    # Prefer the GitHub has_pages flag; also check the user/profile site repo names.
    candidates = [
        repo
        for repo in repos
        if repo.get("has_pages")
        or str(repo.get("name") or "").lower() in {f"{username.lower()}.github.io", username.lower()}
    ]
    semaphore = asyncio.Semaphore(2)
    failures = 0

    async def resolve(repo: Dict) -> Optional[Dict]:
        nonlocal failures
        async with semaphore:
            try:
                site = await fetch_repo_pages(username, repo["name"])
            except Exception:
                failures += 1
                return None
        if not site:
            return None
        site.update(
            {
                "name": repo["name"],
                "repo_url": repo.get("url"),
                "description": repo.get("description"),
                "language": repo.get("language"),
            }
        )
        return site

    resolved = [site for site in await asyncio.gather(*(resolve(repo) for repo in candidates)) if site]
    if candidates and not resolved and failures:
        raise RuntimeError(f"GitHub Pages lookups failed for {failures}/{len(candidates)} candidates")
    # One card per live URL — many repos can list the same portfolio homepage.
    unique: dict[str, Dict] = {}
    for site in resolved:
        key = _normalize_site_url(site.get("url") or "")
        if not key:
            continue
        existing = unique.get(key)
        if not existing:
            unique[key] = site
            continue
        # Prefer the repo whose path/cname matches the deployment URL.
        repo_name = str(site.get("repo") or "").lower()
        url = key
        owns = repo_name and (f"/{repo_name}" in url or url.endswith(f"{repo_name}.github.io"))
        existing_owns = str(existing.get("repo") or "").lower() in url
        if owns and not existing_owns:
            unique[key] = site
    return sorted(unique.values(), key=lambda item: str(item.get("repo") or "").lower())

async def fetch_readme(owner: str, repo: str) -> str:
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(
                f"https://api.github.com/repos/{owner}/{repo}/readme",
                headers={**_headers(), "Accept": "application/vnd.github.v3.raw"}
            )
            if resp.status_code == 200:
                return resp.text[:3000]
    except:
        pass
    return f"# {repo}\nA software project. See repository for details."

def build_repo_text(repo: Dict) -> str:
    topics = ", ".join(repo.get("topics", []))
    return (
        f"Repository: {repo['name']}\n"
        f"Description: {repo.get('description', 'No description')}\n"
        f"Language: {repo.get('language', 'Unknown')}\n"
        f"Topics: {topics or 'general'}\n"
        f"Stars: {repo.get('stars', 0)}\n"
        f"Last updated: {repo.get('updated', 'unknown')}\n"
        f"URL: {repo.get('url', '')}"
    )
