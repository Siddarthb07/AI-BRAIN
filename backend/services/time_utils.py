from datetime import datetime
from zoneinfo import ZoneInfo

IST = ZoneInfo("Asia/Kolkata")


def now_ist() -> datetime:
    return datetime.now(IST)


def format_ist_brief_label(value: datetime | None = None) -> str:
    current = value.astimezone(IST) if value else now_ist()
    return current.strftime("%A, %B %d %Y %I:%M %p IST")


def format_ist_event_time(value: datetime) -> str:
    return value.astimezone(IST).strftime("%a %b %d %I:%M %p IST")


def format_ist_all_day(value: datetime) -> str:
    return value.strftime("%a %b %d (all day)")
