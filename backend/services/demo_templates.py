"""Fill Vite/React demos from kit templates + LLM brief fields.

Layout CSS uses plain braces (appended after the f-string body) so rules actually ship.
Hero DOM branches by layout; H1 is informative title, brand stays in nav.
"""

from __future__ import annotations

import re
from typing import Any

from services.demo_design import pick_hero_url, resolve_kit

_LAYOUTS = frozenset({"cinema", "split", "horizon", "runway", "terminal", "precision", "folio"})

# Plain CSS (single braces) — never put these inside an f-string that doubles braces.
_LAYOUT_CSS = """
.layout-cinema .hero { align-items: end; }
.layout-cinema .hero-copy { max-width: 54rem; }

.layout-split .hero {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1.1fr);
  align-items: stretch;
  min-height: 100vh;
}
.layout-split .hero-media {
  position: absolute;
  inset: 0 0 0 48%;
}
.layout-split .hero-scrim {
  background:
    linear-gradient(to right, var(--bg) 0%, var(--bg) 46%, transparent 72%),
    linear-gradient(to top, var(--bg) 0%, transparent 40%);
}
.layout-split .hero-copy {
  grid-column: 1;
  align-self: center;
  max-width: 36rem;
  padding-top: 6rem;
}
.layout-split .split-rail {
  position: relative;
  z-index: 2;
  display: flex;
  flex-direction: column;
  justify-content: center;
  padding: 5.5rem var(--pad-x) 4rem;
  border-right: 1px solid color-mix(in srgb, var(--line) 80%, transparent);
}
.layout-split .split-rail .hero-title { font-size: clamp(2.6rem, 6vw, 4.5rem); }
@media (max-width: 900px) {
  .layout-split .hero { grid-template-columns: 1fr; }
  .layout-split .hero-media { inset: 0; }
  .layout-split .split-rail { border-right: none; padding-bottom: 0; }
}

.layout-horizon .hero { align-items: center; text-align: center; }
.layout-horizon .hero-copy {
  margin: 0 auto;
  max-width: 42rem;
  align-items: center;
}
.layout-horizon .hero-actions { justify-content: center; }
.layout-horizon .hero-scrim {
  background:
    linear-gradient(to top, var(--bg) 5%, transparent 45%),
    linear-gradient(180deg, color-mix(in srgb, var(--bg) 55%, transparent), transparent 50%);
}

.layout-runway .hero { align-items: end; }
.layout-runway .accent-bar {
  position: absolute;
  left: 0; top: 0; bottom: 0;
  width: 6px;
  background: var(--brand);
  z-index: 3;
}
.layout-runway .hero-title {
  font-size: clamp(3.4rem, 12vw, 8rem);
  letter-spacing: -0.05em;
}
.layout-runway .hero-copy { max-width: 70vw; padding-left: calc(var(--pad-x) + 0.5rem); }
.layout-runway .eyebrow { letter-spacing: 0.32em; }

.layout-terminal .hero-title {
  font-family: var(--font-body);
  letter-spacing: -0.04em;
  text-transform: none;
}
.layout-terminal .eyebrow::before {
  content: "> ";
  color: var(--accent);
}
.layout-terminal .proof-band {
  font-family: var(--font-body);
  border-left: 3px solid var(--brand);
}
.layout-terminal .signal {
  border-color: color-mix(in srgb, var(--brand) 35%, var(--line));
}
.layout-terminal .terminal-rail {
  position: absolute;
  right: var(--pad-x);
  bottom: 3rem;
  z-index: 2;
  display: flex;
  flex-direction: column;
  gap: 0.45rem;
  font-size: 0.7rem;
  letter-spacing: 0.2em;
  text-transform: uppercase;
  color: var(--accent);
  opacity: 0.75;
}

.layout-precision .hero-copy {
  max-width: 40rem;
  border-left: 1px solid var(--line);
  padding-left: 1.5rem;
}
.layout-precision .signals-grid {
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 1px;
  background: var(--line);
}
.layout-precision .signal {
  background: var(--bg-elevated);
  border: none;
  margin: 0;
  border-radius: 0;
}

.layout-folio .hero-title {
  font-style: italic;
  font-weight: 600;
}
.layout-folio .proof-line {
  font-family: var(--font-display);
  font-style: italic;
  font-size: clamp(1.35rem, 2.8vw, 1.85rem);
}

.signals-asymmetric {
  display: grid;
  grid-template-columns: 1.55fr 1fr;
  gap: 1.75rem;
  max-width: var(--max);
  margin: 0 auto;
  align-items: stretch;
}
.signals-asymmetric .signal-featured {
  grid-row: span 2;
  position: relative;
  padding: 2.4rem 2rem 2.2rem;
  border: none;
  background:
    linear-gradient(160deg, color-mix(in srgb, var(--brand) 16%, transparent), transparent 58%),
    var(--bg-elevated);
  overflow: hidden;
}
.signals-asymmetric .signal-featured::before {
  content: "";
  position: absolute;
  left: 0; top: 0; bottom: 0;
  width: 3px;
  background: var(--brand);
}
.signals-asymmetric .signal-featured .signal-index {
  font-family: var(--font-display);
  font-size: clamp(3.5rem, 8vw, 6rem);
  line-height: 0.85;
  letter-spacing: -0.04em;
  color: color-mix(in srgb, var(--brand) 55%, transparent);
  margin: 0 0 1.1rem;
  display: block;
}
.signals-asymmetric .signal-featured h3 {
  font-size: clamp(1.7rem, 3.2vw, 2.45rem);
  line-height: 1.05;
  max-width: 12ch;
}
.signals-asymmetric .signal-featured p {
  font-size: 1.05rem;
  max-width: 28rem;
  color: var(--fg);
  opacity: 0.82;
}
.signals-asymmetric .signal-stack {
  display: grid;
  gap: 0;
  border-top: 1px solid var(--line);
}
.signals-asymmetric .signal-stack .signal {
  border: none;
  background: transparent;
  border-bottom: 1px solid var(--line);
  padding: 1.55rem 0.25rem 1.55rem 0;
  display: grid;
  grid-template-columns: 2.5rem 1fr;
  gap: 0.85rem;
  align-items: start;
}
.signals-asymmetric .signal-stack .signal-index {
  font-family: var(--font-display);
  color: var(--brand);
  font-size: 1.15rem;
  line-height: 1.2;
}
@media (max-width: 900px) {
  .signals-asymmetric { grid-template-columns: 1fr; }
  .signals-asymmetric .signal-featured { grid-row: auto; }
}

.image-break {
  position: relative;
  min-height: clamp(16rem, 38vh, 28rem);
  margin: 0.5rem 0 0;
  overflow: hidden;
}
.image-break-media {
  position: absolute; inset: 0;
  background-size: cover;
  background-position: center;
  transform: scale(1.04);
}
.image-break-scrim {
  position: absolute; inset: 0;
  background:
    linear-gradient(to top, var(--bg) 0%, transparent 45%),
    linear-gradient(to right, color-mix(in srgb, var(--bg) 55%, transparent), transparent 50%);
}
.image-break-caption {
  position: absolute;
  left: var(--pad-x);
  bottom: 1.4rem;
  z-index: 2;
  margin: 0;
  font-size: var(--text-caption);
  letter-spacing: 0.2em;
  text-transform: uppercase;
  color: var(--accent);
}

.story {
  padding: 5rem var(--pad-x) 2.5rem;
  display: grid;
  gap: 0;
  max-width: var(--max);
  margin: 0 auto;
}
.chapter {
  display: grid;
  grid-template-columns: minmax(4rem, 8rem) minmax(0, 1fr);
  gap: 1.5rem 2.5rem;
  border-top: 1px solid var(--line);
  padding: 3rem 0;
  max-width: none;
}
.chapter-b {
  grid-template-columns: minmax(0, 1fr) minmax(4rem, 8rem);
}
.chapter-b .chapter-num { order: 2; text-align: right; }
.chapter-b .chapter-body { order: 1; max-width: 36rem; margin-left: auto; }
.chapter-num {
  margin: 0;
  font-family: var(--font-display);
  font-size: clamp(2.8rem, 6vw, 4.5rem);
  line-height: 0.9;
  letter-spacing: -0.04em;
  color: color-mix(in srgb, var(--brand) 70%, var(--fg-muted));
}
.chapter-body h2 {
  font-family: var(--font-display);
  font-size: clamp(1.8rem, 3.5vw, 2.8rem);
  line-height: 1.08;
  margin: 0 0 0.9rem;
  max-width: 16ch;
}
.chapter-body p {
  color: var(--fg-muted);
  margin: 0;
  max-width: 38rem;
  font-size: 1.05rem;
}
@media (max-width: 720px) {
  .chapter,
  .chapter-b {
    grid-template-columns: 1fr;
  }
  .chapter-b .chapter-num,
  .chapter-b .chapter-body { order: unset; text-align: left; margin-left: 0; }
}

.steps-rail {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 0;
  border-top: 1px solid var(--line);
}
.steps-rail .step {
  display: flex;
  flex-direction: column;
  gap: 0.85rem;
  border-top: none;
  border-right: 1px solid var(--line);
  padding: 1.75rem 1.35rem 1.75rem 0;
  min-height: 14rem;
}
.steps-rail .step:last-child { border-right: none; }
.steps-rail .step-index {
  font-size: clamp(2.2rem, 4vw, 3.2rem);
  letter-spacing: -0.03em;
}
.steps-rail .step h3 {
  font-size: clamp(1.35rem, 2.2vw, 1.75rem);
  max-width: 12ch;
}
@media (max-width: 900px) {
  .steps-rail { grid-template-columns: 1fr; }
  .steps-rail .step {
    border-right: none;
    border-bottom: 1px solid var(--line);
    min-height: 0;
    padding: 1.35rem 0;
  }
}

.reveal {
  opacity: 0;
  transform: translateY(22px);
  transition: opacity 0.85s cubic-bezier(0.22, 1, 0.36, 1), transform 0.85s cubic-bezier(0.22, 1, 0.36, 1);
}
.reveal.is-visible {
  opacity: 1;
  transform: translateY(0);
}

.nav.is-scrolled {
  background: color-mix(in srgb, var(--bg) 92%, transparent);
  backdrop-filter: blur(16px);
  border-bottom: 1px solid var(--line);
}

.marquee {
  overflow: hidden;
  border-block: 1px solid var(--line);
  background: color-mix(in srgb, var(--bg-elevated) 70%, transparent);
  padding: 0.95rem 0;
}
.marquee-track {
  display: flex;
  gap: 2.75rem;
  width: max-content;
  animation: marquee 32s linear infinite;
  font-size: var(--text-caption);
  letter-spacing: 0.22em;
  text-transform: uppercase;
  color: var(--fg-muted);
}
.marquee-track span { white-space: nowrap; }
.marquee-track span:nth-child(odd) { color: var(--brand); }

@keyframes marquee {
  from { transform: translateX(0); }
  to { transform: translateX(-50%); }
}

.signal-featured h3 {
  font-size: clamp(1.6rem, 3vw, 2.2rem);
  line-height: 1.15;
}
.signal-featured p {
  font-size: 1.05rem;
  line-height: 1.55;
}

.chapter h2 {
  text-wrap: balance;
}
.proof-line {
  text-wrap: balance;
}

.btn-primary {
  box-shadow: 0 10px 30px color-mix(in srgb, var(--brand) 28%, transparent);
}
.hero::after {
  content: "";
  position: absolute;
  inset: auto 0 0 0;
  height: 28%;
  background: linear-gradient(to top, var(--bg), transparent);
  pointer-events: none;
  z-index: 1;
}
"""


