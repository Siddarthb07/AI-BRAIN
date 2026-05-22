import os
import httpx
from typing import List, Dict, Optional

GITHUB_TOKEN = os.getenv("GITHUB_TOKEN", "")

FALLBACK_REPOS = [
    {"name": "lexprobe", "description": "Indian legal AI with RAG and citation verification", "language": "Python", "topics": ["ai", "legal", "rag", "fastapi"], "stars": 12, "updated": "2025-01-01", "url": "https://github.com/example/lexprobe"},
    {"name": "health-ai", "description": "Clinical risk calculator with validated algorithms", "language": "Python", "topics": ["health", "machine-learning", "flask", "clinical"], "stars": 8, "updated": "2025-01-01", "url": "https://github.com/example/health-ai"},
    {"name": "geoquant", "description": "Geopolitical risk quantification trading platform", "language": "Python", "topics": ["finance", "ml", "fastapi", "trading"], "stars": 5, "updated": "2025-01-01", "url": "https://github.com/example/geoquant"},
    {"name": "drone-sim", "description": "Vortex ring dynamics simulation for drone propellers", "language": "Python", "topics": ["simulation", "aerospace", "physics", "numpy"], "stars": 3, "updated": "2025-01-01", "url": "https://github.com/example/drone-sim"},
    {"name": "athera", "description": "Workflow automation platform with AI agents", "language": "TypeScript", "topics": ["automation", "ai", "nextjs", "n8n"], "stars": 7, "updated": "2025-01-01", "url": "https://github.com/example/athera"},
]

def _headers():
    h = {"Accept": "application/vnd.github.v3+json", "User-Agent": "JARVIS-Brain/1.0"}
    if GITHUB_TOKEN:
        h["Authorization"] = f"token {GITHUB_TOKEN}"
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
                        })
                page += 1
            return repos if repos else FALLBACK_REPOS
    except Exception as e:
        print(f"[GitHub] fetch_user_repos failed: {e}")
    return FALLBACK_REPOS

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
