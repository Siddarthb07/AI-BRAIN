from __future__ import annotations

import re
from datetime import datetime, timezone
from typing import Dict, List, Tuple
from uuid import uuid4

import requests

from app.services.config import get_settings
from app.services.embeddings import get_embedder
from app.services.storage import append_insights, append_learned_topics, upsert_repo
from app.services.text_utils import chunk_text, extract_keywords
from app.services.vector_store import VectorDocument, get_vector_store


def _parse_repo(repo: str) -> Tuple[str, str]:
    repo = repo.strip()
    if repo.startswith("https://github.com/") or repo.startswith("http://github.com/"):
        parts = re.sub(r"^https?://github\.com/", "", repo).strip("/").split("/")
        if len(parts) < 2:
            raise ValueError("Invalid GitHub URL.")
        return parts[0], parts[1]
    parts = repo.split("/")
    if len(parts) != 2:
        raise ValueError("Repo must be owner/repo.")
    return parts[0], parts[1]


def _headers() -> Dict[str, str]:
    settings = get_settings()
    headers = {"Accept": "application/vnd.github+json"}
    if settings.github_token:
        headers["Authorization"] = f"Bearer {settings.github_token}"
    return headers


def ingest_repo(repo_ref: str) -> Dict:
    owner, repo = _parse_repo(repo_ref)
    headers = _headers()
    base = f"https://api.github.com/repos/{owner}/{repo}"

    try:
        repo_resp = requests.get(base, headers=headers, timeout=20)
        repo_resp.raise_for_status()
        repo_data = repo_resp.json()

        lang_resp = requests.get(f"{base}/languages", headers=headers, timeout=20)
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
        description = "Fallback GitHub repo data."
        topics = ["ai", "rag", "backend"]
        languages = ["python", "fastapi"]
        readme_text = "Fallback README context."

    upsert_repo(
        {
            "name": repo,
            "full_name": full_name,
            "description": description,
            "topics": topics,
            "language": (languages[0] if languages else None),
            "languages": languages,
            "html_url": html_url,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }
    )

    corpus = "\n\n".join(
        [
            f"Repository: {full_name}",
            f"Description: {description}",
            f"Topics: {', '.join(topics)}",
            f"README:\n{readme_text}",
        ]
    ).strip()
    if not corpus:
        corpus = f"Repository: {full_name}"

    keywords = extract_keywords(corpus, limit=15)
    chunks = chunk_text(corpus, chunk_size=900, overlap=140)
    embedder = get_embedder()
    vectors = embedder.embed_texts(chunks)
    now_iso = datetime.now(timezone.utc).isoformat()

    docs: List[VectorDocument] = []
    for idx, (chunk, vec) in enumerate(zip(chunks, vectors)):
        docs.append(
            VectorDocument(
                id=str(uuid4()),
                vector=vec,
                payload={
                    "source": "github_repo",
                    "title": f"{full_name} (chunk {idx + 1})",
                    "summary": description[:300] if description else "GitHub repo knowledge",
                    "text": chunk,
                    "timestamp": now_iso,
                    "repo": full_name,
                    "keywords": keywords,
                    "topics": topics,
                    "languages": languages,
                    "url": html_url,
                },
            )
        )

    try:
        get_vector_store().upsert(docs)
    except Exception:
        pass

    append_insights(
        [
            {
                "id": f"github-{owner}-{repo}-{int(datetime.now(timezone.utc).timestamp())}",
                "source": "github_repo",
                "title": full_name,
                "summary": description or "Repository ingested.",
                "url": html_url,
                "timestamp": now_iso,
                "text": corpus[:2500],
                "metadata": {
                    "keywords": keywords,
                    "topics": topics,
                    "languages": languages,
                    "chunks": len(chunks),
                },
            }
        ]
    )

    append_learned_topics(topics + keywords[:6])

    return {
        "source": "github",
        "items_indexed": len(docs),
        "message": f"Ingested {full_name}.",
        "meta": {"repo": full_name, "topics": topics, "languages": languages},
    }


def ingest_user(username: str) -> Dict:
    username = username.strip()
    if not username:
        raise ValueError("Username required.")
    headers = _headers()
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
        return {"source": "github_user", "items_indexed": 0, "message": "No repos found.", "meta": {}}

    ingested = 0
    for repo in repos:
        full_name = repo.get("full_name")
        if not full_name:
            continue
        upsert_repo(
            {
                "name": repo.get("name", ""),
                "full_name": full_name,
                "description": repo.get("description") or "",
                "topics": repo.get("topics") or [],
                "language": repo.get("language"),
                "languages": [repo.get("language")] if repo.get("language") else [],
                "html_url": repo.get("html_url"),
                "updated_at": repo.get("updated_at") or datetime.now(timezone.utc).isoformat(),
            }
        )
        try:
            ingest_repo(full_name)
            ingested += 1
        except Exception:
            continue

    return {
        "source": "github_user",
        "items_indexed": ingested,
        "message": f"Ingested {ingested} repos for {username}.",
        "meta": {"user": username, "repos": len(repos)},
    }
