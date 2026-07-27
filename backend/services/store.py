import json
from pathlib import Path
from typing import Dict, List, Any

from services.secrets import decrypt_mapping, encrypt_mapping

DATA_DIR = Path(__file__).parent.parent / "data"
DATA_DIR.mkdir(exist_ok=True)
STATE_FILE = DATA_DIR / "state.json"

def _default_google_calendar_state() -> Dict[str, Any]:
    return {
        "connected": False,
        "calendar_id": "primary",
        "calendar_label": "Primary calendar",
        "tokens": None,
        "events": [],
        "last_synced_at": None,
        "last_error": None,
        "oauth_state": None,
    }

_state: Dict[str, Any] = {
    "context": {
        "daily_goals": ["Advance active project", "Clear blockers", "Ship one measurable win"],
        "active_project": "unset",
        "focus_time": "09:00-12:00",
        "energy_level": "high"
    },
    "repos": [],
    "hn_stories": [],
    "brief_cache": None,
    "knowledge_count": 0,
    "google_calendar": _default_google_calendar_state(),
}

def _load():
    global _state
    if STATE_FILE.exists():
        try:
            saved = json.loads(STATE_FILE.read_text(encoding="utf-8"))
            _state.update(saved)
        except Exception:
            pass
    calendar = {
        **_default_google_calendar_state(),
        **(_state.get("google_calendar") or {}),
    }
    tokens = calendar.get("tokens")
    if tokens:
        try:
            calendar["tokens"] = decrypt_mapping(tokens)
        except Exception as exc:
            print(f"[store] Token decrypt failed: {exc}")
            calendar["tokens"] = None
            calendar["connected"] = False
            calendar["last_error"] = str(exc)
    _state["google_calendar"] = calendar

def _save():
    try:
        to_disk = dict(_state)
        calendar = dict(to_disk.get("google_calendar") or {})
        if calendar.get("tokens"):
            calendar["tokens"] = encrypt_mapping(calendar["tokens"])
        to_disk["google_calendar"] = calendar
        STATE_FILE.write_text(json.dumps(to_disk, indent=2, default=str), encoding="utf-8")
    except Exception:
        pass

_load()

def get_context() -> Dict:
    return _state.get("context", {})

def set_context(ctx: Dict):
    _state["context"] = {**_state.get("context", {}), **ctx}
    _save()

def get_repos() -> List[Dict]:
    return _state.get("repos", [])

def set_repos(repos: List[Dict]):
    """Replace/update repo list while preserving enrichment from deep ingest."""
    existing_by_name = {r.get("name"): r for r in _state.get("repos", []) if r.get("name")}
    merged: List[Dict] = []
    keep_keys = (
        "patterns",
        "file_count",
        "languages",
        "entry_points",
        "key_imports",
        "readme_excerpt",
        "structure_summary",
    )
    for repo in repos or []:
        name = repo.get("name")
        if not name:
            continue
        prev = existing_by_name.get(name) or {}
        row = dict(prev)
        row.update({k: v for k, v in repo.items() if v is not None and v != "" and v != []})
        for key in keep_keys:
            if not row.get(key) and prev.get(key):
                row[key] = prev[key]
        merged.append(row)
    _state["repos"] = merged
    _save()

def add_repo(repo: Dict):
    repos = _state.get("repos", [])
    repo_name = repo.get("name")
    if not repo_name:
        return

    for index, existing in enumerate(repos):
        if existing.get("name") == repo_name:
            merged = dict(existing)
            for key, value in repo.items():
                if value is None:
                    continue
                if isinstance(value, str) and not value.strip():
                    continue
                if isinstance(value, (list, dict)) and not value:
                    continue
                merged[key] = value
            repos[index] = merged
            _state["repos"] = repos
            _save()
            return

    repos.append(repo)
    _state["repos"] = repos
    _save()

def get_hn_stories() -> List[Dict]:
    return _state.get("hn_stories", [])

def set_hn_stories(stories: List[Dict]):
    _state["hn_stories"] = stories
    _save()

def get_brief_cache() -> Any:
    return _state.get("brief_cache")

def set_brief_cache(brief: Any):
    _state["brief_cache"] = brief
    _save()

def get_google_calendar() -> Dict[str, Any]:
    return {
        **_default_google_calendar_state(),
        **(_state.get("google_calendar") or {}),
    }

def set_google_calendar(data: Dict[str, Any]):
    _state["google_calendar"] = {
        **get_google_calendar(),
        **data,
    }
    _save()

def clear_google_calendar():
    _state["google_calendar"] = _default_google_calendar_state()
    _save()

def increment_knowledge():
    _state["knowledge_count"] = _state.get("knowledge_count", 0) + 1
    _save()

def get_stats() -> Dict:
    return {
        "repos": len(_state.get("repos", [])),
        "hn_stories": len(_state.get("hn_stories", [])),
        "knowledge_docs": _state.get("knowledge_count", 0),
        "active_project": _state.get("context", {}).get("active_project", "None"),
        "calendar_events": len(get_google_calendar().get("events", [])),
    }
