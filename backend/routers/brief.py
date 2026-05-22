import json
import re

from fastapi import APIRouter

from services import google_calendar, hn as hn_service, llm, store, time_utils

router = APIRouter()


def _today_label() -> str:
    return time_utils.format_ist_brief_label()


FALLBACK_BRIEF = {
    "date": _today_label(),
    "greeting": "Good morning. Systems are stable and ready.",
    "priority_actions": [
        "Ship your highest-impact task before lunch",
        "Review open pull requests and close stale issues",
        "Protect one focused learning block today",
        "Update docs before you context-switch",
    ],
    "insights": [
        "Small finished slices beat big half-finished plans.",
        "Your local-first stack compounds because iteration stays fast.",
        "The clearest next step usually matters more than the best long-term plan.",
    ],
    "hn_picks": [
        "AI tooling keeps accelerating, so weekly stack pruning matters.",
        "Developer workflows are shifting toward local-first and hybrid AI setups.",
    ],
    "learning_goals": [
        "RAG architecture patterns",
        "Vector DB optimization",
        "FastAPI async patterns",
    ],
    "voice_summary": "Good morning. Focus on your highest-impact task first, review open pull requests, and keep one learning block protected. Ship something real today.",
    "calendar_connected": False,
    "calendar_events": [],
    "hn_stories": [],
    "repos_count": 0,
    "active_project": "JARVIS AI Brain",
}


def _apply_calendar_fallback(brief_data, calendar_events):
    if not calendar_events:
        return

    next_event = calendar_events[0]
    when = google_calendar.format_event_when(next_event)
    calendar_action = f"Prep for {next_event.get('summary', 'your next event')} at {when}"
    existing_actions = [item for item in brief_data.get("priority_actions", []) if item != calendar_action]
    brief_data["priority_actions"] = [calendar_action] + existing_actions[:3]


@router.get("")
async def get_brief():
    ctx = store.get_context()
    repos = store.get_repos()
    stories = store.get_hn_stories()
    calendar_events = []
    calendar_connected = google_calendar.is_connected()

    if not stories:
        stories = await hn_service.fetch_top_stories(5)
        store.set_hn_stories(stories)

    if calendar_connected:
        try:
            calendar_events = await google_calendar.get_upcoming_events(force_refresh=False, max_results=5)
        except Exception as exc:
            print(f"[Brief] Calendar sync failed: {exc}")

    goals_str = ", ".join(ctx.get("daily_goals", ["Ship the MVP"]))
    active = ctx.get("active_project", "current project")
    hn_str = "\n".join(f"- {story['title']} ({story['score']} pts)" for story in stories[:3]) or "- No HN stories available"
    repo_str = ", ".join(repo["name"] for repo in repos[:5]) if repos else "No repositories indexed yet"
    calendar_str = google_calendar.events_to_context(calendar_events, limit=4) or "- No upcoming calendar events"

    prompt = f"""Generate a concise developer daily brief.
Active project: {active}
Today's goals: {goals_str}
Tracked repositories: {repo_str}
Upcoming Google Calendar events:
{calendar_str}
Top Hacker News signals:
{hn_str}

Return a JSON object with these exact keys:
- greeting: string (1 line, mention the day/time mood)
- priority_actions: array of 4 strings (concrete actions, plain text, no markdown)
- insights: array of 3 strings (sharp technical observations)
- hn_picks: array of 2 strings (why the HN items matter)
- learning_goals: array of 3 strings (what to learn today)
- voice_summary: string (spoken summary, about 50-70 words)

Only output valid JSON."""

    brief_data = dict(FALLBACK_BRIEF)
    brief_data["date"] = _today_label()

    try:
        response = await llm.chat_completion(prompt, system="You are JARVIS. Return only valid JSON.")
        clean = re.sub(r"```json|```", "", response).strip()
        parsed = json.loads(clean)
        brief_data.update(parsed)
        brief_data["date"] = _today_label()
    except Exception as exc:
        print(f"[Brief] LLM parse failed: {exc}")

    _apply_calendar_fallback(brief_data, calendar_events)

    brief_data["repos_count"] = len(repos)
    brief_data["active_project"] = active
    brief_data["hn_stories"] = [
        {
            "title": story["title"],
            "score": story["score"],
            "url": story.get("url", ""),
        }
        for story in stories[:5]
    ]
    brief_data["calendar_connected"] = calendar_connected
    brief_data["calendar_events"] = calendar_events

    store.set_brief_cache(brief_data)
    return brief_data


@router.get("/voice")
async def get_voice_brief():
    cached = store.get_brief_cache()
    if cached:
        return {"text": cached.get("voice_summary", FALLBACK_BRIEF["voice_summary"])}
    brief = await get_brief()
    return {"text": brief.get("voice_summary", FALLBACK_BRIEF["voice_summary"])}