def _esc(value: Any) -> str:
    s = str(value if value is not None else "")
    return s.replace("\\", "\\\\").replace("`", "\\`").replace("${", "\\${")


def _fonts_link(display: str, body: str) -> str:
    d = display.replace(" ", "+")
    b = body.replace(" ", "+")
    return (
        "https://fonts.googleapis.com/css2?family="
        f"{d}:ital,wght@0,400;0,600;0,700;1,400&family={b}:wght@400;500;600&display=swap"
    )


def _pick_layout(spec: dict[str, Any], kit: dict) -> str:
    raw = str(spec.get("layout") or kit.get("layout") or "cinema").strip().lower()
    return raw if raw in _LAYOUTS else "cinema"


def _ensure_features(spec: dict[str, Any], story: str) -> list[dict[str, str]]:
    features = spec.get("features")
    if not isinstance(features, list):
        features = []
    out: list[dict[str, str]] = []
    for i, item in enumerate(features[:3]):
        if not isinstance(item, dict):
            continue
        out.append(
            {
                "label": str(item.get("label") or f"Signal {i + 1}").strip() or f"Signal {i + 1}",
                "detail": str(item.get("detail") or story).strip() or story,
            }
        )
    defaults = [
        ("Clarity", "What we do, who it's for, what changes."),
        ("Craft", "Process you can inspect — no invented proof."),
        ("Next step", "One clear action when you're ready."),
    ]
    while len(out) < 3:
        label, detail = defaults[len(out)]
        out.append({"label": label, "detail": detail})
    return out


