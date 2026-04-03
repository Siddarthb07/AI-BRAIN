from typing import Optional

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import RedirectResponse

from services import google_calendar, store

router = APIRouter()


@router.get("/google/status")
async def google_status():
    status = google_calendar.get_status_payload()
    if status["connected"]:
        try:
            events = await google_calendar.get_upcoming_events(force_refresh=False)
            status = google_calendar.get_status_payload()
            status["events"] = events
            status["upcoming_count"] = len(events)
        except Exception as exc:
            status["last_error"] = str(exc)
    return status


@router.get("/google/connect-url")
async def google_connect_url():
    try:
        return {"url": google_calendar.build_connect_url()}
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.get("/google/connect")
async def google_connect():
    try:
        return RedirectResponse(url=google_calendar.build_connect_url(), status_code=302)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.get("/google/callback")
async def google_callback(
    code: Optional[str] = None,
    state: Optional[str] = None,
    error: Optional[str] = None,
    error_description: Optional[str] = None,
):
    if error:
        message = error_description or error
        store.set_google_calendar({"connected": False, "oauth_state": None, "last_error": message})
        return RedirectResponse(url=google_calendar.build_frontend_redirect("error", message), status_code=302)

    try:
        if not code:
            raise RuntimeError("Google did not return an authorization code.")
        google_calendar.validate_state(state)
        await google_calendar.complete_oauth(code)
        await google_calendar.get_upcoming_events(force_refresh=True)
        return RedirectResponse(url=google_calendar.build_frontend_redirect("connected"), status_code=302)
    except Exception as exc:
        store.set_google_calendar({"connected": False, "oauth_state": None, "last_error": str(exc)})
        return RedirectResponse(url=google_calendar.build_frontend_redirect("error", str(exc)), status_code=302)


@router.get("/google/events")
async def google_events(
    max_results: int = Query(8, ge=1, le=20),
    force_refresh: bool = False,
):
    try:
        events = await google_calendar.get_upcoming_events(force_refresh=force_refresh, max_results=max_results)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    return {
        "events": events,
        "count": len(events),
        "calendar": google_calendar.get_status_payload(),
    }


@router.post("/google/sync")
async def google_sync(max_results: int = Query(8, ge=1, le=20)):
    try:
        events = await google_calendar.get_upcoming_events(force_refresh=True, max_results=max_results)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    status = google_calendar.get_status_payload()
    status["events"] = events
    status["upcoming_count"] = len(events)
    return status


@router.delete("/google/disconnect")
async def google_disconnect():
    google_calendar.disconnect()
    return {"status": "disconnected"}
