"""Durable uptime checks and incident history for monitored infrastructure."""

from __future__ import annotations

import json
import sqlite3
import threading
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

DB_PATH = Path(__file__).parent.parent / "data" / "jarvis.db"
_LOCK = threading.RLock()


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
            CREATE TABLE IF NOT EXISTS uptime_checks (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                target_type TEXT NOT NULL,
                target_id TEXT NOT NULL,
                url TEXT,
                status TEXT NOT NULL,
                status_code INTEGER,
                latency_ms REAL,
                checked_at TEXT NOT NULL,
                detail_json TEXT NOT NULL DEFAULT '{}'
            );
            CREATE INDEX IF NOT EXISTS idx_uptime_target_time
              ON uptime_checks(target_type, target_id, checked_at);

            CREATE TABLE IF NOT EXISTS uptime_incidents (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                target_type TEXT NOT NULL,
                target_id TEXT NOT NULL,
                started_at TEXT NOT NULL,
                ended_at TEXT,
                reason TEXT,
                last_status_code INTEGER
            );
            CREATE INDEX IF NOT EXISTS idx_incident_target_time
              ON uptime_incidents(target_type, target_id, started_at);
            """
        )


_init()


def _now() -> datetime:
    return datetime.now(timezone.utc)


def record_check(
    target_type: str,
    target_id: str,
    *,
    url: str | None,
    status: str,
    status_code: int | None = None,
    latency_ms: float | None = None,
    detail: dict[str, Any] | None = None,
    checked_at: str | None = None,
) -> dict[str, Any]:
    """Record a check and open/close an incident when status crosses down/up."""
    ts = checked_at or _now().isoformat()
    normalized = status if status in {"up", "down", "degraded", "unknown"} else "unknown"
    transition = None
    with _LOCK, _connect() as conn:
        previous = conn.execute(
            """
            SELECT status FROM uptime_checks
            WHERE target_type=? AND target_id=?
            ORDER BY checked_at DESC LIMIT 1
            """,
            (target_type, target_id),
        ).fetchone()
        conn.execute(
            """
            INSERT INTO uptime_checks
              (target_type, target_id, url, status, status_code, latency_ms, checked_at, detail_json)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                target_type,
                target_id,
                url,
                normalized,
                status_code,
                latency_ms,
                ts,
                json.dumps(detail or {}, default=str),
            ),
        )
        was_down = previous and previous["status"] == "down"
        is_down = normalized == "down"
        if is_down and not was_down:
            conn.execute(
                """
                INSERT INTO uptime_incidents
                  (target_type, target_id, started_at, reason, last_status_code)
                VALUES (?, ?, ?, ?, ?)
                """,
                (target_type, target_id, ts, (detail or {}).get("error"), status_code),
            )
            transition = "down"
        elif not is_down and was_down:
            conn.execute(
                """
                UPDATE uptime_incidents SET ended_at=?
                WHERE id=(
                  SELECT id FROM uptime_incidents
                  WHERE target_type=? AND target_id=? AND ended_at IS NULL
                  ORDER BY started_at DESC LIMIT 1
                )
                """,
                (ts, target_type, target_id),
            )
            transition = "recovered"
    return {"checked_at": ts, "status": normalized, "transition": transition}


def latest(target_type: str, target_id: str) -> dict[str, Any] | None:
    with _LOCK, _connect() as conn:
        row = conn.execute(
            """
            SELECT * FROM uptime_checks
            WHERE target_type=? AND target_id=?
            ORDER BY checked_at DESC LIMIT 1
            """,
            (target_type, target_id),
        ).fetchone()
    if not row:
        return None
    item = dict(row)
    item["detail"] = json.loads(item.pop("detail_json") or "{}")
    return item


def history(target_type: str, target_id: str, hours: int = 24, limit: int = 500) -> list[dict[str, Any]]:
    cutoff = (_now() - timedelta(hours=max(1, min(hours, 24 * 30)))).isoformat()
    with _LOCK, _connect() as conn:
        rows = conn.execute(
            """
            SELECT status, status_code, latency_ms, checked_at
            FROM uptime_checks
            WHERE target_type=? AND target_id=? AND checked_at>=?
            ORDER BY checked_at ASC LIMIT ?
            """,
            (target_type, target_id, cutoff, max(1, min(limit, 2000))),
        ).fetchall()
    return [dict(row) for row in rows]


