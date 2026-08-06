"""Offline brief → demo spec when Groq/Ollama is unreachable.

Templates carry visual quality; this invents honest, concrete, category-true copy
so offline builds still feel directed — not brief-dump + generic cards.
"""

from __future__ import annotations

import re
from typing import Any

from services.demo_design import pick_hero_url, resolve_kit

_KIT_HINTS: list[tuple[str, tuple[str, ...]]] = [
    ("espresso_noir", ("coffee", "cafe", "café", "espresso", "roast", "brew", "bakery", "tea", "bar ", "cocktail", "pour-over", "pour over")),
    ("atelier_red", ("fashion", "apparel", "clothing", "runway", "gallery", "atelier", "boutique", "beauty", "cosmetic")),
    ("harbor_ink", ("travel", "coast", "ocean", "beach", "outdoor", "surf", "sail", "hotel", "resort", "adventure")),
    ("editorial_stone", ("architect", "studio", "agency", "consult", "interior", "design firm", "civic", "property")),
    ("terminal_jade", ("drone", "robot", "saas", "devtool", "software", "api", "infra", "cyber", "inspect", "sensor", "ai ", "cmms", "oil", "gas", "industrial")),
    ("arctic_glass", ("fintech", "bank", "health", "clinic", "medical", "precision", "analytics", "finance", "insurance")),
    ("ink_press", ("news", "media", "journal", "magazine", "publish", "school", "education", "podcast", "writer")),
    ("paper_dawn", ("wellness", "yoga", "studio light", "editorial day", "bookstore", "library")),
]

