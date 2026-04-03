import os
import json
import hashlib
from pathlib import Path
from typing import List, Dict

QDRANT_URL = os.getenv("QDRANT_URL", "http://localhost:6333")
COLLECTION_NAME = "jarvis_brain"
EMBEDDING_MODEL = os.getenv("EMBEDDING_MODEL", "all-MiniLM-L6-v2")
DATA_DIR = Path(__file__).parent.parent / "data"
DATA_DIR.mkdir(exist_ok=True)
LOCAL_STORE = DATA_DIR / "knowledge_store.json"

_encoder = None

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
    if LOCAL_STORE.exists():
        try:
            return json.loads(LOCAL_STORE.read_text())
        except:
            pass
    return []

def save_local_store(docs: List[Dict]):
    LOCAL_STORE.write_text(json.dumps(docs, indent=2))

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

async def search(query: str, top_k: int = 5) -> List[Dict]:
    results = []
    
    # Try Qdrant semantic search
    try:
        import httpx
        encoder = get_encoder()
        if encoder:
            embedding = encoder.encode(query).tolist()
            async with httpx.AsyncClient(timeout=10.0) as client:
                resp = await client.post(
                    f"{QDRANT_URL}/collections/{COLLECTION_NAME}/points/search",
                    json={"vector": embedding, "limit": top_k, "with_payload": True}
                )
                if resp.status_code == 200:
                    hits = resp.json().get("result", [])
                    results = [{"text": h["payload"].get("text", ""), "score": h["score"], "metadata": {k: v for k, v in h["payload"].items() if k != "text"}} for h in hits]
    except Exception as e:
        print(f"[RAG] Qdrant search failed: {e}")
    
    # Fallback: keyword search local store
    if not results:
        docs = load_local_store()
        query_lower = query.lower()
        scored = []
        for doc in docs:
            score = sum(1 for word in query_lower.split() if word in doc["text"].lower())
            if score > 0:
                scored.append({"text": doc["text"][:500], "score": score / 10.0, "metadata": doc.get("metadata", {})})
        scored.sort(key=lambda x: x["score"], reverse=True)
        results = scored[:top_k]
    
    return results

def get_context_string(results: List[Dict], max_chars: int = 2000) -> str:
    if not results:
        return ""
    parts = []
    total = 0
    for r in results:
        text = r.get("text", "")
        meta = r.get("metadata", {})
        chunk = f"[{meta.get('source', 'doc')}] {text}"
        if total + len(chunk) > max_chars:
            break
        parts.append(chunk)
        total += len(chunk)
    return "\n---\n".join(parts)

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
