"""Smoke tests for demo builder helpers (no live LLM)."""

from services.demo_builder import _safe_rel, is_build_intent, preview_url
from services.demo_design import pick_hero_url, resolve_kit
from services.demo_templates import normalize_spec, render_app_jsx, render_index_css


def test_build_intent():
    assert is_build_intent("build me a website for a coffee brand")
    assert is_build_intent("Make a landing page for Orbis Robotics")
    assert not is_build_intent("what time is it")


def test_safe_rel():
    assert str(_safe_rel("src/App.jsx")).replace("\\", "/") == "src/App.jsx"
    try:
        _safe_rel("../etc/passwd")
        assert False
    except ValueError:
        pass


def test_kit_resolve():
    key, kit = resolve_kit("espresso_noir")
    assert key == "espresso_noir"
    assert "--brand" in kit["tokens"]


def test_kit_aliases():
    assert resolve_kit("coastal_linen")[0] == "harbor_ink"
    assert resolve_kit("sunlit_editorial")[0] == "ink_press"


def test_offline_spec_coffee_and_drone():
    from services.demo_offline import spec_from_brief

    coffee = spec_from_brief("build me a website for Ember Oak night coffee roast", None)
    assert coffee["kit"] == "espresso_noir"
    assert coffee["brand"] == "Ember Oak"
    assert "streetlights" in coffee["title"].lower() or "roast" in coffee["title"].lower()
    assert "photo-" in coffee["hero_image_url"]
    assert coffee.get("offline") is True
    assert coffee["cta"] == "Reserve a table"

    drone = spec_from_brief("Make a landing page for Orbis drone inspection", "Orbis")
    assert drone["kit"] == "terminal_jade"
    assert drone["layout"] == "terminal"
    assert "audit" in drone["title"].lower() or "inspect" in drone["title"].lower()
    assert "1473968512647" in drone["hero_image_url"]  # drone hero, not PCB


def test_cdn_jsx_strips_imports():
    from services.demo_builder import _prepare_jsx_for_cdn
    from services.demo_offline import spec_from_brief
    from services.demo_templates import normalize_spec, render_app_jsx

    raw = spec_from_brief("build a website for Harbor travel studio", None)
    spec = normalize_spec(raw, "travel", None)
    jsx = render_app_jsx(spec, spec["kit"])
    cdn = _prepare_jsx_for_cdn(jsx)
    assert "import " not in cdn
    assert "const { useEffect } = React" in cdn
    assert "function App" in cdn
    assert "marquee" in cdn
    assert "image-break" in cdn
    assert "simulate" not in cdn.lower()
    assert "refuse" not in cdn.lower()
    assert "steps-rail" in cdn
    assert "chapter-body" in cdn

def test_css_has_no_double_braces():
    css = render_index_css("terminal_jade")
    assert "{{" not in css
    assert "}}" not in css
    assert ".layout-terminal .hero-title {" in css
    assert ".layout-split .hero {" in css


def test_hero_gate_rejects_invented_and_source():
    fallback = pick_hero_url("espresso_noir", "https://source.unsplash.com/1600x900/?coffee")
    assert "source.unsplash.com" not in fallback
    assert "images.unsplash.com/photo-" in fallback

    invented = pick_hero_url(
        "terminal_jade",
        "https://images.unsplash.com/photo-1581091012184-7a5f3c5c2c1b?auto=format&fit=crop&w=1600&q=80",
    )
    _, kit = resolve_kit("terminal_jade")
    assert invented == kit["hero_fallback"] or invented in (kit.get("hero_gallery") or [])


def test_hero_gate_accepts_curated():
    _, kit = resolve_kit("espresso_noir")
    url = kit["hero_fallback"]
    assert pick_hero_url("espresso_noir", url) == url
    assert pick_hero_url("espresso_noir", None, index=0) == (kit.get("hero_gallery") or [url])[0]


