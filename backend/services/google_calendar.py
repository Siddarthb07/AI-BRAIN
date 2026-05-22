import os
import secrets
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional
from urllib.parse import quote, urlencode

import httpx

from services import store, time_utils

AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
TOKEN_URL = "https://oauth2.googleapis.com/token"
CALENDAR_EVENTS_URL = "https://www.googleapis.com/calendar/v3/calendars/{calendar_id}/events"
CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar.readonly"

GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID", "").strip()
GOOGLE_CLIENT_SECRET = os.getenv("GOOGLE_CLIENT_SECRET", "").strip()
GOOGLE_REDIRECT_URI = os.getenv("GOOGLE_REDIRECT_URI", "http://localhost:8001/calendar/google/callback").strip()
GOOGLE_FRONTEND_URL = (os.getenv("GOOGLE_FRONTEND_URL", "http://localhost:5050").strip() or "http://localhost:5050").rstrip("/")
GOOGLE_CALENDAR_ID = os.getenv("GOOGLE_CALENDAR_ID", "primary").strip() or "primary"
GOOGLE_CALENDAR_SYNC_TTL = max(int(os.getenv("GOOGLE_CALENDAR_SYNC_TTL", "300") or "300"), 30)
GOOGLE_CALENDAR_MAX_EVENTS = min(max(int(os.getenv("GOOGLE_CALENDAR_MAX_EVENTS", "8") or "8"), 1), 20)


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _parse_datetime(value: Optional[str]) -> Optional[datetime]:
    if not value:
        return None
    try:
        normalized = value.replace("Z", "+00:00")
        return datetime.fromisoformat(normalized)
    except ValueError:
        return None


def _format_calendar_label(calendar_id: str) -> str:
    return "Primary calendar" if calendar_id == "primary" else calendar_id