def _ensure_steps(spec: dict[str, Any]) -> list[dict[str, str]]:
    steps = spec.get("steps")
    if not isinstance(steps, list):
        steps = []
    out: list[dict[str, str]] = []
    for i, item in enumerate(steps[:3]):
        if not isinstance(item, dict):
            continue
        out.append(
            {
                "label": str(item.get("label") or f"Step {i + 1}").strip() or f"Step {i + 1}",
                "detail": str(item.get("detail") or "").strip() or "Continue.",
            }
        )
    defaults = [
        ("Brief", "Share the outcome you need."),
        ("Shape", "We lock structure, voice, and proof."),
        ("Ship", "You leave with a real site — not a brochure mock."),
    ]
    while len(out) < 3:
        label, detail = defaults[len(out)]
        out.append({"label": label, "detail": detail})
    return out


def _ensure_sections(spec: dict[str, Any], story: str) -> list[dict[str, str]]:
    sections = spec.get("sections")
    if not isinstance(sections, list):
        sections = []
    out: list[dict[str, str]] = []
    for i, sec in enumerate(sections[:3]):
        if not isinstance(sec, dict):
            continue
        out.append(
            {
                "heading": str(sec.get("heading") or f"Chapter {i + 1}").strip() or f"Chapter {i + 1}",
                "body": str(sec.get("body") or story).strip() or story,
            }
        )
    while len(out) < 2:
        out.append({"heading": f"Chapter {len(out) + 1}", "body": story})
    return out


