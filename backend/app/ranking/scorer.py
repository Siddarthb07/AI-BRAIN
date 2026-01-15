from __future__ import annotations

from datetime import datetime, timezone
from typing import Dict, List

import numpy as np

from app.services.embeddings import get_embedding_service


def _cosine(a: np.ndarray, b: np.ndarray) -> float:
    if a.size == 0 or b.size == 0:
        return 0.0
    denom = np.linalg.norm(a) * np.linalg.norm(b)
    if denom == 0:
        return 0.0
    return float(np.dot(a, b) / denom)


def _recency_score(ts: str) -> float:
    try:
        event_time = datetime.fromisoformat(ts.replace("Z", "+00:00"))
    except Exception:
        return 0.2
    age_hours = max(
        0.0, (datetime.now(timezone.utc) - event_time.astimezone(timezone.utc)).total_seconds() / 3600
    )
    return float(np.exp(-age_hours / 72.0))


def _actionability_score(text: str) -> float:
    text_l = (text or "").lower()
    action_words = [
        "build",
        "ship",
        "release",
        "deploy",
        "fix",
        "optimize",
        "benchmark",
        "tutorial",
        "guide",
        "implementation",
        "tool",
        "open source",
        "how to",
        "step",
    ]
    hits = sum(1 for word in action_words if word in text_l)
    base = min(1.0, hits / 5.0)
    if len(text_l) > 180:
        base += 0.1
    return float(min(1.0, base))


def rank_insights(candidates: List[Dict], daily_goals: List[str], active_project: str) -> List[Dict]:
    if not candidates:
        return []

    embedder = get_embedding_service()
    candidate_texts = [f"{c.get('title', '')}. {c.get('summary', '')}. {c.get('text', '')}" for c in candidates]
    cand_vecs = embedder.embed_texts(candidate_texts)
    cand_arrs = [np.array(v, dtype=float) for v in cand_vecs]

    project_vec = None
    if active_project.strip():
        project_vec = np.array(embedder.embed_text(active_project), dtype=float)

    goal_vecs = [
        np.array(vec, dtype=float)
        for vec in embedder.embed_texts([g for g in daily_goals if g.strip()])
    ]

    base_scores: List[Dict] = []
    for item, vec in zip(candidates, cand_arrs):
        project_relevance = _cosine(vec, project_vec) if project_vec is not None else 0.5
        goal_alignment = max((_cosine(vec, gv) for gv in goal_vecs), default=0.5)
        recency = _recency_score(item.get("timestamp", ""))
        actionability = _actionability_score(item.get("summary", "") + " " + item.get("text", ""))
        base_scores.append(
            {
                "item": item,
                "vector": vec,
                "project_relevance": project_relevance,
                "goal_alignment": goal_alignment,
                "recency": recency,
                "actionability": actionability,
            }
        )

    selected: List[Dict] = []
    chosen_vectors: List[np.ndarray] = []
    remaining = base_scores.copy()
    while remaining and len(selected) < 5:
        best = None
        best_score = -1.0
        for row in remaining:
            if not chosen_vectors:
                novelty = 1.0
            else:
                max_sim = max(_cosine(row["vector"], prev) for prev in chosen_vectors)
                novelty = max(0.0, 1.0 - max_sim)

            score = (
                (row["project_relevance"] * 0.4)
                + (row["goal_alignment"] * 0.3)
                + (row["recency"] * 0.1)
                + (novelty * 0.1)
                + (row["actionability"] * 0.1)
            )

            if score > best_score:
                best = {**row, "novelty": novelty, "score": score}
                best_score = score

        if not best:
            break

        item = best["item"]
        selected.append(
            {
                "id": item.get("id", ""),
                "source": item.get("source", "unknown"),
                "title": item.get("title", ""),
                "summary": item.get("summary", ""),
                "score": round(best["score"], 4),
                "project_relevance": round(best["project_relevance"], 4),
                "goal_alignment": round(best["goal_alignment"], 4),
                "recency": round(best["recency"], 4),
                "novelty": round(best["novelty"], 4),
                "actionability": round(best["actionability"], 4),
                "url": item.get("url"),
                "metadata": item.get("metadata", {}),
            }
        )
        chosen_vectors.append(best["vector"])
        remaining = [row for row in remaining if row["item"].get("id") != item.get("id")]

    return selected

