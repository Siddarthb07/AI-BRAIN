"""SQLite-backed chat sessions for JARVIS."""

from __future__ import annotations

import json
import sqlite3
import threading
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

DB_PATH = Path(__file__).parent.parent / "data" / "jarvis.db"
_DB_LOCK = threading.RLock()


def _connect() -> sqlite3.Connection:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(DB_PATH), check_same_thread=False, timeout=30.0)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA busy_timeout=30000")
    return conn


def _init_db() -> None:
    with _connect() as conn:
        conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS sessions (
                id TEXT PRIMARY KEY,
                title TEXT NOT NULL,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS messages (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                session_id TEXT NOT NULL,
                role TEXT NOT NULL,
                content TEXT NOT NULL,
                meta_json TEXT,
                created_at TEXT NOT NULL,
                FOREIGN KEY(session_id) REFERENCES sessions(id)
            );
            """
        )


_init_db()


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def create_session(title: str = "New chat") -> dict[str, Any]:
    sid = str(uuid.uuid4())
    ts = _now()
    with _DB_LOCK, _connect() as conn:
        conn.execute(
            "INSERT INTO sessions (id, title, created_at, updated_at) VALUES (?, ?, ?, ?)",
            (sid, title[:120], ts, ts),
        )
    return {"id": sid, "title": title[:120], "created_at": ts, "updated_at": ts}


def list_sessions(limit: int = 50) -> list[dict[str, Any]]:
    with _DB_LOCK, _connect() as conn:
        rows = conn.execute(
            "SELECT id, title, created_at, updated_at FROM sessions ORDER BY updated_at DESC LIMIT ?",
            (limit,),
        ).fetchall()
    return [dict(r) for r in rows]


def get_session(session_id: str) -> dict[str, Any] | None:
    with _DB_LOCK, _connect() as conn:
        row = conn.execute(
            "SELECT id, title, created_at, updated_at FROM sessions WHERE id = ?",
            (session_id,),
        ).fetchone()
    return dict(row) if row else None


def get_messages(session_id: str, limit: int = 100) -> list[dict[str, Any]]:
    with _DB_LOCK, _connect() as conn:
        rows = conn.execute(
            "SELECT role, content, meta_json, created_at FROM messages WHERE session_id = ? ORDER BY id ASC LIMIT ?",
            (session_id, limit),
        ).fetchall()
    out = []
    for r in rows:
        item = {"role": r["role"], "content": r["content"], "timestamp": r["created_at"]}
        if r["meta_json"]:
            try:
                item["meta"] = json.loads(r["meta_json"])
            except json.JSONDecodeError:
                item["meta"] = r["meta_json"]
        out.append(item)
    return out


def append_message(session_id: str, role: str, content: str, meta: dict | None = None) -> None:
    import json

    ts = _now()
    meta_json = json.dumps(meta) if meta else None
    with _DB_LOCK, _connect() as conn:
        conn.execute(
            "INSERT INTO messages (session_id, role, content, meta_json, created_at) VALUES (?, ?, ?, ?, ?)",
            (session_id, role, content, meta_json, ts),
        )
        conn.execute("UPDATE sessions SET updated_at = ? WHERE id = ?", (ts, session_id))


def delete_session(session_id: str) -> bool:
    with _DB_LOCK, _connect() as conn:
        conn.execute("DELETE FROM messages WHERE session_id = ?", (session_id,))
        cur = conn.execute("DELETE FROM sessions WHERE id = ?", (session_id,))
        return cur.rowcount > 0


def ensure_session(session_id: str | None) -> str:
    if session_id and get_session(session_id):
        return session_id
    return create_session()["id"]
