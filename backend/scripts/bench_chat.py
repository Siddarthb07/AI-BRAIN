#!/usr/bin/env python3
"""Live chat latency + quality smoke benchmark against a running JARVIS API.

Measures:
  - TTFT (time to first SSE token)
  - Total stream time
  - Reply length / word count
  - Model reported via /health

Usage (host):
  python backend/scripts/bench_chat.py
  python backend/scripts/bench_chat.py --base http://127.0.0.1:8001
"""

from __future__ import annotations

import argparse
import json
import statistics
import sys
import time
import urllib.error
import urllib.request
from typing import Any


PROMPTS = [
    ("short_focus", "What should I focus on today?"),
    ("repo_summary", "Summarize my GitHub projects in 4 bullets."),
    ("what_is_this", "what is this"),
    ("direct_fact", "What timezone should you use for scheduling?"),
]


def _get_json(url: str, timeout: float = 20.0) -> dict[str, Any]:
    req = urllib.request.Request(url, headers={"Accept": "application/json"})
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return json.loads(resp.read().decode("utf-8"))


def _stream_chat(base: str, message: str, timeout: float = 120.0) -> dict[str, Any]:
    payload = json.dumps(
        {
            "message": message,
            "include_context": True,
            "session_id": None,
        }
    ).encode("utf-8")
    req = urllib.request.Request(
        f"{base.rstrip('/')}/chat/stream",
        data=payload,
        headers={"Content-Type": "application/json", "Accept": "text/event-stream"},
        method="POST",
    )
    t0 = time.perf_counter()
    first_token_at: float | None = None
    tokens: list[str] = []
    reply = ""
    model_meta: dict[str, Any] = {}

    with urllib.request.urlopen(req, timeout=timeout) as resp:
        buffer = ""
        while True:
            chunk = resp.read(256)
            if not chunk:
                break
            buffer += chunk.decode("utf-8", errors="replace")
            while "\n\n" in buffer:
                part, buffer = buffer.split("\n\n", 1)
                line = part.strip()
                if not line.startswith("data: "):
                    continue
                try:
                    event = json.loads(line[6:])
                except json.JSONDecodeError:
                    continue
                et = event.get("type")
                if et == "token" and event.get("text"):
                    if first_token_at is None:
                        first_token_at = time.perf_counter()
                    text = event["text"]
                    tokens.append(text)
                    reply += text
                elif et == "meta":
                    model_meta = event
                elif et == "done":
                    reply = event.get("reply") or reply

    t1 = time.perf_counter()
    return {
        "ttft_ms": round(((first_token_at or t1) - t0) * 1000, 1),
        "total_ms": round((t1 - t0) * 1000, 1),
        "chars": len(reply),
        "words": len(reply.split()),
        "token_events": len(tokens),
        "reply_preview": reply[:220].replace("\n", " "),
        "meta": model_meta,
        "ok": bool(reply.strip()),
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="JARVIS chat latency benchmark")
    parser.add_argument("--base", default="http://127.0.0.1:8001")
    parser.add_argument("--rounds", type=int, default=1)
    args = parser.parse_args()
    base = args.base.rstrip("/")

    print(f"BASE {base}")
    try:
        health = _get_json(f"{base}/health")
    except Exception as exc:
        print(f"HEALTH FAIL: {exc}")
        return 1

    llm = health.get("llm") or {}
    print(
        f"HEALTH groq={health.get('groq')} primary={llm.get('primary')} "
        f"chat={llm.get('groq_model')} research={llm.get('research_model')}"
    )
    print("-" * 72)

    rows: list[dict[str, Any]] = []
    for round_i in range(args.rounds):
        for name, prompt in PROMPTS:
            label = f"{name}" if args.rounds == 1 else f"{name}#{round_i + 1}"
            try:
                result = _stream_chat(base, prompt)
            except urllib.error.HTTPError as exc:
                body = exc.read().decode("utf-8", errors="replace")[:200]
                print(f"{label:16} FAIL HTTP {exc.code}: {body}")
                continue
            except Exception as exc:
                print(f"{label:16} FAIL: {exc}")
                continue
            rows.append({"name": name, **result})
            flag = "OK" if result["ok"] else "EMPTY"
            print(
                f"{label:16} {flag:5}  TTFT {result['ttft_ms']:7.1f} ms  "
                f"TOTAL {result['total_ms']:8.1f} ms  "
                f"words {result['words']:4d}  | {result['reply_preview']}"
            )

    if not rows:
        print("No successful runs.")
        return 2

    ttfts = [r["ttft_ms"] for r in rows]
    totals = [r["total_ms"] for r in rows]
    words = [r["words"] for r in rows]
    print("-" * 72)
    print(
        f"SUMMARY n={len(rows)}  "
        f"TTFT median={statistics.median(ttfts):.0f}ms mean={statistics.mean(ttfts):.0f}ms  "
        f"TOTAL median={statistics.median(totals):.0f}ms mean={statistics.mean(totals):.0f}ms  "
        f"words median={statistics.median(words):.0f}"
    )
    # Soft targets for local Groq chat after the speed pass
    slow = [r for r in rows if r["ttft_ms"] > 8000]
    long = [r for r in rows if r["words"] > 220 and r["name"] != "repo_summary"]
    if slow:
        print(f"WARN {len(slow)} prompt(s) TTFT > 8s")
    if long:
        print(f"WARN {len(long)} prompt(s) longer than ~220 words (brevity regression)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
