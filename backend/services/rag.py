import os
import json
import hashlib
from pathlib import Path
from typing import List, Dict, Optional

QDRANT_URL = os.getenv("QDRANT_URL", "http://localhost:6333")
COLLECTION_NAME = "jarvis_brain"
EMBEDDING_MODEL = os.getenv("EMBEDDING_MODEL", "all-MiniLM-L6-v2")
DATA_DIR = Path(__file__).parent.parent / "data"
DATA_DIR.mkdir(exist_ok=True)
LOCAL_STORE = DATA_DIR / "knowledge_store.json"

_encoder = None
_local_docs_cache: Optional[List[Dict]] = None
_local_docs_mtime: float = 0.0

def get_encoder():
    global _encoder
    if _encoder is None:
        try:
            from sentence_transformers import SentenceTransformer
            _encoder = SentenceTransformer(EMBEDDING_MODEL)
            print(f"[RAG] Encoder loaded: {EMBEDDING_MODEL}")
        except Exception as e:
            print(f"[RAG] Encoder failed: {e}")
    return _encoder

def load_local_store() -> List[Dict]:
    global _local_docs_cache, _local_docs_mtime
    if LOCAL_STORE.exists():
        try:
            mtime = LOCAL_STORE.stat().st_mtime
            if _local_docs_cache is not None and mtime == _local_docs_mtime:
                return _local_docs_cache
            docs = json.loads(LOCAL_STORE.read_text(encoding="utf-8"))
            _local_docs_cache = docs if isinstance(docs, list) else []
            _local_docs_mtime = mtime
            return _local_docs_cache
        except Exception:
            pass
    _local_docs_cache = []
    _local_docs_mtime = 0.0
    return _local_docs_cache

def save_local_store(docs: List[Dict]):
    global _local_docs_cache, _local_docs_mtime
    LOCAL_STORE.write_text(json.dumps(docs, indent=2), encoding="utf-8")
    _local_docs_cache = docs
    try:
        _local_docs_mtime = LOCAL_STORE.stat().st_mtime
    except OSError:
        _local_docs_mtime = 0.0

async def add_document(text: str, metadata: Dict) -> bool:
    doc_id = hashlib.md5(text.encode()).hexdigest()
    docs = load_local_store()
    
    # Check duplicate
    if any(d.get("id") == doc_id for d in docs):
        return True
    
    doc = {"id": doc_id, "text": text, "metadata": metadata}
    
    # Try Qdrant
    try:
        import httpx
        encoder = get_encoder()
        if encoder:
            embedding = encoder.encode(text).tolist()
            async with httpx.AsyncClient(timeout=10.0) as client:
                # Ensure collection
                await client.put(
                    f"{QDRANT_URL}/collections/{COLLECTION_NAME}",
                    json={"vectors": {"size": len(embedding), "distance": "Cosine"}}
                )
                await client.put(
                    f"{QDRANT_URL}/collections/{COLLECTION_NAME}/points",
                    json={"points": [{"id": abs(int(doc_id[:8], 16)), "vector": embedding, "payload": {**metadata, "text": text[:500]}}]}
                )
                doc["embedded"] = True
    except Exception as e:
        print(f"[RAG] Qdrant add failed: {e}")
    
    docs.append(doc)
    save_local_store(docs)
    return True

async def search(query: str, top_k: int = 5, repo_name: Optional[str] = None) -> List[Dict]:
    """Chat-hot-path search. Keyword-first; semantic encode is opt-in (RAG_SEMANTIC=1)."""
    results = []
    docs = load_local_store()
    stop = {"the", "a", "an", "my", "me", "about", "project", "repo", "repository", "what", "how", "can", "i", "it", "is", "are", "of", "to", "and", "for"}
    semantic = os.getenv("RAG_SEMANTIC", "0").strip().lower() in {"1", "true", "yes", "on"}

    def hydrate(hit: Dict) -> Dict:
        """Prefer full local text over Qdrant's truncated payload."""
        meta = hit.get("metadata") or {}
        text = hit.get("text") or ""
        source = str(meta.get("source") or "")
        path = str(meta.get("path") or "")
        name = str(meta.get("name") or "")
        for doc in docs:
            dm = doc.get("metadata") or {}
            if source and dm.get("source") == source:
                return {**hit, "text": doc.get("text") or text, "metadata": {**dm, **meta}}
            if name and path and dm.get("name") == name and dm.get("path") == path:
                return {**hit, "text": doc.get("text") or text, "metadata": {**dm, **meta}}
        return hit

    def matches_repo(meta: Dict) -> bool:
        if not repo_name:
            return True
        target = repo_name.lower()
        return (
            str(meta.get("name") or "").lower() == target
            or target in str(meta.get("source") or "").lower()
        )

    # Keyword search first (ms) — keeps chat TTFT low
    query_lower = query.lower()
    words = [w for w in query_lower.replace("/", " ").split() if len(w) > 1 and w not in stop]
    if repo_name:
        words = list(dict.fromkeys([repo_name.lower(), *words]))
    scored = []
    for doc in docs:
        meta = doc.get("metadata") or {}
        if not matches_repo(meta):
            continue
        text_l = (doc.get("text") or "").lower()
        score = 0.0
        for word in words:
            if word in text_l:
                score += 2.0 if word == (repo_name or "").lower() else 1.0
        dtype = meta.get("type")
        if dtype == "repo_meta":
            score += 3.0
        elif dtype == "repo_structure":
            score += 2.5
        elif dtype == "code_file" and str(meta.get("path") or "").lower().endswith(("readme.md", "app.py", "main.py")):
            score += 1.5
        if score > 0:
            scored.append({"text": doc.get("text") or "", "score": score, "metadata": meta})
    scored.sort(key=lambda x: x["score"], reverse=True)
    results = scored[:top_k]

    # Optional semantic pass (cold SentenceTransformer load can cost 30–60s)
    if semantic and len(results) < top_k:
        try:
            import asyncio
            import httpx
            encoder = get_encoder()
            if encoder:
                embedding = await asyncio.to_thread(lambda: encoder.encode(query).tolist())
                async with httpx.AsyncClient(timeout=10.0) as client:
                    resp = await client.post(
                        f"{QDRANT_URL}/collections/{COLLECTION_NAME}/points/search",
                        json={"vector": embedding, "limit": top_k * 3, "with_payload": True}
                    )
                    if resp.status_code == 200:
                        hits = resp.json().get("result", [])
                        seen_sources = {str((r.get("metadata") or {}).get("source")) for r in results}
                        for h in hits:
                            payload = h.get("payload") or {}
                            meta = {k: v for k, v in payload.items() if k != "text"}
                            if not matches_repo(meta):
                                continue
                            src = str(meta.get("source") or "")
                            if src in seen_sources:
                                continue
                            results.append(hydrate({"text": payload.get("text", ""), "score": h.get("score", 0), "metadata": meta}))
                            seen_sources.add(src)
                            if len(results) >= top_k:
                                break
        except Exception as e:
            print(f"[RAG] Qdrant search failed: {e}")

    return results[:top_k]


