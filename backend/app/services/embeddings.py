from functools import lru_cache
from typing import List

from sentence_transformers import SentenceTransformer

from app.services.config import get_settings


class EmbeddingService:
    def __init__(self) -> None:
        settings = get_settings()
        self.model = SentenceTransformer(settings.embedding_model)
        self.dimension = self.model.get_sentence_embedding_dimension()

    def embed_texts(self, texts: List[str]) -> List[List[float]]:
        if not texts:
            return []
        vectors = self.model.encode(texts, normalize_embeddings=True)
        return vectors.tolist()

    def embed_text(self, text: str) -> List[float]:
        return self.embed_texts([text])[0]


@lru_cache
def get_embedding_service() -> EmbeddingService:
    return EmbeddingService()