def _normalize_tokens(payload: Dict[str, Any], existing: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    existing = existing or {}
    expires_in = int(payload.get("expires_in") or 3600)
    refresh_token = payload.get("refresh_token") or existing.get("refresh_token")
    return {
        "access_token": payload.get("access_token") or existing.get("access_token"),
        "refresh_token": refresh_token,
        "token_type": payload.get("token_type") or existing.get("token_type") or "Bearer",
        "scope": payload.get("scope") or existing.get("scope") or CALENDAR_SCOPE,
        "expires_at": (_utc_now() + timedelta(seconds=max(expires_in - 60, 60))).isoformat(),
    }


def _token_expired(tokens: Optional[Dict[str, Any]]) -> bool:
    if not tokens or not tokens.get("access_token"):
        return True
    expires_at = _parse_datetime(tokens.get("expires_at"))
    if not expires_at:
        return True
    return expires_at <= _utc_now()


def _cache_is_fresh(last_synced_at: Optional[str]) -> bool:
    synced_at = _parse_datetime(last_synced_at)
    if not synced_at:
        return False
    return (_utc_now() - synced_at).total_seconds() < GOOGLE_CALENDAR_SYNC_TTL


def is_configured() -> bool:
    return bool(GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET and GOOGLE_REDIRECT_URI)


def is_connected() -> bool:
    calendar_state = store.get_google_calendar()
    return bool(calendar_state.get("connected") and calendar_state.get("tokens"))


def get_status_payload() -> Dict[str, Any]:
    calendar_state = store.get_google_calendar()
    events = calendar_state.get("events") or []
    return {
        "configured": is_configured(),
        "connected": is_connected(),
        "calendar_id": calendar_state.get("calendar_id") or GOOGLE_CALENDAR_ID,
        "calendar_label": calendar_state.get("calendar_label") or _format_calendar_label(calendar_state.get("calendar_id") or GOOGLE_CALENDAR_ID),
        "redirect_uri": GOOGLE_REDIRECT_URI,
        "frontend_url": GOOGLE_FRONTEND_URL,
        "last_synced_at": calendar_state.get("last_synced_at"),
        "last_error": calendar_state.get("last_error"),
        "upcoming_count": len(events),
        "events": events,
    }


def build_frontend_redirect(status: str, error_message: str = "") -> str:
    params = {"calendar_status": status}
    if error_message:
        params["calendar_error"] = error_message[:180]
    separator = "&" if "?" in GOOGLE_FRONTEND_URL else "?"
    return f"{GOOGLE_FRONTEND_URL}{separator}{urlencode(params)}"


def build_connect_url() -> str:
    if not is_configured():
        raise RuntimeError("Google Calendar is not configured. Set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and GOOGLE_REDIRECT_URI first.")

    oauth_state = secrets.token_urlsafe(24)
    store.set_google_calendar(
        {
            "oauth_state": oauth_state,
            "last_error": None,
            "calendar_id": store.get_google_calendar().get("calendar_id") or GOOGLE_CALENDAR_ID,
            "calendar_label": _format_calendar_label(store.get_google_calendar().get("calendar_id") or GOOGLE_CALENDAR_ID),
        }
    )
    params = {
        "client_id": GOOGLE_CLIENT_ID,
        "redirect_uri": GOOGLE_REDIRECT_URI,
        "response_type": "code",
        "scope": CALENDAR_SCOPE,
        "access_type": "offline",
        "prompt": "consent",
        "include_granted_scopes": "true",
        "state": oauth_state,
    }
    return f"{AUTH_URL}?{urlencode(params)}"


def validate_state(state: Optional[str]):
    stored_state = store.get_google_calendar().get("oauth_state")
    if not state or not stored_state or state != stored_state:
        raise RuntimeError("Google Calendar OAuth state mismatch. Please reconnect from the app and try again.")


async def _request_token(data: Dict[str, str]) -> Dict[str, Any]:
    async with httpx.AsyncClient(timeout=20.0) as client:
        response = await client.post(TOKEN_URL, data=data)

    if response.status_code != 200:
        try:
            detail = response.json().get("error_description") or response.json().get("error") or response.text
        except Exception:
            detail = response.text
        raise RuntimeError(f"Google token exchange failed: {detail}")

    return response.json()


async def complete_oauth(code: str) -> Dict[str, Any]:
    existing_tokens = (store.get_google_calendar().get("tokens") or {})
    payload = await _request_token(
        {
            "code": code,
            "client_id": GOOGLE_CLIENT_ID,
            "client_secret": GOOGLE_CLIENT_SECRET,
            "redirect_uri": GOOGLE_REDIRECT_URI,
            "grant_type": "authorization_code",
        }
    )
    tokens = _normalize_tokens(payload, existing_tokens)
    store.set_google_calendar(
        {
            "connected": True,
            "tokens": tokens,
            "oauth_state": None,
            "last_error": None,
            "calendar_id": store.get_google_calendar().get("calendar_id") or GOOGLE_CALENDAR_ID,
            "calendar_label": _format_calendar_label(store.get_google_calendar().get("calendar_id") or GOOGLE_CALENDAR_ID),
        }
    )
    return tokens


async def _refresh_tokens(tokens: Dict[str, Any]) -> Dict[str, Any]:
    refresh_token = tokens.get("refresh_token")
    if not refresh_token:
        raise RuntimeError("Google Calendar session expired and no refresh token is available. Reconnect the calendar in the app.")

    payload = await _request_token(
        {
            "client_id": GOOGLE_CLIENT_ID,
            "client_secret": GOOGLE_CLIENT_SECRET,
            "refresh_token": refresh_token,
            "grant_type": "refresh_token",
        }
    )
    refreshed = _normalize_tokens(payload, tokens)
    store.set_google_calendar({"connected": True, "tokens": refreshed, "last_error": None})
    return refreshed


async def _ensure_tokens(force_refresh: bool = False) -> Dict[str, Any]:
    calendar_state = store.get_google_calendar()
    tokens = calendar_state.get("tokens") or {}
    if not tokens:
        raise RuntimeError("Google Calendar is not connected yet.")

    if force_refresh or _token_expired(tokens):
        try:
            tokens = await _refresh_tokens(tokens)
        except Exception as exc:
            store.set_google_calendar({"connected": False, "last_error": str(exc)})
            raise

    return tokens


async def _request_events(access_token: str, calendar_id: str, max_results: int) -> httpx.Response:
    url = CALENDAR_EVENTS_URL.format(calendar_id=quote(calendar_id, safe=""))
    params = {
        "timeMin": _utc_now().replace(microsecond=0).isoformat().replace("+00:00", "Z"),
        "singleEvents": "true",
        "orderBy": "startTime",
        "maxResults": max_results,
    }
    headers = {"Authorization": f"Bearer {access_token}"}
    async with httpx.AsyncClient(timeout=20.0) as client:
        return await client.get(url, params=params, headers=headers)


def _normalize_event(item: Dict[str, Any]) -> Dict[str, Any]:
    start_data = item.get("start") or {}
    end_data = item.get("end") or {}
    all_day = "date" in start_data
    return {
        "id": item.get("id"),
        "summary": item.get("summary") or "Untitled event",
        "description": item.get("description") or "",
        "location": item.get("location") or "",
        "status": item.get("status") or "confirmed",
        "html_link": item.get("htmlLink") or "",
        "start": start_data.get("dateTime") or start_data.get("date") or "",
        "end": end_data.get("dateTime") or end_data.get("date") or "",
        "all_day": all_day,
    }


async def get_upcoming_events(force_refresh: bool = False, max_results: Optional[int] = None) -> List[Dict[str, Any]]:
    max_results = min(max(max_results or GOOGLE_CALENDAR_MAX_EVENTS, 1), 20)
    calendar_state = store.get_google_calendar()
    calendar_id = calendar_state.get("calendar_id") or GOOGLE_CALENDAR_ID
    cached_events = calendar_state.get("events") or []

    if not force_refresh and _cache_is_fresh(calendar_state.get("last_synced_at")):
        return cached_events[:max_results]

    tokens = await _ensure_tokens(force_refresh=False)
    access_token = tokens.get("access_token")
    if not access_token:
        raise RuntimeError("Google Calendar access token is missing. Reconnect the calendar in the app.")

    response = await _request_events(access_token, calendar_id, max_results)
    if response.status_code == 401:
        tokens = await _ensure_tokens(force_refresh=True)
        response = await _request_events(tokens.get("access_token", ""), calendar_id, max_results)

    if response.status_code != 200:
        try:
            detail = response.json().get("error", {}).get("message") or response.text
        except Exception:
            detail = response.text
        message = f"Google Calendar sync failed: {detail}"
        store.set_google_calendar({"last_error": message})
        raise RuntimeError(message)

    payload = response.json()
    events = [_normalize_event(item) for item in payload.get("items", [])]
    store.set_google_calendar(
        {
            "connected": True,
            "events": events,
            "last_synced_at": _utc_now().isoformat(),
            "last_error": None,
            "calendar_label": payload.get("summary") or _format_calendar_label(calendar_id),
            "calendar_id": calendar_id,
        }
    )
    return events


def get_cached_events(max_results: Optional[int] = None) -> List[Dict[str, Any]]:
    events = store.get_google_calendar().get("events") or []
    if max_results is None:
        return events
    return events[:max_results]


def disconnect():
    store.clear_google_calendar()


def format_event_when(event: Dict[str, Any]) -> str:
    start = event.get("start") or ""
    if not start:
        return "time pending"

    if event.get("all_day"):
        try:
            dt = datetime.fromisoformat(start)
            return time_utils.format_ist_all_day(dt)
        except ValueError:
            return f"{start} (all day)"

    parsed = _parse_datetime(start)
    if not parsed:
        return start
    return time_utils.format_ist_event_time(parsed)


def events_to_context(events: List[Dict[str, Any]], limit: int = 5) -> str:
    if not events:
        return ""

    lines = []
    for event in events[:limit]:
        lines.append(f"- {format_event_when(event)}: {event.get('summary', 'Untitled event')}")
    return "\n".join(lines)