def docs_for_repo(repo_name: str, types: Optional[List[str]] = None, limit: int = 8) -> List[Dict]:
    """Pull full local RAG docs for a named repo (meta/structure/code)."""
    docs = load_local_store()
    target = repo_name.lower()
    wanted = set(types or ["repo_meta", "repo_structure", "code_file"])
    out = []
    for doc in docs:
        meta = doc.get("metadata") or {}
        if str(meta.get("name") or "").lower() != target:
            continue
        if meta.get("type") not in wanted:
            continue
        out.append({"text": doc.get("text") or "", "score": 1.0, "metadata": meta})
    # Prefer meta + structure first, then entry-like files
    def rank(item):
        meta = item.get("metadata") or {}
        t = meta.get("type")
        path = str(meta.get("path") or "").lower()
        if t == "repo_meta":
            return 0
        if t == "repo_structure":
            return 1
        if path.endswith(("readme.md", "app.py", "main.py", "server.py", "pyproject.toml")):
            return 2
        return 3
    out.sort(key=rank)
    return out[:limit]


def get_context_string(results: List[Dict], max_chars: int = 2000) -> str:
    if not results:
        return ""
    parts = []
    total = 0
    for i, r in enumerate(results, start=1):
        text = r.get("text", "")
        meta = r.get("metadata", {})
        path = meta.get("path") or meta.get("source") or meta.get("title") or "doc"
        # Cap individual snippet so one README doesn't eat the whole budget alone
        snippet = text if len(text) <= 3500 else text[:3500] + "…"
        chunk = f"[{i}] ({path}) {snippet}"
        if total + len(chunk) > max_chars:
            remain = max_chars - total
            if remain > 200:
                parts.append(chunk[:remain] + "…")
            break
        parts.append(chunk)
        total += len(chunk)
    return "\n---\n".join(parts)


def format_citations(results: List[Dict]) -> List[Dict]:
    citations = []
    for i, r in enumerate(results, start=1):
        meta = r.get("metadata", {})
        path = meta.get("path") or meta.get("source") or meta.get("title") or "unknown"
        citations.append(
            {
                "id": i,
                "path": path,
                "snippet": (r.get("text") or "")[:200],
                "score": r.get("score"),
            }
        )
    return citations

def _local_label(metadata: Dict) -> str:
    if metadata.get("title"):
        return str(metadata["title"]).strip()
    if metadata.get("filename"):
        return Path(str(metadata["filename"])).name
    source = str(metadata.get("source", "")).split(":", 1)[-1]
    return Path(source).name or source or "Local document"

def _local_kind(metadata: Dict) -> str:
    file_type = str(metadata.get("file_type") or metadata.get("language") or "").lower()
    label = _local_label(metadata).lower()
    if "pdf" in file_type or label.endswith(".pdf"):
        return "local_pdf"
    return "local_text"

def _local_preview(text: str) -> str:
    body = text.split("\n---\n", 1)[-1] if "\n---\n" in text else text
    return " ".join(body.replace("\r", " ").split())[:180]

def get_recent_local_documents(limit: int = 10) -> List[Dict]:
    docs = load_local_store()
    seen_sources = set()
    results = []

    for doc in reversed(docs):
        metadata = doc.get("metadata", {})
        doc_type = metadata.get("type")
        if doc_type not in {"local_file", "local_dir", "paste"}:
            continue

        source = str(metadata.get("source", "")).strip()
        if not source or source in seen_sources:
            continue

        seen_sources.add(source)
        results.append(
            {
                "id": source,
                "title": _local_label(metadata),
                "kind": _local_kind(metadata),
                "source": source,
                "source_type": doc_type,
                "file_type": metadata.get("file_type") or "",
                "language": metadata.get("language") or "",
                "directory": metadata.get("directory") or "",
                "chunks": int(metadata.get("total_chunks") or 1),
                "preview": _local_preview(doc.get("text", "")),
            }
        )

        if len(results) >= limit:
            break

    return results
