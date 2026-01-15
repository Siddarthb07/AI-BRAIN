import json
import threading
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List

from app.services.config import get_settings

_LOCK = threading.Lock()


def _file_path(name: str) -> Path:
    settings = get_settings()
    return settings.data_dir / name


def _read_json(path: Path, default: Any) -> Any:
    if not path.exists():
        return default
    with path.open("r", encoding="utf-8") as f:
        return json.load(f)


def _write_json(path: Path, payload: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as f:
        json.dump(payload, f, indent=2, ensure_ascii=False)


def get_user_context() -> Dict[str, Any]:
    default = {
        "daily_goals": [],
        "active_project": "",
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    with _LOCK:
        return _read_json(_file_path("context.json"), default)


def set_user_context(daily_goals: List[str], active_project: str) -> Dict[str, Any]:
    payload = {
        "daily_goals": daily_goals,
        "active_project": active_project,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    with _LOCK:
        _write_json(_file_path("context.json"), payload)
    return payload


def append_insights(items: List[Dict[str, Any]]) -> None:
    with _LOCK:
        path = _file_path("insights.json")
        existing = _read_json(path, [])
        existing.extend(items)
        _write_json(path, existing)


def list_insights(limit: int = 250) -> List[Dict[str, Any]]:
    with _LOCK:
        items = _read_json(_file_path("insights.json"), [])
    items = sorted(items, key=lambda x: x.get("timestamp", ""), reverse=True)
    return items[:limit]


def append_chat_message(role: str, content: str) -> None:
    with _LOCK:
        path = _file_path("chat_history.json")
        chat = _read_json(path, [])
        chat.append(
            {
                "role": role,
                "content": content,
                "timestamp": datetime.now(timezone.utc).isoformat(),
            }
        )
        _write_json(path, chat[-100:])


def get_chat_history(limit: int = 12) -> List[Dict[str, Any]]:
    with _LOCK:
        chat = _read_json(_file_path("chat_history.json"), [])
    return chat[-limit:]


def get_ingested_users() -> List[str]:
    with _LOCK:
        users = _read_json(_file_path("ingested_users.json"), [])
    return [str(u).lower() for u in users]


def add_ingested_user(username: str) -> None:
    username = username.strip().lower()
    if not username:
        return
    with _LOCK:
        path = _file_path("ingested_users.json")
        users = _read_json(path, [])
        if username not in users:
            users.append(username)
        _write_json(path, users)
