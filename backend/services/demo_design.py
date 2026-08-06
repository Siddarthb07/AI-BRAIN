"""Cinematic design system for JARVIS demo sites.

Rules distilled from:
- divyanshu-iitian/agent-website-design-skills (web-visual-direction, landing-page-craft)
- JARVIS Operator-Verse frontend hard bans (no purple-indigo, no cream+terracotta slop)
"""

from __future__ import annotations

import re

# Compact skill contract injected into the LLM every build.
DESIGN_BRIEF = """
You write COPY + KIT CHOICE for a Vite+React landing page filled into a layout kit.
You do NOT invent freeform HTML/CSS — the renderer owns structure.

COPY / CONVERSION
- Audience, offer, primary action, biggest objection — concrete language.
- Informative title (what changes for the visitor). Brand name is separate.
- Proof line = honest process/craft ("how we work") — never fake ratings, logos, ISO, % metrics, or customer counts.
- CTA destination-aware (Schedule a tour / Order / Book a call — match the brief).

HARD BANS (words + claims)
- revolutionizing, cutting-edge, seamless, unlock potential, reimagined, next-gen, world-class
- Invented ISO/SOC2, "millions of", fake % uptime, named fake customers
- Purple-indigo gradients, cream+terracotta brochure clichés, emoji, pill-cluster CTAs
""".strip()

# Known-good Unsplash images (verified photo IDs). LLM picks hero_image_index; never invents IDs.
_U = "https://images.unsplash.com/photo-{pid}?auto=format&fit=crop&w=2400&q=80"

