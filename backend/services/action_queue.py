"""Durable SQLite action queue with confirm binding + audit log."""

from __future__ import annotations

import json
import secrets
import sqlite3
import threading
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

DB_PATH = Path(__file__).parent.parent / "data" / "jarvis.db"
_DB_LOCK = threading.RLock()

# Confirmation tiers
TIER_READ = 0
TIER_LIGHT = 1
TIER_CLIMATE = 2
TIER_CRITICAL = 3

DEFAULT_TTL_SECONDS = 120


def _connect() -> sqlite3.Connection:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(DB_PATH), check_same_thread=False, timeout=30.0)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    return conn


def _init() -> None:
    with _connect() as conn:
        conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS pending_actions (
                id TEXT PRIMARY KEY,
                session_id TEXT,
                type TEXT NOT NULL,
                label TEXT NOT NULL,
                params_json TEXT NOT NULL,
                tier INTEGER NOT NULL DEFAULT 1,
                confirm_token TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'pending',
                created_at TEXT NOT NULL,
                expires_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS audit_log (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                ts TEXT NOT NULL,
                action_id TEXT,
                type TEXT NOT NULL,
                params_json TEXT,
                result TEXT,
                source TEXT,
                session_id TEXT,
                ok INTEGER NOT NULL DEFAULT 1
            );
            """
        )


_init()


def _now() -> datetime:
    return datetime.now(timezone.utc)


def enqueue(
    action_type: str,
    *,
    label: str | None = None,
    params: dict | None = None,
    session_id: str | None = None,
    tier: int = TIER_LIGHT,
    ttl_seconds: int = DEFAULT_TTL_SECONDS,
) -> dict[str, Any]:
    aid = str(uuid.uuid4())
    token = secrets.token_urlsafe(16)
    now = _now()
    expires = now + timedelta(seconds=ttl_seconds)
    entry = {
        "id": aid,
        "session_id": session_id,
        "type": action_type,
        "label": label or action_type.replace("_", " ").title(),
        "params": params or {},
        "tier": tier,
        "confirm_token": token,
        "status": "pending",
        "created_at": now.isoformat(),
        "expires_at": expires.isoformat(),
        "requires_confirm": True,
    }
    with _DB_LOCK, _connect() as conn:
        conn.execute(
            """
            INSERT INTO pending_actions
            (id, session_id, type, label, params_json, tier, confirm_token, status, created_at, expires_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                aid,
                session_id,
                action_type,
                entry["label"],
                json.dumps(entry["params"]),
                tier,
                token,
                "pending",
                entry["created_at"],
                entry["expires_at"],
            ),
        )
    return entry


def get_pending(action_id: str) -> dict[str, Any] | None:
    with _DB_LOCK, _connect() as conn:
        row = conn.execute("SELECT * FROM pending_actions WHERE id = ?", (action_id,)).fetchone()
    if not row:
        return None
    return _row_to_action(row)


def list_pending(session_id: str | None = None, limit: int = 20) -> list[dict[str, Any]]:
    _expire_stale()
    with _DB_LOCK, _connect() as conn:
        if session_id:
            rows = conn.execute(
                """
                SELECT * FROM pending_actions
                WHERE status = 'pending' AND session_id = ?
                ORDER BY created_at DESC LIMIT ?
                """,
                (session_id, limit),
            ).fetchall()
        else:
            rows = conn.execute(
                """
                SELECT * FROM pending_actions
                WHERE status = 'pending'
                ORDER BY created_at DESC LIMIT ?
                """,
                (limit,),
            ).fetchall()
    return [_row_to_action(r) for r in rows]


def _row_to_action(row: sqlite3.Row) -> dict[str, Any]:
    return {
        "id": row["id"],
        "session_id": row["session_id"],
        "type": row["type"],
        "label": row["label"],
        "params": json.loads(row["params_json"] or "{}"),
        "tier": row["tier"],
        "confirm_token": row["confirm_token"],
        "status": row["status"],
        "created_at": row["created_at"],
        "expires_at": row["expires_at"],
        "requires_confirm": True,
    }


def _expire_stale() -> None:
    now = _now().isoformat()
    with _DB_LOCK, _connect() as conn:
        conn.execute(
            "UPDATE pending_actions SET status = 'expired' WHERE status = 'pending' AND expires_at < ?",
            (now,),
        )


def consume_for_confirm(
    action_id: str,
    *,
    confirm_token: str | None = None,
    session_id: str | None = None,
) -> tuple[dict[str, Any] | None, str | None]:
    """Validate and mark action confirmed. Returns (action, error)."""
    _expire_stale()
    with _DB_LOCK, _connect() as conn:
        row = conn.execute("SELECT * FROM pending_actions WHERE id = ?", (action_id,)).fetchone()
        if not row:
            return None, "Unknown or expired action"
        if row["status"] != "pending":
            return None, f"Action already {row['status']}"
        if row["expires_at"] < _now().isoformat():
            conn.execute(
                "UPDATE pending_actions SET status = 'expired' WHERE id = ?",
                (action_id,),
            )
            return None, "Action expired"
        if confirm_token and row["confirm_token"] != confirm_token:
            return None, "Invalid confirm token"
        if session_id and row["session_id"] and row["session_id"] != session_id:
            return None, "Session mismatch"
        conn.execute(
            "UPDATE pending_actions SET status = 'confirmed' WHERE id = ?",
            (action_id,),
        )
    return _row_to_action(row), None


def audit(
    action_type: str,
    *,
    action_id: str | None = None,
    params: dict | None = None,
    result: str = "",
    source: str = "chat",
    session_id: str | None = None,
    ok: bool = True,
) -> None:
    with _DB_LOCK, _connect() as conn:
        conn.execute(
            """
            INSERT INTO audit_log (ts, action_id, type, params_json, result, source, session_id, ok)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                _now().isoformat(),
                action_id,
                action_type,
                json.dumps(params or {}),
                result,
                source,
                session_id,
                1 if ok else 0,
            ),
        )


def list_audit(limit: int = 50) -> list[dict[str, Any]]:
    with _DB_LOCK, _connect() as conn:
        rows = conn.execute(
            "SELECT * FROM audit_log ORDER BY id DESC LIMIT ?",
            (limit,),
        ).fetchall()
    return [dict(r) for r in rows]