# Category packs: title / voice / proof / CTAs tuned per vertical.
# Keep language concrete. Never invent ISO, %, or customer counts.
_PACKS: dict[str, dict[str, Any]] = {
    "coffee": {
        "kit": "espresso_noir",
        "eyebrow": "Late-night coffee bar",
        "title": "Dark roast after the streetlights come on",
        "tagline": "Slow brew for the hour when the city thins out.",
        "supporting": "Warm light, deep cups, and a bar that stays open when the last train has gone.",
        "cta": "Reserve a table",
        "cta_secondary": "View the menu",
        "proof": "Each batch roasted in-house, ground to order, poured by baristas who dial every cup.",
        "signals_kicker": "Why here",
        "signals_heading": "Crafted for night-time drinkers",
        "process_kicker": "Ritual",
        "process_heading": "Bean to cup, night by night",
        "features": [
            {"label": "Small-batch roasting", "detail": "Beans roasted to order so the night cup still tastes alive."},
            {"label": "Hand pour-over", "detail": "Temperature and flow held steady — no autopilot machines on the night shift."},
            {"label": "Dim-lit room", "detail": "Low light and quiet tables meant for lingering, not rush-hour throughput."},
        ],
        "steps": [
            {"label": "Choose your brew", "detail": "Night-roast lineup — espresso, pour-over, or cold."},
            {"label": "Watch the pour", "detail": "The ritual is part of the cup: grind, bloom, finish."},
            {"label": "Stay a while", "detail": "Finish the hour with the roast notes on the table."},
        ],
        "sections": [
            {"heading": "Our roast", "body": "Dark, dense beans from farms we name on the bag — roasted for night depth, not brunch sweetness."},
            {"heading": "The ritual", "body": "Every cup is timed: grind, bloom, pour. You can see the work from the bar."},
            {"heading": "After hours", "body": "We compost grounds and keep packaging simple — the room stays quiet because the process is."},
        ],
        "closing": "Join us after dusk. Let the night linger over a proper cup.",
    },
    "drone": {
        "kit": "terminal_jade",
        "eyebrow": "Industrial asset inspection",
        "title": "Inspections that leave a trail you can audit",
        "tagline": "Fly the asset. Flag the defect. Hand the packet to maintenance.",
        "supporting": "Autonomous flights capture the structure; engineers review ranked anomalies — not a slideshow of pretty frames.",
        "cta": "Schedule a demo",
        "cta_secondary": "Download technical specs",
        "proof": "Calibrated on site, encrypted at source, delivered through a reviewed pipeline into your CMMS.",
        "signals_kicker": "Key benefits",
        "signals_heading": "Built for harsh sites",
        "process_kicker": "Workflow",
        "process_heading": "From launch to insight",
        "features": [
            {"label": "Rapid deploy", "detail": "Crews launch in minutes and cover spans people cannot linger on."},
            {"label": "Ranked review", "detail": "Corrosion, cracks, and wear flagged for an engineer — not buried in raw footage."},
            {"label": "Secure packet", "detail": "Encrypted drop that plugs into existing maintenance workflows."},
        ],
        "steps": [
            {"label": "Plan", "detail": "Mark inspection zones in the web app before anyone flies."},
            {"label": "Fly", "detail": "Autonomous survey with live monitoring while you stay clear of the asset."},
            {"label": "Review", "detail": "Annotated report with the raw trail intact for compliance."},
        ],
        "sections": [
            {"heading": "Why this stack", "body": "Cut rope-access hours, keep humans off hot surfaces, and leave evidence maintenance can act on."},
            {"heading": "Harsh environments", "body": "Weather-aware planning, redundant sensors, and flight envelopes tuned for industrial sites."},
            {"heading": "Fits your workflow", "body": "Export into ERP, CMMS, or compliance systems over secure APIs — no parallel spreadsheet."},
        ],
        "closing": "Ready to change how you inspect? Book a walkthrough of the flight-to-packet path.",
    },
    "fashion": {
        "kit": "atelier_red",
        "eyebrow": "Atelier",
        "title": "Clothes that hold a silhouette under hard light",
        "tagline": "Small drops. Measured fits. No invented waitlists.",
        "supporting": "Lookbook pages that read like a runway card — type first, then fabric, then the ask.",
        "cta": "Shop the drop",
        "cta_secondary": "See the lookbook",
        "proof": "Fits measured on real bodies; drops numbered; returns handled without theater.",
        "signals_kicker": "Collection",
        "signals_heading": "What this season holds",
        "process_kicker": "Atelier",
        "process_heading": "From sketch to rail",
        "features": [
            {"label": "Measured cuts", "detail": "Patterns adjusted after fittings — not after a viral post."},
            {"label": "Numbered drops", "detail": "Limited runs with fabric notes you can actually read."},
            {"label": "Quiet service", "detail": "Alterations and returns without loyalty-program fog."},
        ],
        "steps": [
            {"label": "Browse", "detail": "Start with silhouette and fabric, not a discount clock."},
            {"label": "Fit", "detail": "Size guide written from fittings, not a generic chart."},
            {"label": "Own", "detail": "Ship with care notes — and a real person if something is wrong."},
        ],
        "sections": [
            {"heading": "Fabric first", "body": "We name mills and weights. If it cannot survive wear, it does not ship."},
            {"heading": "The rail", "body": "Each drop is edited hard — fewer SKUs, clearer story."},
            {"heading": "After purchase", "body": "Care cards and alterations, not a newsletter blast."},
        ],
        "closing": "The next drop ships when it is ready — not when a calendar says so.",
    },
    "travel": {
        "kit": "harbor_ink",
        "eyebrow": "Travel",
        "title": "Routes with weather, tide, and a clear next step",
        "tagline": "Plan the trip you will actually take — dates, gear, and the hard bits named.",
        "supporting": "Coastal light, honest itineraries, booking that does not hide the constraints.",
        "cta": "Check dates",
        "cta_secondary": "See itineraries",
        "proof": "Itineraries written against real ferry and tide tables — not brochure fantasy.",
        "signals_kicker": "Why go",
        "signals_heading": "Trips that respect the coast",
        "process_kicker": "Plan",
        "process_heading": "From inquiry to departure",
        "features": [
            {"label": "Tide-aware days", "detail": "Schedules that move when the water does."},
            {"label": "Gear lists", "detail": "What to pack for wind, not for Instagram."},
            {"label": "Local anchors", "detail": "Meals and stays we would book ourselves."},
        ],
        "steps": [
            {"label": "Pick a route", "detail": "Choose by season and skill — not by vibe word."},
            {"label": "Lock dates", "detail": "Ferries, rooms, and buffers written into the plan."},
            {"label": "Go", "detail": "Day sheets with weather windows and bail-out options."},
        ],
        "sections": [
            {"heading": "Honest maps", "body": "Distances and difficulty in plain language."},
            {"heading": "Weather windows", "body": "We cancel early when conditions fail — better than a sunk deposit story."},
            {"heading": "After you return", "body": "Notes for the next trip, not a review farm."},
        ],
        "closing": "Tell us the week you have. We will tell you what the coast will allow.",
    },
    "studio": {
        "kit": "editorial_stone",
        "eyebrow": "Studio",
        "title": "Work that survives the site visit",
        "tagline": "Constraints first. Decoration later. Drawings you can build from.",
        "supporting": "Architecture and consultancy pages that lead with process — not stock glass towers.",
        "cta": "Start a project",
        "cta_secondary": "See selected work",
        "proof": "Drawings reviewed before every site visit — scope, structure, then surface.",
        "signals_kicker": "Practice",
        "signals_heading": "How the studio works",
        "process_kicker": "Phases",
        "process_heading": "Brief to handover",
        "features": [
            {"label": "Constraint maps", "detail": "Codes, budget, and structure named before mood boards."},
            {"label": "Buildable sets", "detail": "Details that contractors can price without guessing."},
            {"label": "Site presence", "detail": "We show up when the pour happens — not only at the photoshoot."},
        ],
        "steps": [
            {"label": "Brief", "detail": "Program, budget, and non-negotiables in writing."},
            {"label": "Scheme", "detail": "Options with trade-offs — not one pretty option."},
            {"label": "Deliver", "detail": "Docs, site support, and a clean handover pack."},
        ],
        "sections": [
            {"heading": "Selected work", "body": "Projects chosen for clarity of problem, not square footage."},
            {"heading": "Team", "body": "Small studio — the people on the page are the people on the call."},
            {"heading": "Engagement", "body": "Fixed phases with review gates. No open-ended fog."},
        ],
        "closing": "Bring the brief. We will tell you what is buildable in your window.",
    },
    "default": {
        "kit": "terminal_jade",
        "eyebrow": "Directed landing",
        "title": "A first impression you can defend",
        "tagline": "Clear offer. Honest proof. One next step.",
        "supporting": "Type, motion, and structure tuned to how the work actually happens.",
        "cta": "Start a project",
        "cta_secondary": "Read the story",
        "proof": "Process you can inspect — no fabricated ratings or customer counts.",
        "signals_kicker": "Offer",
        "signals_heading": "What holds",
        "process_kicker": "Process",
        "process_heading": "From brief to live",
        "features": [
            {"label": "Clarity", "detail": "What changes for the visitor, in one screen."},
            {"label": "Craft", "detail": "Process language you can verify."},
            {"label": "Next step", "detail": "One action when they are ready."},
        ],
        "steps": [
            {"label": "Brief", "detail": "Lock the offer, audience, and primary action."},
            {"label": "Shape", "detail": "Structure and voice matched to how you work."},
            {"label": "Ship", "detail": "A real page — type, motion, and proof in place."},
        ],
        "sections": [
            {"heading": "Who it's for", "body": "People deciding fast: what changes, why trust it, what to do next."},
            {"heading": "How we work", "body": "Constraints named early. Decoration leave last."},
            {"heading": "What you leave with", "body": "A directed first impression — not equal feature cards and invented social proof."},
        ],
        "closing": "Ready when you are.",
    },
}


