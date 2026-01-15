from __future__ import annotations

from typing import Dict, List

from app.ranking.scorer import rank_insights
from app.services.storage import get_user_context, list_insights


def _priority(score: float) -> str:
    if score >= 0.75:
        return "high"
    if score >= 0.6:
        return "medium"
    return "low"


def _effort(actionability: float) -> str:
    if actionability >= 0.75:
        return "30-45 min"
    if actionability >= 0.5:
        return "45-90 min"
    return "15-30 min"


def _action_for_source(source: str, title: str) -> str:
    source = source.lower()
    if source == "github_repo":
        return f"Scan `{title}` and extract one implementation pattern to apply to your active project today."
    if source == "hackernews":
        return f"Read the top discussion behind `{title}` and capture 3 actionable notes in your project log."
    if source == "github_trending":
        return f"Evaluate `{title}` for 10 minutes and decide whether to adopt, watch, or ignore."
    return f"Review `{title}` and write one concrete next step tied to your current goals."


def _why_matters(row: Dict, active_project: str) -> str:
    source = row.get("source", "signal")
    relevance = row.get("project_relevance", 0.0)
    goal = row.get("goal_alignment", 0.0)
    if active_project:
        return (
            f"This {source} signal aligns with `{active_project}` "
            f"(project relevance {relevance:.2f}, goal alignment {goal:.2f})."
        )
    return (
        f"This {source} signal shows strong alignment with your daily goals "
        f"(goal alignment {goal:.2f})."
    )


def generate_daily_brief() -> Dict[str, List[Dict]]:
    context = get_user_context()
    candidates = list_insights(limit=300)
    ranked = rank_insights(
        candidates=candidates,
        daily_goals=context.get("daily_goals", []),
        active_project=context.get("active_project", ""),
    )

    if not ranked:
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

    active_project = context.get("active_project", "")
    insights = []
    for row in ranked[:5]:
        insights.append(
            {
                "signal": row.get("title", ""),
                "why_it_matters": _why_matters(row, active_project),
                "action": _action_for_source(row.get("source", ""), row.get("title", "")),
                "effort": _effort(row.get("actionability", 0.0)),
                "priority": _priority(row.get("score", 0.0)),
            }
        )

    return {"insights": insights}
