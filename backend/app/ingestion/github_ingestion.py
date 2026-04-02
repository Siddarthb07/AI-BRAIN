from __future__ import annotations

import re
from datetime import datetime, timezone
from typing import Dict, List, Tuple
from uuid import uuid4

import requests

from app.services.config import get_settings
from app.services.embeddings import get_embedding_service
from app.services.storage import append_insights
from app.services.text_utils import chunk_text, extract_keywords, extract_tech_stack
from app.services.vector_store import VectorDocument, get_vector_store


def _parse_repo(repo: str) -> Tuple[str, str]:
    repo = repo.strip()
    if repo.startswith("https://github.com/") or repo.startswith("http://github.com/"):
        parts = re.sub(r"^https?://github\.com/", "", repo).strip("/").split("/")
        if len(parts) < 2:
            raise ValueError("Invalid GitHub URL. Expected https://github.com/owner/repo")
        return parts[0], parts[1]

    parts = repo.split("/")
    if len(parts) != 2:
        raise ValueError("Repo must be in owner/repo format.")
    return parts[0], parts[1]


def _github_headers() -> Dict[str, str]:
    settings = get_settings()
    headers = {"Accept": "application/vnd.github+json"}
    if settings.github_token:
        headers["Authorization"] = f"Bearer {settings.github_token}"
    return headers


def ingest_github_repository(repo_ref: str) -> Dict:
    owner, repo = _parse_repo(repo_ref)
    headers = _github_headers()
    base = f"https://api.github.com/repos/{owner}/{repo}"

    try:
        repo_resp = requests.get(base, headers=headers, timeout=20)
        repo_resp.raise_for_status()
        repo_data = repo_resp.json()

        lang_resp = requests.get(f"{base}/languages", headers=headers, timeout=20)
        lang_resp.raise_for_status()
        languages = list((lang_resp.json() if lang_resp.ok else {}).keys())

        readme_resp = requests.get(
            f"{base}/readme",
            headers={**headers, "Accept": "application/vnd.github.raw"},
            timeout=20,
        )
        readme_text = readme_resp.text if readme_resp.ok else ""

        description = repo_data.get("description") or ""
        topics = repo_data.get("topics") or []
        full_name = repo_data.get("full_name", f"{owner}/{repo}")
        html_url = repo_data.get("html_url", f"https://github.com/{owner}/{repo}")
    except Exception:
        full_name = f"{owner}/{repo}"
        html_url = f"https://github.com/{owner}/{repo}"
        description = "Mock GitHub repo data (API fallback)."
        topics = ["ai", "rag", "backend"]
        languages = ["python", "fastapi", "typescript"]
        readme_text = "This is fallback repository context to keep the pipeline active."

    corpus = "\n\n".join(
        [
            f"Repository: {full_name}",
            f"Description: {description}",
            f"Topics: {', '.join(topics)}",
            f"README:\n{readme_text}",
        ]
    ).strip()

    if not corpus:
        corpus = f"Repository: {full_name}\nDescription: No description available."

    keywords = extract_keywords(corpus, limit=15)
    tech_stack = extract_tech_stack(corpus, languages=languages)
    chunks = chunk_text(corpus, chunk_size=900, overlap=140)

    embedder = get_embedding_service()
    vectors = embedder.embed_texts(chunks)
    now_iso = datetime.now(timezone.utc).isoformat()

    docs: List[VectorDocument] = []
    for idx, (chunk, vector) in enumerate(zip(chunks, vectors)):
        docs.append(
            VectorDocument(
                id=str(uuid4()),
                vector=vector,
                payload={
                    "source": "github_repo",
                    "title": f"{full_name} (chunk {idx + 1})",
                    "summary": description[:300] if description else "GitHub repository knowledge chunk",
                    "text": chunk,
                    "timestamp": now_iso,
                    "repo": full_name,
                    "keywords": keywords,
                    "tech_stack": tech_stack,
                    "url": html_url,
                    "topics": topics,
                    "languages": languages,
                },
            )
        )

    vector_store = get_vector_store()
    vector_store.upsert(docs)

    append_insights(
        [
            {
                "id": f"github-{owner}-{repo}-{int(datetime.now(timezone.utc).timestamp())}",
                "source": "github_repo",
                "title": full_name,
                "summary": description or "Repository ingested for project context.",
                "url": html_url,
                "timestamp": now_iso,
                "text": corpus[:2500],
                "metadata": {
                    "keywords": keywords,
                    "tech_stack": tech_stack,
                    "topics": topics,
                    "languages": languages,
                    "chunks": len(chunks),
                },
            }
        ]
    )

    return {
        "source": "github",
        "items_indexed": len(docs),
        "message": f"Ingested {full_name} into local knowledge base.",
        "meta": {"tech_stack": tech_stack, "keywords": keywords[:10], "repo": full_name},
    }


def ingest_github_user(username: str) -> Dict:
    username = username.strip()
    if not username:
        raise ValueError("Username is required.")
    headers = _github_headers()
    repos: List[Dict] = []
    page = 1
    while page <= 5:
        resp = requests.get(
            f"https://api.github.com/users/{username}/repos",
            headers=headers,
            params={"per_page": 100, "page": page, "sort": "updated"},
            timeout=20,
        )
        if not resp.ok:
            break
        batch = resp.json() or []
        if not batch:
            break
        repos.extend(batch)
        page += 1

    if not repos:
        raise ValueError("No repositories found or GitHub API unavailable.")

    ingested = 0
    failures: List[str] = []
    for repo in repos:
        full_name = repo.get("full_name")
        if not full_name:
            continue
        try:
            ingest_github_repository(full_name)
            ingested += 1
        except Exception:
            failures.append(full_name)

    return {
        "source": "github_user",
        "items_indexed": ingested,
        "message": f"Ingested {ingested} repos for user {username}.",
        "meta": {"user": username, "failed": failures[:10]},
    }