def _guess_kit(brief: str) -> str:
    low = brief.lower()
    for kit, words in _KIT_HINTS:
        if any(w in low for w in words):
            return kit
    return "terminal_jade"


def _pick_pack(brief: str) -> tuple[str, dict[str, Any]]:
    low = brief.lower()
    if any(w in low for w in ("coffee", "cafe", "café", "espresso", "roast", "brew", "pour-over", "bakery")):
        return "coffee", _PACKS["coffee"]
    if any(w in low for w in ("drone", "inspect", "robot", "cmms", "oil", "gas", "industrial", "sensor")):
        return "drone", _PACKS["drone"]
    if any(w in low for w in ("fashion", "apparel", "boutique", "atelier", "runway", "beauty")):
        return "fashion", _PACKS["fashion"]
    if any(w in low for w in ("travel", "hotel", "resort", "coast", "beach", "outdoor", "surf")):
        return "travel", _PACKS["travel"]
    if any(w in low for w in ("architect", "studio", "agency", "consult", "interior", "property")):
        return "studio", _PACKS["studio"]
    return "default", _PACKS["default"]


def _guess_brand(brief: str, brand: str | None) -> str:
    if brand and brand.strip():
        return brand.strip()[:48]
    m = re.search(r"\b(?:for|called|named)\s+([A-Z][\w&'’.-]*(?:\s+[A-Z][\w&'’.-]*){0,3})", brief)
    if m:
        return m.group(1).strip()[:48]
    m = re.search(r"\b([A-Z][a-zA-Z0-9]+(?:\s+[A-Z][a-zA-Z0-9]+){0,2})\b", brief)
    if m and m.group(1).lower() not in {"build", "make", "create", "design", "website", "landing"}:
        return m.group(1).strip()[:48]
    words = re.findall(r"[a-zA-Z]{3,}", brief)
    skip = {"build", "website", "site", "landing", "page", "make", "create", "demo", "for", "the", "and", "with"}
    picked = [w.capitalize() for w in words if w.lower() not in skip][:2]
    return " ".join(picked) if picked else "Studio"


