import re
from collections import Counter
from typing import List

STOPWORDS = {
    "a",
    "an",
    "and",
    "are",
    "as",
    "at",
    "be",
    "by",
    "for",
    "from",
    "has",
    "he",
    "in",
    "is",
    "it",
    "its",
    "of",
    "on",
    "that",
    "the",
    "to",
    "was",
    "were",
    "will",
    "with",
    "this",
    "your",
    "you",
    "our",
    "we",
}

TECH_HINTS = [
    "python",
    "typescript",
    "javascript",
    "react",
    "next.js",
    "fastapi",
    "django",
    "flask",
    "node",
    "postgres",
    "redis",
    "docker",
    "kubernetes",
    "aws",
    "gcp",
    "azure",
    "tailwind",
    "tensorflow",
    "pytorch",
    "rust",
    "go",
    "java",
]


def clean_text(text: str) -> str:
    return re.sub(r"\s+", " ", text).strip()


def chunk_text(text: str, chunk_size: int = 700, overlap: int = 120) -> List[str]:
    normalized = clean_text(text)
    if len(normalized) <= chunk_size:
        return [normalized] if normalized else []

    chunks: List[str] = []
    start = 0
    text_len = len(normalized)
    while start < text_len:
        end = min(start + chunk_size, text_len)
        chunks.append(normalized[start:end])
        if end == text_len:
            break
        start = max(0, end - overlap)
    return chunks


def extract_keywords(text: str, limit: int = 12) -> List[str]:
    words = re.findall(r"[a-zA-Z][a-zA-Z0-9\-\+\.#]{2,}", text.lower())
    filtered = [w for w in words if w not in STOPWORDS]
    top = Counter(filtered).most_common(limit * 2)
    keywords: List[str] = []
    for word, _ in top:
        if word not in keywords:
            keywords.append(word)
        if len(keywords) >= limit:
            break
    return keywords


def extract_tech_stack(text: str, languages: List[str]) -> List[str]:
    text_l = text.lower()
    stack = set(languages)
    for hint in TECH_HINTS:
        if hint in text_l:
            stack.add(hint)
    return sorted(stack)

