"""Quick RAG eval — writes baseline JSON."""

from __future__ import annotations

import argparse
import asyncio
import json
from pathlib import Path

from services import rag

DEFAULT_QUERIES = [
    "project goals",
    "daily notes",
    "meeting",
    "todo tasks",
    "research",
]


async def run_eval(queries: list[str], top_k: int = 5) -> dict:
    hits = 0
    details = []
    for q in queries:
        results = await rag.search(q, top_k=top_k)
        got = len(results) > 0
        hits += int(got)
        details.append({"query": q, "hits": len(results), "top_path": (results[0].get("metadata") or {}).get("path") if results else None})
    recall = hits / max(len(queries), 1)
    return {"recall_at_k": recall, "queries": len(queries), "top_k": top_k, "details": details}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--quick", action="store_true")
    parser.add_argument("--top-k", type=int, default=5)
    args = parser.parse_args()
    queries = DEFAULT_QUERIES[:3] if args.quick else DEFAULT_QUERIES

    report = asyncio.run(run_eval(queries, top_k=args.top_k))
    out_dir = Path(__file__).resolve().parent.parent / "data" / "reports"
    out_dir.mkdir(parents=True, exist_ok=True)
    out_path = out_dir / "rag_baseline.json"
    out_path.write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(json.dumps(report, indent=2))
    print(f"Wrote {out_path}")


if __name__ == "__main__":
    main()