def _inject_brand(text: str, brand: str) -> str:
    if "{brand}" in text:
        return text.replace("{brand}", brand)
    return text


def spec_from_brief(brief: str, brand: str | None = None) -> dict[str, Any]:
    """Deterministic high-quality spec — no LLM required."""
    brief = (brief or "").strip()
    pack_key, pack = _pick_pack(brief)
    kit_key, kit = resolve_kit(pack.get("kit") or _guess_kit(brief))
    brand_name = _guess_brand(brief, brand)
    layout = str(kit.get("layout") or "cinema")

    title = _inject_brand(str(pack["title"]), brand_name)
    tagline = _inject_brand(str(pack["tagline"]), brand_name)
    supporting = _inject_brand(str(pack["supporting"]), brand_name)
    closing = _inject_brand(str(pack["closing"]), brand_name)
    if brand_name and brand_name.lower() not in closing.lower() and pack_key != "default":
        closing = f"{closing.rstrip('.')} — {brand_name}."

    return {
        "slug": re.sub(r"[^\w-]+", "-", brand_name.lower()).strip("-")[:40] or "demo",
        "title": title,
        "brand": brand_name,
        "kit": kit_key,
        "layout": layout,
        "visual_thesis": "",  # kit mood is internal — never dump into hero copy
        "eyebrow": str(pack["eyebrow"]),
        "tagline": tagline,
        "supporting": supporting,
        "cta": str(pack["cta"]),
        "cta_secondary": str(pack["cta_secondary"]),
        "hero_image_index": 0,
        "hero_image_url": pick_hero_url(kit_key, index=0),
        "proof_line": _inject_brand(str(pack["proof"]), brand_name),
        "story": supporting,
        "features": list(pack["features"]),
        "steps": list(pack["steps"]),
        "sections": list(pack["sections"]),
        "signals_kicker": str(pack["signals_kicker"]),
        "signals_heading": str(pack["signals_heading"]),
        "process_kicker": str(pack["process_kicker"]),
        "process_heading": str(pack["process_heading"]),
        "closing": closing,
        "offline": True,
    }