def _hero_block(
    layout: str,
    *,
    brand: str,
    headline: str,
    tagline: str,
    support: str,
    eyebrow: str,
    thesis: str,
    hero: str,
    cta: str,
    cta2: str,
) -> str:
    thesis_line = f'          <p className="hero-thesis">{thesis}</p>\n' if thesis else ""
    media = f'<div className="hero-media" style={{{{ backgroundImage: `url({hero})` }}}} />'

    if layout == "split":
        rail_thesis = f'          <p className="hero-thesis">{thesis}</p>\n' if thesis else ""
        return f"""      <section className="hero" id="top">
        <div className="split-rail">
          <p className="eyebrow">{eyebrow}</p>
          <h1 className="hero-title">{brand}</h1>
{rail_thesis}        </div>
        {media}
        <div className="hero-scrim" />
        <div className="hero-grain" aria-hidden="true" />
        <div className="hero-copy">
          <p className="hero-tag">{headline}</p>
          <p className="hero-support">{tagline}. {support}</p>
          <div className="hero-actions" id="cta">
            <a className="btn-primary" href="#close">{cta}</a>
            <a className="btn-ghost" href="#story">{cta2}</a>
          </div>
        </div>
      </section>"""

    if layout == "runway":
        return f"""      <section className="hero" id="top">
        <div className="accent-bar" aria-hidden="true" />
        {media}
        <div className="hero-scrim" />
        <div className="hero-grain" aria-hidden="true" />
        <div className="hero-copy">
          <p className="eyebrow">{eyebrow}</p>
          <h1 className="hero-title">{headline}</h1>
          <p className="hero-tag">{tagline}</p>
{thesis_line}          <p className="hero-support">{support}</p>
          <div className="hero-actions" id="cta">
            <a className="btn-primary" href="#close">{cta}</a>
            <a className="btn-ghost" href="#story">{cta2}</a>
          </div>
        </div>
      </section>"""

    if layout == "terminal":
        return f"""      <section className="hero" id="top">
        {media}
        <div className="hero-scrim" />
        <div className="hero-grain" aria-hidden="true" />
        <div className="hero-copy">
          <p className="eyebrow">{eyebrow}</p>
          <h1 className="hero-title">{headline}</h1>
          <p className="hero-tag">{tagline}</p>
{thesis_line}          <p className="hero-support">{support}</p>
          <div className="hero-actions" id="cta">
            <a className="btn-primary" href="#close">{cta}</a>
            <a className="btn-ghost" href="#story">{cta2}</a>
          </div>
        </div>
        <div className="terminal-rail" aria-hidden="true">
          <span>verify</span><span>simulate</span><span>refuse</span>
        </div>
      </section>"""

    # cinema / horizon / precision / folio share copy stack; CSS differentiates
    return f"""      <section className="hero" id="top">
        {media}
        <div className="hero-scrim" />
        <div className="hero-grain" aria-hidden="true" />
        <div className="hero-copy">
          <p className="eyebrow">{eyebrow}</p>
          <h1 className="hero-title">{headline}</h1>
          <p className="hero-tag">{tagline}</p>
{thesis_line}          <p className="hero-support">{support}</p>
          <div className="hero-actions" id="cta">
            <a className="btn-primary" href="#close">{cta}</a>
            <a className="btn-ghost" href="#story">{cta2}</a>
          </div>
        </div>
      </section>"""


def _signals_jsx(layout: str, features: list[dict[str, str]], kicker: str, heading: str) -> str:
    if layout == "precision":
        cards = "\n".join(
            f"""        <article className="signal" key="{i}">
          <span className="signal-index">{i + 1:02d}</span>
          <h3>{_esc(f.get("label"))}</h3>
          <p>{_esc(f.get("detail"))}</p>
        </article>"""
            for i, f in enumerate(features)
        )
        return f"""      <section className="signals reveal" id="signals">
        <div className="section-head">
          <p className="section-kicker">{kicker}</p>
          <h2>{heading}</h2>
        </div>
        <div className="signals-grid">
{cards}
        </div>
      </section>"""

    featured, *rest = features
    stack = "\n".join(
        f"""          <article className="signal" key="{i + 1}">
            <span className="signal-index">{i + 2:02d}</span>
            <div>
              <h3>{_esc(f.get("label"))}</h3>
              <p>{_esc(f.get("detail"))}</p>
            </div>
          </article>"""
        for i, f in enumerate(rest)
    )
    return f"""      <section className="signals reveal" id="signals">
        <div className="section-head">
          <p className="section-kicker">{kicker}</p>
          <h2>{heading}</h2>
        </div>
        <div className="signals-asymmetric">
          <article className="signal signal-featured" key="0">
            <span className="signal-index">01</span>
            <h3>{_esc(featured.get("label"))}</h3>
            <p>{_esc(featured.get("detail"))}</p>
          </article>
          <div className="signal-stack">
{stack}
          </div>
        </div>
      </section>"""


def _marquee_words(spec: dict[str, Any], brand: str, eyebrow: str) -> list[str]:
    words: list[str] = []
    for f in spec.get("features") or []:
        if isinstance(f, dict) and f.get("label"):
            words.append(str(f["label"]))
    for s in spec.get("steps") or []:
        if isinstance(s, dict) and s.get("label") and len(words) < 6:
            words.append(str(s["label"]))
    seed = [brand, eyebrow] + words
    cleaned = [w.strip() for w in seed if w and str(w).strip()]
    # Dedupe preserving order
    seen: set[str] = set()
    out: list[str] = []
    for w in cleaned:
        key = w.lower()
        if key in seen:
            continue
        seen.add(key)
        out.append(w)
    while len(out) < 4:
        out.append(brand)
    return out[:6]