def test_normalize_uses_hero_index():
    spec = normalize_spec(
        {
            "title": "Reveal defects in minutes",
            "brand": "Orbis",
            "kit": "terminal_jade",
            "layout": "terminal",
            "hero_image_index": 0,
            "hero_image_url": "https://images.unsplash.com/photo-9999999999999-fake",
            "tagline": "Inspection without the wait",
            "eyebrow": "Terminal Jade",
        },
        "industrial drone inspection",
        "Orbis",
    )
    assert "photo-9999999999999" not in spec["hero_image_url"]
    assert spec["eyebrow"] == "Orbis"  # kit label stripped
    assert spec["layout"] == "terminal"


def test_jsx_layout_branches_and_h1():
    cinema = render_app_jsx(
        {
            "brand": "Ember Oak",
            "title": "Roast that holds after midnight",
            "tagline": "Late cups, clean finish",
            "supporting": "Single-origin, pulled for night shift.",
            "layout": "cinema",
            "hero_image_url": pick_hero_url("espresso_noir"),
            "eyebrow": "Coffee",
            "cta": "Order",
            "cta_secondary": "Menu",
            "proof_line": "Beans roasted in-house twice a week.",
            "story": "Night roast.",
            "features": [
                {"label": "Batch", "detail": "Small lots"},
                {"label": "Pull", "detail": "Consistent shots"},
                {"label": "Ship", "detail": "Same-week bags"},
            ],
            "steps": [
                {"label": "Taste", "detail": "Cupping notes"},
                {"label": "Roast", "detail": "Profile locked"},
                {"label": "Brew", "detail": "Dial-in guide"},
            ],
            "sections": [
                {"heading": "Why nights", "body": "City never sleeps."},
                {"heading": "How we roast", "body": "Two drops weekly."},
            ],
            "signals_kicker": "Menu",
            "signals_heading": "On the bar",
            "process_kicker": "Flow",
            "process_heading": "From green to cup",
            "closing": "Come by after ten.",
        },
        "espresso_noir",
    )
    assert "Roast that holds after midnight" in cinema
    assert "IntersectionObserver" in cinema
    assert "signals-asymmetric" in cinema
    assert "JARVIS demo" not in cinema
    assert 'className="brand" href="#top">Ember Oak</a>' in cinema

    terminal = render_app_jsx(
        {
            "brand": "Orbis",
            "title": "Inspect what humans miss",
            "tagline": "Millimeter scans on site",
            "supporting": "Encrypted at source.",
            "layout": "terminal",
            "hero_image_url": pick_hero_url("terminal_jade"),
            "eyebrow": "Inspection",
            "cta": "Book a demo",
            "cta_secondary": "Specs",
            "proof_line": "Calibrated on site, delivered through a CI-tested pipeline.",
            "features": [
                {"label": "Scan", "detail": "On-site meshes"},
                {"label": "Flag", "detail": "Anomaly review"},
                {"label": "Report", "detail": "Same-day packet"},
            ],
            "steps": [
                {"label": "Fly", "detail": "Site pass"},
                {"label": "Process", "detail": "Mesh + flags"},
                {"label": "Deliver", "detail": "Report out"},
            ],
            "sections": [
                {"heading": "Field", "body": "Harsh sites."},
                {"heading": "Pipeline", "body": "Encrypted drop."},
            ],
        },
        "terminal_jade",
    )
    assert "terminal-rail" in terminal
    assert "Inspect what humans miss" in terminal

    split = render_app_jsx(
        {
            "brand": "Stone & Co",
            "title": "Spaces that earn trust",
            "tagline": "Architecture with restraint",
            "supporting": "Studios and civic work.",
            "layout": "split",
            "hero_image_url": pick_hero_url("editorial_stone"),
            "eyebrow": "Studio",
            "cta": "Start a project",
            "cta_secondary": "Work",
            "proof_line": "Drawings reviewed before every site visit.",
            "features": [
                {"label": "Listen", "detail": "Brief first"},
                {"label": "Draw", "detail": "Clear plans"},
                {"label": "Build", "detail": "Site presence"},
            ],
            "steps": [
                {"label": "Brief", "detail": "Constraints"},
                {"label": "Scheme", "detail": "Options"},
                {"label": "Detail", "detail": "Build set"},
            ],
            "sections": [
                {"heading": "Civic", "body": "Public rooms."},
                {"heading": "Private", "body": "Quiet homes."},
            ],
        },
        "editorial_stone",
    )
    assert "split-rail" in split
