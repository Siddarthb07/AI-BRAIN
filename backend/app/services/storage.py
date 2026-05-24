import json
import threading
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List

from app.services.config import get_settings

_LOCK = threading.Lock()


def _file_path(name: str) -> Path:
    return get_settings().data_dir / name


def _read_json(path: Path, default: Any) -> Any:
    if not path.exists():
        return default
    with path.open("r", encoding="utf-8") as f:
        return json.load(f)


def _write_json(path: Path, payload: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as f:
        json.dump(payload, f, indent=2, ensure_ascii=False)


def get_context() -> Dict[str, Any]:
    default = {
        "daily_goals": [],
        "active_project": "",
        "focus_repos": [],
        "focus_topics": [],
        "learned_topics": [],
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    with _LOCK:
        return _read_json(_file_path("context.json"), default)


def set_context(
    daily_goals: List[str],
    active_project: str,
    focus_repos: List[str],
    focus_topics: List[str],
) -> Dict[str, Any]:
    learned = set((focus_topics or []))
    existing = get_context().get("learned_topics", [])
    for topic in existing:
        learned.add(topic)
    payload = {
        "daily_goals": daily_goals,
        "active_project": active_project,
        "focus_repos": focus_repos,
        "focus_topics": focus_topics,
        "learned_topics": sorted(learned),
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    with _LOCK:
        _write_json(_file_path("context.json"), payload)
    return payload


def append_learned_topics(topics: List[str]) -> None:
    if not topics:
        return
    with _LOCK:
        data = get_context()
        learned = set(data.get("learned_topics", []))
        for topic in topics:
            if topic:
                learned.add(topic)
        data["learned_topics"] = sorted(learned)
        data["updated_at"] = datetime.now(timezone.utc).isoformat()
        _write_json(_file_path("context.json"), data)


def append_insights(items: List[Dict[str, Any]]) -> None:
    with _LOCK:
        path = _file_path("insights.json")
        existing = _read_json(path, [])
        existing.extend(items)
        _write_json(path, existing)


def list_insights(limit: int = 500) -> List[Dict[str, Any]]:
    with _LOCK:
        items = _read_json(_file_path("insights.json"), [])
    items = sorted(items, key=lambda x: x.get("timestamp", ""), reverse=True)
    return items[:limit]


def append_chat(role: str, content: str) -> None:
    with _LOCK:
        path = _file_path("chat.json")
        history = _read_json(path, [])
        history.append(
            {"role": role, "content": content, "timestamp": datetime.now(timezone.utc).isoformat()}
        )
        _write_json(path, history[-50:])


def get_chat(limit: int = 12) -> List[Dict[str, Any]]:
    with _LOCK:
        history = _read_json(_file_path("chat.json"), [])
    return history[-limit:]


def get_repo_cache() -> List[Dict[str, Any]]:
    with _LOCK:
        return _read_json(_file_path("repos.json"), [])


def set_repo_cache(repos: List[Dict[str, Any]]) -> None:
    with _LOCK:
        _write_json(_file_path("repos.json"), repos)


def upsert_repo(repo: Dict[str, Any]) -> None:
    if not repo:
        return
    with _LOCK:
        path = _file_path("repos.json")
        existing = _read_json(path, [])
        key = repo.get("full_name") or repo.get("name")
        if not key:
            return
        updated = []
        replaced = False
        for item in existing:
            if item.get("full_name") == key or item.get("name") == key:
                updated.append(repo)
                replaced = True
            else:
                updated.append(item)
        if not replaced:
            updated.append(repo)
        _write_json(path, updated)


# Backwards compatibility

def get_user_context() -> Dict[str, Any]:
    return get_context()


def set_user_context(daily_goals: List[str], active_project: str) -> Dict[str, Any]:
    return set_context(daily_goals, active_project, [], [])


def append_chat_message(role: str, content: str) -> None:
    append_chat(role, content)


def get_chat_history(limit: int = 12) -> List[Dict[str, Any]]:
    return get_chat(limit)
