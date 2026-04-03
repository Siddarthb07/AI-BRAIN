import json
from pathlib import Path
from typing import Dict, List, Any

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
        "daily_goals": ["Ship the MVP", "Review open issues", "Write documentation"],
        "active_project": "JARVIS AI Brain",
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
            saved = json.loads(STATE_FILE.read_text())
            _state.update(saved)
        except:
            pass
    _state["google_calendar"] = {
        **_default_google_calendar_state(),
        **(_state.get("google_calendar") or {}),
    }

def _save():
    try:
        STATE_FILE.write_text(json.dumps(_state, indent=2, default=str))
    except:
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
    _state["repos"] = repos
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