AESTHETIC_KITS: dict[str, dict] = {
    "espresso_noir": {
        "label": "Espresso Noir",
        "fonts": ("Fraunces", "Outfit"),
        "layout": "cinema",
        "hero_fallback": _U.format(pid="1495474472287-4d71bcdd2085"),
        "hero_gallery": [
            _U.format(pid="1495474472287-4d71bcdd2085"),
            _U.format(pid="1509042239860-f550ce710b93"),
            _U.format(pid="1414235077428-338989a2e8c0"),
            _U.format(pid="1521017432531-fbd92d768814"),
        ],
        "tokens": {
            "--bg": "#0c0a09",
            "--bg-elevated": "#1c1917",
            "--fg": "#f5f0e8",
            "--fg-muted": "#a8a29e",
            "--brand": "#c4a574",
            "--brand-2": "#8b5e3c",
            "--accent": "#e8d5b5",
            "--line": "#292524",
        },
        "mood": "dark warmth, craft F&B, late-night ritual",
    },
    "editorial_stone": {
        "label": "Editorial Stone",
        "fonts": ("Cormorant Garamond", "Manrope"),
        "layout": "split",
        "hero_fallback": _U.format(pid="1487958449943-2429e8be8625"),
        "hero_gallery": [
            _U.format(pid="1487958449943-2429e8be8625"),
            _U.format(pid="1451187580459-43490279c0fa"),
        ],
        "tokens": {
            "--bg": "#121417",
            "--bg-elevated": "#1c2128",
            "--fg": "#e8e6e1",
            "--fg-muted": "#9a958c",
            "--brand": "#c5b69a",
            "--brand-2": "#6b7f78",
            "--accent": "#e7d7b5",
            "--line": "#2c333c",
        },
        "mood": "agency, architecture, consultancy — ink + stone",
    },
    "harbor_ink": {
        "label": "Harbor Ink",
        "fonts": ("Libre Baskerville", "DM Sans"),
        "layout": "horizon",
        "hero_fallback": _U.format(pid="1507525428034-b723cf961d3e"),
        "hero_gallery": [
            _U.format(pid="1507525428034-b723cf961d3e"),
            _U.format(pid="1451187580459-43490279c0fa"),
        ],
        "tokens": {
            "--bg": "#071318",
            "--bg-elevated": "#0f1f27",
            "--fg": "#e6f2f4",
            "--fg-muted": "#7f9aa3",
            "--brand": "#3d9ead",
            "--brand-2": "#1a5c66",
            "--accent": "#b8e0c2",
            "--line": "#1a3038",
        },
        "mood": "coastal lifestyle, outdoor, travel — deep ink sea",
    },
    "atelier_red": {
        "label": "Atelier Red",
        "fonts": ("Playfair Display", "Karla"),
        "layout": "runway",
        "hero_fallback": _U.format(pid="1469334031218-e382a71b716b"),
        "hero_gallery": [
            _U.format(pid="1469334031218-e382a71b716b"),
            _U.format(pid="1495474472287-4d71bcdd2085"),
        ],
        "tokens": {
            "--bg": "#0e0b0b",
            "--bg-elevated": "#1a1212",
            "--fg": "#f4ece8",
            "--fg-muted": "#a89890",
            "--brand": "#c0392b",
            "--brand-2": "#6b1410",
            "--accent": "#f0c4b8",
            "--line": "#2a1c1c",
        },
        "mood": "fashion, culture, gallery — dark runway with blood-red accent",
    },
    "terminal_jade": {
        "label": "Terminal Jade",
        "fonts": ("Space Grotesk", "IBM Plex Sans"),
        "layout": "terminal",
        "hero_fallback": _U.format(pid="1473968512647-3e447244af8f"),
        "hero_gallery": [
            _U.format(pid="1473968512647-3e447244af8f"),
            _U.format(pid="1518770660439-4636190af475"),
            _U.format(pid="1451187580459-43490279c0fa"),
            _U.format(pid="1541167760496-1628856ab772"),
        ],
        "tokens": {
            "--bg": "#0b0f0e",
            "--bg-elevated": "#141a18",
            "--fg": "#e8f0ec",
            "--fg-muted": "#8aa399",
            "--brand": "#3dd68c",
            "--brand-2": "#1f6f54",
            "--accent": "#a8ffce",
            "--line": "#24302b",
        },
        "mood": "dev tools, SaaS, infra, industrial inspection — signal green on charcoal",
    },
    "arctic_glass": {
        "label": "Arctic Glass",
        "fonts": ("Sora", "Source Sans 3"),
        "layout": "precision",
        "hero_fallback": _U.format(pid="1451187580459-43490279c0fa"),
        "hero_gallery": [
            _U.format(pid="1451187580459-43490279c0fa"),
            _U.format(pid="1518770660439-4636190af475"),
        ],
        "tokens": {
            "--bg": "#0f1419",
            "--bg-elevated": "#1a2330",
            "--fg": "#eef3f8",
            "--fg-muted": "#8b9bb0",
            "--brand": "#5b9fd4",
            "--brand-2": "#2a4a6a",
            "--accent": "#7ee0ff",
            "--line": "#2a3544",
        },
        "mood": "fintech, health, precision systems",
    },
    "ink_press": {
        "label": "Ink Press",
        "fonts": ("Newsreader", "Schibsted Grotesk"),
        "layout": "folio",
        "hero_fallback": _U.format(pid="1487958449943-2429e8be8625"),
        "hero_gallery": [
            _U.format(pid="1487958449943-2429e8be8625"),
            _U.format(pid="1451187580459-43490279c0fa"),
            _U.format(pid="1541167760496-1628856ab772"),
        ],
        "tokens": {
            "--bg": "#0c0d10",
            "--bg-elevated": "#16181e",
            "--fg": "#f2efe8",
            "--fg-muted": "#9a9488",
            "--brand": "#e2b15a",
            "--brand-2": "#7a5a28",
            "--accent": "#f0d9a0",
            "--line": "#2a2d36",
        },
        "mood": "media, education, journalism — dark press with gold ink",
    },
    "paper_dawn": {
        "label": "Paper Dawn",
        "fonts": ("Literata", "Figtree"),
        "layout": "folio",
        "hero_fallback": _U.format(pid="1487958449943-2429e8be8625"),
        "hero_gallery": [
            _U.format(pid="1487958449943-2429e8be8625"),
            _U.format(pid="1414235077428-338989a2e8c0"),
            _U.format(pid="1554118811-1e0d58224f24"),
        ],
        "tokens": {
            "--bg": "#f4f1ea",
            "--bg-elevated": "#ebe6dc",
            "--fg": "#1a1814",
            "--fg-muted": "#5c574e",
            "--brand": "#1f4e3d",
            "--brand-2": "#0f2e24",
            "--accent": "#1f6f8b",
            "--line": "#d4cfc3",
        },
        "mood": "light editorial day page — paper field, forest green, steel accent",
    },
}

_KIT_ALIASES = {
    "coastal_linen": "harbor_ink",
    "sunlit_editorial": "ink_press",
}