def render_app_jsx(spec: dict[str, Any], kit_key: str) -> str:
    key, kit = resolve_kit(kit_key)
    layout = _pick_layout(spec, kit)

    brand = _esc(spec.get("brand") or spec.get("title") or "Brand")
    title = _esc(spec.get("title") or brand)
    tagline = _esc(spec.get("tagline") or "Crafted with intent.")
    support = _esc(spec.get("supporting") or "")
    cta = _esc(spec.get("cta") or "Explore")
    cta2 = _esc(spec.get("cta_secondary") or "Our story")
    hero = _esc(spec.get("hero_image_url") or kit.get("hero_fallback") or "")
    story = _esc(spec.get("story") or support)
    eyebrow = _esc(spec.get("eyebrow") or brand)
    proof = _esc(spec.get("proof_line") or "Built in the open — process you can inspect.")
    thesis = _esc(spec.get("visual_thesis") or "")
    closing = _esc(spec.get("closing") or f"Ready when you are. {brand}.")
    signals_kicker = _esc(spec.get("signals_kicker") or "Offer")
    signals_heading = _esc(spec.get("signals_heading") or "What you get")
    process_kicker = _esc(spec.get("process_kicker") or "Process")
    process_heading = _esc(spec.get("process_heading") or "How we work")

    # Informative H1: prefer title when it differs from brand; else tagline
    headline_raw = str(spec.get("title") or "").strip()
    brand_raw = str(spec.get("brand") or "").strip()
    if headline_raw and headline_raw.lower() != brand_raw.lower():
        headline = title
    else:
        headline = tagline if tagline else title

    features = _ensure_features(spec, str(spec.get("story") or spec.get("supporting") or ""))
    steps = _ensure_steps(spec)
    sections = _ensure_sections(spec, str(spec.get("story") or support or ""))

    step_jsx = "\n".join(
        f"""        <li className="step" key="{i}">
          <span className="step-index">{i + 1:02d}</span>
          <div>
            <h3>{_esc(s.get("label"))}</h3>
            <p>{_esc(s.get("detail"))}</p>
          </div>
        </li>"""
        for i, s in enumerate(steps)
    )
    chap_jsx = "\n".join(
        f"""      <section className="chapter chapter-{'a' if i % 2 == 0 else 'b'} reveal" key="{i}">
        <p className="chapter-num">0{i + 1}</p>
        <div className="chapter-body">
          <h2>{_esc(sec.get("heading"))}</h2>
          <p>{_esc(sec.get("body"))}</p>
        </div>
      </section>"""
        for i, sec in enumerate(sections)
    )

    hero_block = _hero_block(
        layout,
        brand=brand,
        headline=headline,
        tagline=tagline,
        support=support,
        eyebrow=eyebrow,
        thesis=thesis,
        hero=hero,
        cta=cta,
        cta2=cta2,
    )
    signals = _signals_jsx(layout, features, signals_kicker, signals_heading)

    break_img = pick_hero_url(key, index=1)
    if break_img == hero:
        break_img = pick_hero_url(key, index=2)
    if break_img == hero:
        break_img = pick_hero_url(key, index=0)
    break_esc = _esc(break_img)

    mq = _marquee_words(spec, str(spec.get("brand") or brand), str(spec.get("eyebrow") or eyebrow))
    mq_spans = "".join(f"<span>{_esc(w)}</span>" for w in mq)
    mq_track = mq_spans + mq_spans

    return f'''import {{ useEffect }} from 'react'

export default function App() {{
  useEffect(() => {{
    const nav = document.querySelector('.nav')
    const onScroll = () => {{
      if (nav) nav.classList.toggle('is-scrolled', window.scrollY > 24)
    }}
    onScroll()
    window.addEventListener('scroll', onScroll, {{ passive: true }})

    const nodes = Array.from(document.querySelectorAll('.reveal'))
    if (!('IntersectionObserver' in window)) {{
      nodes.forEach((el) => el.classList.add('is-visible'))
      return () => window.removeEventListener('scroll', onScroll)
    }}
    const io = new IntersectionObserver(
      (entries) => {{
        entries.forEach((entry) => {{
          if (entry.isIntersecting) entry.target.classList.add('is-visible')
        }})
      }},
      {{ threshold: 0.12, rootMargin: '0px 0px -6% 0px' }},
    )
    nodes.forEach((el) => io.observe(el))
    return () => {{
      io.disconnect()
      window.removeEventListener('scroll', onScroll)
    }}
  }}, [])

  return (
    <div className="page kit-{_esc(key)} layout-{_esc(layout)}">
      <header className="nav">
        <a className="brand" href="#top">{brand}</a>
        <nav className="nav-links" aria-label="Primary">
          <a href="#proof">Proof</a>
          <a href="#signals">{signals_kicker}</a>
          <a href="#story">Story</a>
          <a href="#process">{process_kicker}</a>
        </nav>
        <a className="nav-cta" href="#close">{cta}</a>
      </header>

{hero_block}

      <div className="marquee" aria-hidden="true">
        <div className="marquee-track">
          {mq_track}
        </div>
      </div>

      <section className="proof-band reveal" id="proof">
        <p className="proof-kicker">Proof</p>
        <p className="proof-line">{proof}</p>
      </section>

{signals}

      <section className="image-break reveal" aria-hidden="true">
        <div className="image-break-media" style={{{{ backgroundImage: `url('{break_esc}')` }}}} />
        <div className="image-break-scrim" />
        <p className="image-break-caption">{eyebrow}</p>
      </section>

      <main id="story" className="story">
{chap_jsx}
      </main>

      <section className="process reveal" id="process">
        <div className="section-head">
          <p className="section-kicker">{process_kicker}</p>
          <h2>{process_heading}</h2>
        </div>
        <ol className="steps steps-rail">
{step_jsx}
        </ol>
      </section>

      <section className="close-band reveal" id="close">
        <p className="section-kicker">Next</p>
        <h2>{closing}</h2>
        <div className="hero-actions">
          <a className="btn-primary" href="#cta">{cta}</a>
          <a className="btn-ghost" href="#story">{cta2}</a>
        </div>
      </section>

      <footer className="footer">
        <div className="brand">{brand}</div>
        <p>© {{new Date().getFullYear()}}</p>
      </footer>
    </div>
  )
}}
'''


