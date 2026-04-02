from dataclasses import dataclass
from typing import Any, Dict, List, Optional

from qdrant_client import QdrantClient
from qdrant_client.models import Distance, PointStruct, VectorParams

from app.services.config import get_settings
from app.services.embeddings import get_embedding_service


@dataclass
class VectorDocument:
    id: str
    vector: List[float]
    payload: Dict[str, Any]


class VectorStore:
    def __init__(self) -> None:
        settings = get_settings()
        self.collection = settings.qdrant_collection
        self.client = QdrantClient(url=settings.qdrant_url)
        self._ensure_collection()

    def _ensure_collection(self) -> None:
        embedder = get_embedding_service()
        exists = self.client.collection_exists(self.collection)
        if not exists:
            self.client.create_collection(
                collection_name=self.collection,
                vectors_config=VectorParams(size=embedder.dimension, distance=Distance.COSINE),
            )

    def upsert(self, documents: List[VectorDocument]) -> None:
        if not documents:
            return
        points = [
            PointStruct(id=doc.id, vector=doc.vector, payload=doc.payload) for doc in documents
        ]
        self.client.upsert(collection_name=self.collection, wait=True, points=points)

    def search(self, query_vector: List[float], limit: int = 5) -> List[Dict[str, Any]]:
        hits = self.client.search(
            collection_name=self.collection, query_vector=query_vector, limit=limit
        )
        return [
            {
                "id": str(hit.id),
                "score": float(hit.score),
                "payload": hit.payload or {},
            }
            for hit in hits
        ]


_VECTOR_STORE: Optional[VectorStore] = None


def get_vector_store() -> VectorStore:
    global _VECTOR_STORE
    if _VECTOR_STORE is None:
        _VECTOR_STORE = VectorStore()
    return _VECTOR_STORE