_ALLOWED_PHOTO = re.compile(
    r"^https://images\.unsplash\.com/photo-([0-9a-zA-Z-]+)(?:\?|$)",
    re.I,
)


def kit_prompt_block() -> str:
    lines = ["AESTHETIC KITS — pick exactly one key:"]
    for key, kit in AESTHETIC_KITS.items():
        fonts = " + ".join(kit["fonts"])
        n = len(kit.get("hero_gallery") or [kit.get("hero_fallback")])
        lines.append(f"- {key} [{kit['layout']}]: {kit['mood']}; fonts {fonts}; hero_image_index 0..{n - 1}")
    return "\n".join(lines)


def kit_keys() -> list[str]:
    return list(AESTHETIC_KITS.keys())


def resolve_kit(name: str | None) -> tuple[str, dict]:
    key = (name or "").strip().lower().replace(" ", "_").replace("-", "_")
    key = _KIT_ALIASES.get(key, key)
    if key in AESTHETIC_KITS:
        return key, AESTHETIC_KITS[key]
    for k in AESTHETIC_KITS:
        if k in key or key in k:
            return k, AESTHETIC_KITS[k]
    return "terminal_jade", AESTHETIC_KITS["terminal_jade"]


def _gallery_for(kit: dict) -> list[str]:
    gallery = [u for u in (kit.get("hero_gallery") or []) if isinstance(u, str) and u.strip()]
    fb = str(kit.get("hero_fallback") or "").strip()
    if fb and fb not in gallery:
        gallery = [fb] + gallery
    return gallery or [fb] if fb else []


def is_allowed_hero_url(url: str, kit: dict | None = None) -> bool:
    u = (url or "").strip()
    if not u or "source.unsplash.com" in u.lower():
        return False
    m = _ALLOWED_PHOTO.match(u)
    if not m:
        return False
    if kit is None:
        return True
    # Accept if photo id appears in any curated gallery URL for this kit
    pid = m.group(1)
    for g in _gallery_for(kit):
        if pid in g:
            return True
    # Also accept any known gallery photo across kits (shared pool)
    for other in AESTHETIC_KITS.values():
        for g in _gallery_for(other):
            if pid in g:
                return True
    return False


def pick_hero_url(kit_key: str | None, requested: str | None = None, index: int | None = None) -> str:
    """Return a curated Unsplash URL. Never trust invented photo IDs."""
    _, kit = resolve_kit(kit_key)
    gallery = _gallery_for(kit)
    fallback = gallery[0] if gallery else str(kit.get("hero_fallback") or "")

    if requested and is_allowed_hero_url(requested, kit):
        return requested.strip()

    if index is not None and gallery:
        try:
            i = int(index)
            return gallery[i % len(gallery)]
        except (TypeError, ValueError):
            pass

    return fallback


def llm_system_prompt() -> str:
    keys = ", ".join(kit_keys())
    return f"""{DESIGN_BRIEF}

{kit_prompt_block()}

Return ONLY compact JSON (no markdown) with keys:
slug, title, brand, kit, layout, visual_thesis, eyebrow, tagline, supporting,
cta, cta_secondary, hero_image_index, proof_line, story,
features (array of up to 3 {{label, detail}}),
steps (array of up to 3 {{label, detail}}),
sections (array of up to 3 {{heading, body}}),
signals_kicker, signals_heading, process_kicker, process_heading,
closing

Rules for fields:
- kit must be one of: {keys}
- layout should match the kit's layout archetype unless you have a strong reason
- title = informative H1 (what the visitor gets) — NOT only the brand name
- brand = company/product name for nav/footer
- eyebrow = short category line — NEVER the kit label
- visual_thesis: one sentence art direction
- proof_line: honest craft/process — NO fake ratings, ISO, %, customer names
- hero_image_index: integer index into that kit's curated gallery (0-based). Do NOT invent Unsplash URLs or photo IDs.
- signals_kicker / signals_heading / process_kicker / process_heading: short section labels in the brand voice
- Keep strings punchy. No synergy fluff.
""".strip()


def llm_refine_system() -> str:
    return (
        llm_system_prompt()
        + "\n\nREFINE PASS: tighten conversion clarity; kill banned fluff words; "
        "never invent metrics/ISO/customers; keep schema identical; "
        "hero_image_index must stay a valid gallery index."
    )
