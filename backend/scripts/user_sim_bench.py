#!/usr/bin/env python3
"""Simulate a real JARVIS user session: chat, research, demo build — with timings."""

from __future__ import annotations

import json
import re
import statistics
import sys
import time
import urllib.error
import urllib.request
from typing import Any

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8001"

FLUFF = re.compile(
    r"\b(certainly|i'?d be happy to|great question|as an ai|leverage|synergy|thrilled to)\b",
    re.I,
)


def get_json(path: str, timeout: float = 30.0) -> Any:
    req = urllib.request.Request(f"{BASE.rstrip('/')}{path}", headers={"Accept": "application/json"})
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return json.loads(resp.read().decode("utf-8"))


def post_json(path: str, body: dict, timeout: float = 120.0) -> Any:
    data = json.dumps(body).encode("utf-8")
    req = urllib.request.Request(
        f"{BASE.rstrip('/')}{path}",
        data=data,
        headers={"Content-Type": "application/json", "Accept": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return json.loads(resp.read().decode("utf-8"))


def stream_chat(message: str, session_id: str | None = None, timeout: float = 120.0) -> dict[str, Any]:
    payload = json.dumps(
        {"message": message, "include_context": True, "session_id": session_id}
    ).encode("utf-8")
    req = urllib.request.Request(
        f"{BASE.rstrip('/')}/chat/stream",
        data=payload,
        headers={"Content-Type": "application/json", "Accept": "text/event-stream"},
        method="POST",
    )
    t0 = time.perf_counter()
    first = None
    reply = ""
    sid = session_id
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        buf = ""
        while True:
            chunk = resp.read(256)
            if not chunk:
                break
            buf += chunk.decode("utf-8", errors="replace")
            while "\n\n" in buf:
                part, buf = buf.split("\n\n", 1)
                line = part.strip()
                if not line.startswith("data: "):
                    continue
                try:
                    ev = json.loads(line[6:])
                except json.JSONDecodeError:
                    continue
                if ev.get("type") == "session":
                    sid = ev.get("session_id") or sid
                elif ev.get("type") == "token" and ev.get("text"):
                    if first is None:
                        first = time.perf_counter()
                    reply += ev["text"]
                elif ev.get("type") == "done":
                    reply = ev.get("reply") or reply
    t1 = time.perf_counter()
    words = len(reply.split())
    return {
        "ok": bool(reply.strip()),
        "ttft_ms": round(((first or t1) - t0) * 1000, 1),
        "total_ms": round((t1 - t0) * 1000, 1),
        "words": words,
        "fluff": bool(FLUFF.search(reply)),
        "session_id": sid,
        "preview": reply.replace("\n", " ")[:220],
        "reply": reply,
    }


def score_reply(name: str, prompt: str, r: dict[str, Any]) -> list[str]:
    notes = []
    if not r["ok"]:
        notes.append("EMPTY")
        return notes
    if r["ttft_ms"] > 5000:
        notes.append(f"SLOW_TTFT>{r['ttft_ms']:.0f}ms")
    if r["words"] > 180 and name not in {"research_light"}:
        notes.append(f"VERBOSE>{r['words']}w")
    if r["fluff"]:
        notes.append("FLUFF")
    if name == "direct_fact" and "kolkata" not in r["reply"].lower() and "ist" not in r["reply"].lower():
        notes.append("MISS_TZ")
    if name == "short_focus" and r["words"] < 5:
        notes.append("TOO_THIN")
    if name == "followup" and "propeller" not in r["reply"].lower() and "anima" not in r["reply"].lower():
        # soft — context may still help
        notes.append("WEAK_CONTEXT")
    if not notes:
        notes.append("PASS")
    return notes


def main() -> int:
    print(f"BASE {BASE}")
    try:
        health = get_json("/health")
    except Exception as exc:
        print(f"HEALTH FAIL: {exc}")
        return 1

    llm = health.get("llm") or {}
    print(
        f"HEALTH groq={health.get('groq')} chat={llm.get('groq_model')} "
        f"research={llm.get('research_model')} qdrant={health.get('qdrant')}"
    )
    print("=" * 78)

    # --- User session: multi-turn chat ---
    chat_flow = [
        ("short_focus", "What should I focus on today?"),
        ("repo_summary", "Summarize my GitHub projects in 4 short bullets."),
        ("direct_fact", "What timezone should you use for scheduling?"),
        ("set_focus_chat", "Set my focus to Propeller-simulator and tell me the top next action."),
        ("followup", "what is this project about in one sentence?"),
        ("brief_style", "Give me three concrete priorities for today. No fluff."),
    ]

    rows = []
    session = None
    print("\n## CHAT (user session)")
    for name, prompt in chat_flow:
        try:
            r = stream_chat(prompt, session_id=session)
            session = r.get("session_id") or session
            notes = score_reply(name, prompt, r)
            rows.append({**r, "name": name, "notes": notes})
            flag = ",".join(notes)
            print(
                f"{name:16} TTFT {r['ttft_ms']:7.1f}  TOTAL {r['total_ms']:8.1f}  "
                f"w={r['words']:3d}  [{flag}]"
            )
            print(f"  Q: {prompt}")
            print(f"  A: {r['preview']}")
        except Exception as exc:
            print(f"{name:16} FAIL {exc}")

    if rows:
        ttfts = [r["ttft_ms"] for r in rows]
        totals = [r["total_ms"] for r in rows]
        words = [r["words"] for r in rows]
        passes = sum(1 for r in rows if r["notes"] == ["PASS"])
        print("-" * 78)
        print(
            f"CHAT SUMMARY n={len(rows)} pass={passes}/{len(rows)}  "
            f"TTFT median={statistics.median(ttfts):.0f}ms mean={statistics.mean(ttfts):.0f}ms  "
            f"TOTAL median={statistics.median(totals):.0f}ms  "
            f"words median={statistics.median(words):.0f}"
        )

    # --- Research path (slow by design) ---
    print("\n## RESEARCH (user: quick topic)")
    try:
        t0 = time.perf_counter()
        # Prefer chat-stream research intent — matches real UI
        r = stream_chat("Research Blade Element Momentum Theory in 1 page for drone props", timeout=180)
        notes = score_reply("research_light", "research", r)
        print(
            f"research_stream   TTFT {r['ttft_ms']:7.1f}  TOTAL {r['total_ms']:8.1f}  "
            f"w={r['words']:3d}  [{','.join(notes)}]"
        )
        print(f"  A: {r['preview']}")
        print(f"  wall={((time.perf_counter()-t0)*1000):.0f}ms")
    except Exception as exc:
        print(f"research_stream   FAIL {exc}")

    # --- Demo build (user) ---
    print("\n## DEMO BUILD (user: website brief)")
    try:
        t0 = time.perf_counter()
        demo = post_json(
            "/demos/build",
            {
                "brief": "Immersive site for Orbis Robotics — autonomous inspection drones, industrial jade terminal aesthetic",
                "brand": "Orbis Robotics",
            },
            timeout=600,
        )
        elapsed = (time.perf_counter() - t0) * 1000
        print(
            f"demo_build        TOTAL {elapsed:8.1f}ms  ok={demo.get('build_ok')}  "
            f"kit={demo.get('kit')}  layout={demo.get('spec',{}).get('layout') if isinstance(demo.get('spec'), dict) else demo.get('layout')}  "
            f"id={demo.get('id')}"
        )
        print(f"  title={demo.get('title')} preview={demo.get('preview_url')}")
        files = demo.get("files") or demo.get("written") or []
        if isinstance(files, list):
            print(f"  files={len(files)} sample={[f if isinstance(f, str) else f.get('path') for f in files[:6]]}")
        # Fetch preview index if present
        pid = demo.get("id")
        if pid:
            try:
                req = urllib.request.Request(
                    f"{BASE.rstrip('/')}/demos-static/{pid}/dist/index.html",
                    method="GET",
                )
                with urllib.request.urlopen(req, timeout=20) as resp:
                    html = resp.read().decode("utf-8", errors="replace")
                has_react = "react" in html.lower()
                has_root = 'id="root"' in html or "id='root'" in html
                print(f"  preview_html={len(html)}b  has_react={has_react}  has_root={has_root}")
            except Exception as exc:
                print(f"  preview_fetch FAIL {exc}")
    except Exception as exc:
        print(f"demo_build        FAIL {exc}")

    # --- Demos list ---
    print("\n## DEMOS LIST")
    try:
        demos = get_json("/demos")
        items = demos.get("demos") or []
        print(f"count={len(items)}")
        for d in items[:5]:
            print(f"  - {d.get('id')} {d.get('title')} kit={d.get('kit')} build_ok={d.get('build_ok')}")
    except Exception as exc:
        print(f"demos FAIL {exc}")

    print("\nDONE")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