def incidents(target_type: str, target_id: str, hours: int = 168, limit: int = 50) -> list[dict[str, Any]]:
    cutoff = (_now() - timedelta(hours=max(1, min(hours, 24 * 90)))).isoformat()
    with _LOCK, _connect() as conn:
        rows = conn.execute(
            """
            SELECT * FROM uptime_incidents
            WHERE target_type=? AND target_id=? AND started_at>=?
            ORDER BY started_at DESC LIMIT ?
            """,
            (target_type, target_id, cutoff, max(1, min(limit, 200))),
        ).fetchall()
    return [dict(row) for row in rows]


def availability(target_type: str, target_id: str, hours: int) -> dict[str, Any]:
    """Observed-check availability; unknown/unobserved time is never counted as down."""
    checks = history(target_type, target_id, hours=hours, limit=2000)
    observed = len(checks)
    up = sum(1 for item in checks if item["status"] in {"up", "degraded"})
    down = sum(1 for item in checks if item["status"] == "down")
    pct = round((up / observed) * 100, 3) if observed else None
    return {"hours": hours, "uptime_pct": pct, "observed_checks": observed, "down_checks": down}


def _parse_ts(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None


def format_duration_seconds(seconds: int | None) -> str | None:
    if seconds is None:
        return None
    seconds = max(0, int(seconds))
    days, rem = divmod(seconds, 86400)
    hours, rem = divmod(rem, 3600)
    minutes, secs = divmod(rem, 60)
    if days:
        return f"{days}d {hours}h"
    if hours:
        return f"{hours}h {minutes}m"
    return f"{minutes}m {secs}s"


def current_streak(target_type: str, target_id: str) -> dict[str, Any]:
    """Continuous up/down streak for the latest observed state."""
    with _LOCK, _connect() as conn:
        latest_row = conn.execute(
            """
            SELECT status, checked_at FROM uptime_checks
            WHERE target_type=? AND target_id=?
            ORDER BY checked_at DESC LIMIT 1
            """,
            (target_type, target_id),
        ).fetchone()
        if not latest_row:
            return {
                "state": "unknown",
                "since": None,
                "seconds": None,
                "human": None,
                "label": "NO CHECKS YET",
            }
        status = latest_row["status"]
        if status == "down":
            open_incident = conn.execute(
                """
                SELECT started_at FROM uptime_incidents
                WHERE target_type=? AND target_id=? AND ended_at IS NULL
                ORDER BY started_at DESC LIMIT 1
                """,
                (target_type, target_id),
            ).fetchone()
            since = (open_incident["started_at"] if open_incident else latest_row["checked_at"])
            state = "down"
            label_prefix = "DOWN FOR"
        else:
            last_recovery = conn.execute(
                """
                SELECT ended_at FROM uptime_incidents
                WHERE target_type=? AND target_id=? AND ended_at IS NOT NULL
                ORDER BY ended_at DESC LIMIT 1
                """,
                (target_type, target_id),
            ).fetchone()
            first_up = conn.execute(
                """
                SELECT checked_at FROM uptime_checks
                WHERE target_type=? AND target_id=? AND status IN ('up', 'degraded')
                ORDER BY checked_at ASC LIMIT 1
                """,
                (target_type, target_id),
            ).fetchone()
            since = (last_recovery["ended_at"] if last_recovery else None) or (
                first_up["checked_at"] if first_up else latest_row["checked_at"]
            )
            state = "up" if status in {"up", "degraded"} else "unknown"
            label_prefix = "UP FOR" if state == "up" else "OBSERVING"
    start = _parse_ts(since)
    seconds = int((_now() - start).total_seconds()) if start else None
    human = format_duration_seconds(seconds)
    return {
        "state": state,
        "since": since,
        "seconds": seconds,
        "human": human,
        "label": f"{label_prefix} {human}" if human else label_prefix,
    }


def known_targets(target_type: str, limit: int = 50) -> list[dict[str, Any]]:
    """Distinct monitored targets with latest URL from check history."""
    with _LOCK, _connect() as conn:
        rows = conn.execute(
            """
            SELECT target_id, url, MAX(checked_at) AS last_checked
            FROM uptime_checks
            WHERE target_type=? AND url IS NOT NULL AND TRIM(url) != ''
            GROUP BY target_id
            ORDER BY last_checked DESC
            LIMIT ?
            """,
            (target_type, max(1, limit)),
        ).fetchall()
    return [
        {"id": row["target_id"], "url": row["url"], "last_checked": row["last_checked"]}
        for row in rows
    ]


def prune(retention_days: int = 30) -> int:
    cutoff = (_now() - timedelta(days=max(1, retention_days))).isoformat()
    with _LOCK, _connect() as conn:
        cur = conn.execute("DELETE FROM uptime_checks WHERE checked_at < ?", (cutoff,))
        return cur.rowcount
