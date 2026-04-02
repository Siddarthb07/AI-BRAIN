from __future__ import annotations

from typing import Dict, List

from app.services.storage import get_context, list_insights


def generate_brief() -> Dict[str, List[Dict]]:
    context = get_context()
    insights = list_insights(limit=20)
    if not insights:
        return {
            "insights": [
                {
                    "signal": "New AI repo trending",
                    "why_it_matters": "Relevant to your backend AI work",
                    "action": "Review repo and extract ideas",
                    "effort": "1 hour",
                    "priority": "HIGH",
                }
            ]
        }

    active = context.get("active_project", "") or "your project"
    focus_repos = context.get("focus_repos", [])
    focus_topics = context.get("focus_topics", [])
    brief_items = []
    if focus_repos or focus_topics:
        for repo in focus_repos[:3]:
            brief_items.append(
                {
                    "signal": f"Focus repo: {repo}",
                    "why_it_matters": f"Chosen by you for {active}.",
                    "action": "Review recent commits and capture one improvement.",
                    "effort": "45 min",
                    "priority": "HIGH",
                }
            )
        for topic in focus_topics[:3]:
            brief_items.append(
                {
                    "signal": f"Learning topic: {topic}",
                    "why_it_matters": f"Directly aligned with {active}.",
                    "action": "Watch one tutorial and summarize 3 takeaways.",
                    "effort": "30-60 min",
                    "priority": "HIGH",
                }
            )

    for item in insights[:5]:
        brief_items.append(
            {
                "signal": item.get("title", ""),
                "why_it_matters": f"Potentially relevant to {active}.",
                "action": "Scan the item and capture one actionable next step.",
                "effort": "30-60 min",
                "priority": "MEDIUM",
            }
        )
    return {"insights": brief_items}
