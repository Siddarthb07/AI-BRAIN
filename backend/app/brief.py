from __future__ import annotations

from typing import Dict, List

from app.services.storage import get_context, list_insights
from app.services.vault import save_markdown


def _insights_to_markdown(context: Dict, items: List[Dict]) -> str:
    lines = ["# Daily Brief", ""]
    active = context.get("active_project", "") or "your project"
    lines.append(f"Active project: **{active}**")
    lines.append("")
    lines.append("## Priority actions")
    for item in items:
        action = item.get("action") or item.get("signal", "")
        lines.append(f"- [ ] {action}")
    lines.append("")
    lines.append("## Signals")
    for item in items:
        lines.append(f"- **{item.get('signal', '')}** — {item.get('why_it_matters', '')}")
    return "\n".join(lines)


def generate_brief() -> Dict[str, List[Dict]]:
    context = get_context()
    insights = list_insights(limit=20)
    if not insights:
        items = [
            {
                "signal": "Sync your vault",
                "why_it_matters": "JARVIS needs indexed notes to give useful briefs",
                "action": "Run vault sync and add notes to JARVIS/",
                "effort": "15 min",
                "priority": "HIGH",
            }
        ]
    else:
        active = context.get("active_project", "") or "your project"
        focus_repos = context.get("focus_repos", [])
        focus_topics = context.get("focus_topics", [])
        items = []
        for repo in focus_repos[:3]:
            items.append(
                {
                    "signal": f"Focus repo: {repo}",
                    "why_it_matters": f"Chosen for {active}.",
                    "action": "Review recent commits and capture one improvement.",
                    "effort": "45 min",
                    "priority": "HIGH",
                }
            )
        for topic in focus_topics[:3]:
            items.append(
                {
                    "signal": f"Learning topic: {topic}",
                    "why_it_matters": f"Aligned with {active}.",
                    "action": "Summarize 3 takeaways from one resource.",
                    "effort": "30-60 min",
                    "priority": "HIGH",
                }
            )
        for item in insights[:5]:
            items.append(
                {
                    "signal": item.get("title", ""),
                    "why_it_matters": f"Potentially relevant to {active}.",
                    "action": "Capture one actionable next step.",
                    "effort": "30-60 min",
                    "priority": "MEDIUM",
                }
            )

    try:
        save_markdown(
            _insights_to_markdown(context, items),
            title="Daily Brief",
            folder="Briefs",
            source="jarvis-brief",
        )
    except Exception:
        pass

    return {"insights": items}