def render_index_css(kit_key: str) -> str:
    key, kit = resolve_kit(kit_key)
    tokens = kit["tokens"]
    display, body = kit["fonts"]
    token_lines = "\n".join(f"  {k}: {v};" for k, v in tokens.items())
    font_url = _fonts_link(display, body)

    # f-string body: double braces for literal CSS braces
    base = f"""@import url('{font_url}');

:root {{
{token_lines}
  --font-display: "{display}", Georgia, serif;
  --font-body: "{body}", "Segoe UI", sans-serif;
  --text-hero: clamp(3.2rem, 9vw, 7rem);
  --text-h1: clamp(2rem, 4vw, 3.4rem);
  --text-h2: clamp(1.5rem, 2.8vw, 2.2rem);
  --text-body: 1.125rem;
  --text-caption: 0.75rem;
  --pad-x: clamp(1.25rem, 4vw, 3rem);
  --max: 72rem;
}}

* {{ box-sizing: border-box; }}
html {{ scroll-behavior: smooth; }}
body {{
  margin: 0;
  background: var(--bg);
  color: var(--fg);
  font-family: var(--font-body);
  font-size: var(--text-body);
  line-height: 1.6;
}}

.page {{ min-height: 100vh; overflow-x: hidden; }}

.nav {{
  position: fixed; inset: 0 0 auto 0; z-index: 30;
  display: flex; justify-content: space-between; align-items: center;
  gap: 1rem;
  padding: 1.1rem var(--pad-x);
  background: linear-gradient(to bottom, color-mix(in srgb, var(--bg) 88%, transparent), transparent);
}}
.brand {{
  font-family: var(--font-display);
  font-weight: 700;
  letter-spacing: 0.04em;
  font-size: 1.1rem;
  color: var(--fg);
  text-decoration: none;
}}
.nav-links {{
  display: flex; gap: 1.25rem;
  font-size: var(--text-caption);
  letter-spacing: 0.14em;
  text-transform: uppercase;
}}
.nav-links a {{
  color: var(--fg-muted);
  text-decoration: none;
  transition: color 180ms ease;
}}
.nav-links a:hover {{ color: var(--fg); }}
.nav-cta {{
  color: var(--fg);
  text-decoration: none;
  font-size: var(--text-caption);
  letter-spacing: 0.16em;
  text-transform: uppercase;
  border-bottom: 1px solid var(--brand);
  padding-bottom: 2px;
  transition: color 200ms ease, border-color 200ms ease;
}}
.nav-cta:hover {{ color: var(--accent); border-color: var(--accent); }}

.hero {{
  position: relative;
  min-height: 100vh;
  display: grid;
  align-items: end;
  overflow: hidden;
}}
.hero-media {{
  position: absolute; inset: 0;
  background-size: cover;
  background-position: center;
  transform: scale(1.06);
  animation: heroZoom 14s ease-out forwards;
}}
.hero-scrim {{
  position: absolute; inset: 0;
  background:
    linear-gradient(120deg, color-mix(in srgb, var(--bg) 84%, transparent) 16%, transparent 62%),
    linear-gradient(to top, var(--bg) 6%, transparent 58%);
  pointer-events: none;
}}
.hero-grain {{
  position: absolute; inset: 0; z-index: 1; pointer-events: none; opacity: 0.18;
  background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.55'/%3E%3C/svg%3E");
  mix-blend-mode: overlay;
}}
.hero-copy {{
  position: relative;
  z-index: 2;
  display: flex;
  flex-direction: column;
  padding: 5.5rem var(--pad-x) 4rem;
  max-width: 52rem;
  animation: rise 1.1s ease both;
}}
.eyebrow {{
  font-size: var(--text-caption);
  letter-spacing: 0.22em;
  text-transform: uppercase;
  color: var(--brand);
  margin: 0 0 0.85rem;
}}
.hero-title {{
  font-family: var(--font-display);
  font-size: var(--text-hero);
  line-height: 0.92;
  letter-spacing: -0.03em;
  margin: 0 0 0.85rem;
}}
.hero-tag {{
  font-family: var(--font-display);
  font-size: clamp(1.2rem, 2.4vw, 1.75rem);
  color: var(--accent);
  margin: 0 0 0.65rem;
}}
.hero-thesis {{
  color: var(--fg-muted);
  font-size: 0.95rem;
  letter-spacing: 0.02em;
  margin: 0 0 0.75rem;
  max-width: 34rem;
}}
.hero-support {{
  color: var(--fg-muted);
  max-width: 36rem;
  margin: 0 0 1.7rem;
}}
.hero-actions {{ display: flex; flex-wrap: wrap; gap: 0.85rem; }}

.btn-primary, .btn-ghost {{
  display: inline-flex; align-items: center; justify-content: center;
  min-height: 44px; padding: 0.7rem 1.3rem;
  text-decoration: none; font-weight: 600;
  letter-spacing: 0.04em;
  transition: transform 180ms ease, background 180ms ease, color 180ms ease, border-color 180ms ease;
}}
.btn-primary {{
  background: var(--brand); color: var(--bg); border: 1px solid var(--brand);
}}
.btn-primary:hover {{
  background: var(--accent); border-color: var(--accent); transform: translateY(-1px);
}}
.btn-primary:focus-visible {{ outline: 2px solid var(--accent); outline-offset: 3px; }}
.btn-primary:active {{ transform: translateY(0); }}
.btn-ghost {{
  background: transparent; color: var(--fg); border: 1px solid var(--line);
}}
.btn-ghost:hover {{ border-color: var(--brand); color: var(--brand); }}

.proof-band {{
  padding: 3.2rem var(--pad-x) 3.4rem;
  border-block: 1px solid var(--line);
  background:
    radial-gradient(ellipse at 8% 0%, color-mix(in srgb, var(--brand) 14%, transparent), transparent 50%),
    var(--bg-elevated);
}}
.proof-kicker {{
  margin: 0 auto 0.85rem;
  max-width: var(--max);
  font-size: var(--text-caption);
  letter-spacing: 0.22em;
  text-transform: uppercase;
  color: var(--brand);
}}
.proof-line {{
  margin: 0 auto;
  max-width: var(--max);
  font-family: var(--font-display);
  font-size: clamp(1.55rem, 3.4vw, 2.35rem);
  line-height: 1.28;
  letter-spacing: -0.02em;
  color: var(--fg);
}}

.section-head {{
  max-width: var(--max);
  margin: 0 auto 2.4rem;
}}
.section-kicker {{
  margin: 0 0 0.45rem;
  font-size: var(--text-caption);
  letter-spacing: 0.2em;
  text-transform: uppercase;
  color: var(--brand);
}}
.section-head h2 {{
  margin: 0;
  font-family: var(--font-display);
  font-size: var(--text-h1);
  line-height: 1.1;
  max-width: 18ch;
}}

.signals {{
  padding: 5rem var(--pad-x) 3.5rem;
}}
.signals-grid {{
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 1px;
  max-width: var(--max);
  margin: 0 auto;
  background: var(--line);
}}
.signal {{
  border: none;
  background: var(--bg-elevated);
  padding: 1.6rem 1.35rem;
}}
.signal h3 {{
  margin: 0 0 0.55rem;
  font-family: var(--font-display);
  font-size: 1.25rem;
}}
.signal p {{
  margin: 0;
  color: var(--fg-muted);
  font-size: 0.98rem;
}}
.signals-grid .signal-index {{
  display: block;
  font-family: var(--font-display);
  color: var(--brand);
  font-size: 1.1rem;
  margin-bottom: 0.65rem;
}}

.story {{
  padding: 5rem var(--pad-x) 2.5rem;
  display: grid;
  gap: 0;
  max-width: var(--max);
  margin: 0 auto;
}}
.chapter {{
  border-top: 1px solid var(--line);
  padding: 3rem 0;
}}
.chapter-index {{
  margin: 0 0 0.5rem;
  font-size: var(--text-caption);
  letter-spacing: 0.18em;
  color: var(--brand);
}}
.chapter h2 {{
  font-family: var(--font-display);
  font-size: var(--text-h1);
  line-height: 1.1;
  margin: 0 0 0.8rem;
}}
.chapter p {{ color: var(--fg-muted); margin: 0; }}

.process {{
  padding: 4.5rem var(--pad-x) 4rem;
  background: color-mix(in srgb, var(--bg-elevated) 55%, var(--bg));
  border-top: 1px solid var(--line);
}}
.steps {{
  list-style: none;
  margin: 0 auto;
  padding: 0;
  max-width: var(--max);
  display: grid;
  gap: 1.25rem;
}}
.step {{
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 1.1rem;
  align-items: start;
  border-top: 1px solid var(--line);
  padding-top: 1.15rem;
}}
.step-index {{
  font-family: var(--font-display);
  color: var(--brand);
  font-size: 1.4rem;
  line-height: 1;
}}
.step h3 {{
  margin: 0 0 0.35rem;
  font-family: var(--font-display);
  font-size: var(--text-h2);
}}
.step p {{ margin: 0; color: var(--fg-muted); }}

.close-band {{
  padding: 5.5rem var(--pad-x);
  background:
    radial-gradient(ellipse at 18% 10%, color-mix(in srgb, var(--brand) 22%, transparent), transparent 52%),
    radial-gradient(ellipse at 90% 80%, color-mix(in srgb, var(--accent) 10%, transparent), transparent 45%),
    var(--bg-elevated);
  border-block: 1px solid var(--line);
}}
.close-band h2 {{
  margin: 0 0 1.5rem;
  max-width: 18ch;
  font-family: var(--font-display);
  font-size: clamp(2rem, 4.5vw, 3.4rem);
  line-height: 1.12;
  letter-spacing: -0.02em;
}}

.footer {{
  border-top: 1px solid var(--line);
  padding: 2rem var(--pad-x) 3rem;
  display: flex; justify-content: space-between; gap: 1rem; flex-wrap: wrap;
  color: var(--fg-muted); font-size: 0.9rem;
}}

@keyframes heroZoom {{
  from {{ transform: scale(1.12); }}
  to {{ transform: scale(1.0); }}
}}
@keyframes rise {{
  from {{ opacity: 0; transform: translateY(18px); }}
  to {{ opacity: 1; transform: translateY(0); }}
}}

@media (max-width: 900px) {{
  .nav-links {{ display: none; }}
  .signals-grid {{ grid-template-columns: 1fr; }}
}}
@media (max-width: 720px) {{
  .hero-copy {{ padding-bottom: 3rem; }}
  .layout-precision .signals-grid {{ grid-template-columns: 1fr; }}
}}

@media (prefers-reduced-motion: reduce) {{
  html {{ scroll-behavior: auto; }}
  .hero-media,
  .hero-copy,
  .reveal,
  .btn-primary,
  .btn-ghost {{
    animation: none !important;
    transition: none !important;
  }}
  .hero-media {{ transform: none; }}
  .reveal {{ opacity: 1; transform: none; }}
}}

/* kit:{key} */
"""
    return base + _LAYOUT_CSS


