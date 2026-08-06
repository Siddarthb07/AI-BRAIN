"""Vite/React demo templates — kit-specific layouts with personality (not one generic shell)."""

from __future__ import annotations

import re
from typing import Any

from services.demo_design import resolve_kit


def _esc(text: Any) -> str:
    return str(text or "").replace("\\", "\\\\").replace("`", "\\`").replace("${", "\\${")


def _fonts_link(display: str, body: str) -> str:
    d = display.replace(" ", "+")
    b = body.replace(" ", "+")
    return (
        "https://fonts.googleapis.com/css2?family="
        f"{d}:ital,wght@0,400;0,600;0,700;1,400&family={b}:wght@400;500;600&display=swap"
    )


def _list_items(items: list, keys: tuple[str, str] = ("label", "detail"), limit: int = 3) -> list[dict[str, str]]:
    out: list[dict[str, str]] = []
    for raw in (items or [])[:limit]:
        if not isinstance(raw, dict):
            continue
        a = _esc(raw.get(keys[0]) or raw.get("heading") or "")
        b = _esc(raw.get(keys[1]) or raw.get("body") or "")
        if a or b:
            out.append({"a": a, "b": b})
    return out


def render_app_jsx(spec: dict[str, Any], kit_key: str) -> str:
    key, kit = resolve_kit(kit_key)
    layout = str(spec.get("layout") or kit.get("layout") or "cinema").strip().lower()
    brand = _esc(spec.get("brand") or spec.get("title") or "Brand")
    title = _esc(spec.get("title") or brand)
    tagline = _esc(spec.get("tagline") or "Crafted with intent.")
    support = _esc(spec.get("supporting") or "")
    cta = _esc(spec.get("cta") or "Explore")
    cta2 = _esc(spec.get("cta_secondary") or "Our story")
    eyebrow = _esc(spec.get("eyebrow") or brand)
    thesis = _esc(spec.get("visual_thesis") or kit.get("mood") or "")
    proof = _esc(spec.get("proof_line") or "Built with craft — no fabricated praise.")
    closing = _esc(spec.get("closing") or support or tagline)
    hero = _esc(spec.get("hero_image_url") or kit.get("hero_fallback") or "")
    story = _esc(spec.get("story") or support)

    features = _list_items(spec.get("features") if isinstance(spec.get("features"), list) else [])
    steps = _list_items(spec.get("steps") if isinstance(spec.get("steps"), list) else [])
    sections = _list_items(
        spec.get("sections") if isinstance(spec.get("sections"), list) else [],
        keys=("heading", "body"),
        limit=3,
    )
    while len(sections) < 2:
        sections.append({"a": "The work", "b": story or support or tagline})

    default_features = features or [
        {"a": "Craft", "b": proof},
        {"a": "Clarity", "b": tagline},
        {"a": "Momentum", "b": cta},
    ]
    default_steps = steps or [
        {"a": "Brief", "b": "We lock the offer and the first action."},
        {"a": "Build", "b": "Ship a directed page, not a template."},
        {"a": "Polish", "b": "Motion, type, and proof in place."},
    ]

    feat_jsx = "\n".join(
        f'        <div className="signal" key="{i}"><h3>{f["a"]}</h3><p>{f["b"]}</p></div>'
        for i, f in enumerate(default_features)
    )
    step_jsx = "\n".join(
        f'        <div className="step" key="{i}"><span className="step-n">{str(i+1).zfill(2)}</span><div><h3>{s["a"]}</h3><p>{s["b"]}</p></div></div>'
        for i, s in enumerate(default_steps)
    )
    sec_jsx = "\n".join(
        (
            f'      <section className="chapter" style={{{{ animationDelay: "{0.12 + i * 0.12:.2f}s" }}}} key="{i}">\n'
            f"        <h2>{s['a']}</h2>\n"
            f"        <p>{s['b']}</p>\n"
            f"      </section>"
        )
        for i, s in enumerate(sections)
    )

    nav = f"""      <header className="nav">
        <div className="brand">{brand}</div>
        <nav className="nav-links" aria-label="Primary">
          <a href="#story">Story</a>
          <a href="#proof">Proof</a>
          <a className="nav-cta" href="#cta">{cta}</a>
        </nav>
      </header>"""

    footer = f"""      <footer className="footer">
        <div>
          <div className="brand">{brand}</div>
          <p className="thesis">{thesis}</p>
        </div>
        <p className="fine">Vite · React · JARVIS demo · no fake testimonials</p>
      </footer>"""

    if layout == "runway":
        hero_block = f"""      <section className="hero layout-runway">
        <div className="accent-bar" aria-hidden="true" />
        <div className="hero-media" style={{{{ backgroundImage: `url({hero})` }}}} />
        <div className="hero-scrim" />
        <div className="hero-grain" aria-hidden="true" />
        <div className="hero-copy runway-copy">
          <p className="eyebrow">{eyebrow}</p>
          <h1 className="hero-title">{brand}</h1>
          <p className="hero-tag">{title}</p>
          <p className="hero-support">{tagline}. {support}</p>
          <div className="hero-actions" id="cta">
            <a className="btn-primary" href="#story">{cta}</a>
            <a className="btn-ghost" href="#proof">{cta2}</a>
          </div>
        </div>
      </section>"""
    elif layout == "terminal":
        hero_block = f"""      <section className="hero layout-terminal">
        <div className="hero-media" style={{{{ backgroundImage: `url({hero})` }}}} />
        <div className="hero-scrim" />
        <div className="hero-grain" aria-hidden="true" />
        <div className="hero-copy">
          <p className="eyebrow mono">{{"{"} system · online {"}"} · {eyebrow}</p>
          <h1 className="hero-title">{title}</h1>
          <p className="hero-tag mono">{tagline}</p>
          <p className="hero-support">{support}</p>
          <div className="hero-actions" id="cta">
            <a className="btn-primary" href="#story">{cta}</a>
            <a className="btn-ghost" href="#proof">{cta2}</a>
          </div>
        </div>
        <div className="terminal-rail" aria-hidden="true">
          <span>verify</span><span>simulate</span><span>refuse</span>
        </div>
      </section>"""
    elif layout == "split":
        hero_block = f"""      <section className="hero layout-split">
        <div className="split-brand">
          <p className="eyebrow">{eyebrow}</p>
          <h1 className="hero-title">{brand}</h1>
          <p className="thesis">{thesis}</p>
        </div>
        <div className="split-stage">
          <div className="hero-media" style={{{{ backgroundImage: `url({hero})` }}}} />
          <div className="hero-scrim" />
          <div className="hero-copy">
            <p className="hero-tag">{title}</p>
            <p className="hero-support">{tagline}. {support}</p>
            <div className="hero-actions" id="cta">
              <a className="btn-primary" href="#story">{cta}</a>
              <a className="btn-ghost" href="#proof">{cta2}</a>
            </div>
          </div>
        </div>
      </section>"""
    else:
        hero_block = f"""      <section className="hero layout-{layout}">
        <div className="hero-media" style={{{{ backgroundImage: `url({hero})` }}}} />
        <div className="hero-scrim" />
        <div className="hero-grain" aria-hidden="true" />
        <div className="hero-copy">
          <p className="eyebrow">{eyebrow}</p>
          <h1 className="hero-title">{title}</h1>
          <p className="hero-tag">{tagline}</p>
          <p className="hero-support">{support}</p>
          <div className="hero-actions" id="cta">
            <a className="btn-primary" href="#story">{cta}</a>
            <a className="btn-ghost" href="#proof">{cta2}</a>
          </div>
        </div>
      </section>"""

    return f"""export default function App() {{
  return (
    <div className="page kit-{key} layout-{layout}">
{nav}

{hero_block}

      <section className="proof-band" id="proof">
        <p className="proof-line">{proof}</p>
      </section>

      <section className="signals">
{feat_jsx}
      </section>

      <main id="story" className="story">
{sec_jsx}
      </main>

      <section className="process">
        <h2 className="process-title">How it moves</h2>
        <div className="steps">
{step_jsx}
        </div>
      </section>

      <section className="close-band">
        <h2>{closing}</h2>
        <a className="btn-primary" href="#cta">{cta}</a>
      </section>

{footer}
    </div>
  )
}}
"""