def normalize_spec(data: dict[str, Any], brief: str, brand: str | None) -> dict[str, Any]:
    kit_key, kit = resolve_kit(str(data.get("kit") or ""))
    title = str(data.get("title") or brand or "Untitled").strip()
    brand_name = str(data.get("brand") or brand or title).strip()
    layout_raw = str(data.get("layout") or kit.get("layout") or "cinema").strip().lower()
    layout = layout_raw if layout_raw in _LAYOUTS else str(kit.get("layout") or "cinema")
    hero_index = data.get("hero_image_index")
    try:
        hero_index_i = int(hero_index) if hero_index is not None else None
    except (TypeError, ValueError):
        hero_index_i = None
    hero = pick_hero_url(
        kit_key,
        str(data.get("hero_image_url") or "").strip() or None,
        index=hero_index_i,
    )
    story = str(data.get("story") or data.get("supporting") or brief).strip()
    features = data.get("features") if isinstance(data.get("features"), list) else []
    steps = data.get("steps") if isinstance(data.get("steps"), list) else []
    sections = data.get("sections") if isinstance(data.get("sections"), list) else []
    kit_label = str(kit.get("label") or "")
    eyebrow = str(data.get("eyebrow") or brand_name).strip()
    if eyebrow.lower() == kit_label.lower():
        eyebrow = brand_name
    return {
        "slug": re.sub(r"[^\w-]+", "-", str(data.get("slug") or title).lower()).strip("-")[:48] or "demo",
        "title": title,
        "brand": brand_name,
        "kit": kit_key,
        "layout": layout,
        "visual_thesis": str(data.get("visual_thesis") or "").strip(),
        "eyebrow": eyebrow,
        "tagline": str(data.get("tagline") or "").strip() or "Made to be felt.",
        "supporting": str(data.get("supporting") or brief[:180]).strip(),
        "cta": str(data.get("cta") or "Enter").strip(),
        "cta_secondary": str(data.get("cta_secondary") or "Read the story").strip(),
        "hero_image_url": hero,
        "proof_line": str(data.get("proof_line") or "").strip()
        or "Built in the open — process you can inspect.",
        "story": story,
        "features": features,
        "steps": steps,
        "sections": sections,
        "signals_kicker": str(data.get("signals_kicker") or "Offer").strip() or "Offer",
        "signals_heading": str(data.get("signals_heading") or "What you get").strip() or "What you get",
        "process_kicker": str(data.get("process_kicker") or "Process").strip() or "Process",
        "process_heading": str(data.get("process_heading") or "How we work").strip() or "How we work",
        "closing": str(data.get("closing") or "").strip() or f"Ready when you are. {brand_name}.",
    }
