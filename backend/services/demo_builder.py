"""Build cinematic Vite/React (or static) demos from a free-form brief."""

from __future__ import annotations

import json
import os
import re
import shutil
import subprocess
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from services import llm, vault
from services.demo_design import resolve_kit
from services.llm import LLMOfflineError

DEMOS_ROOT = Path(__file__).resolve().parent.parent / "data" / "generated" / "demos"
ALLOWED_EXT = {".html", ".css", ".js", ".jsx", ".tsx", ".ts", ".json", ".svg", ".md", ".txt"}
MAX_FILES = 24
MAX_FILE_BYTES = 180_000
BUILD_TIMEOUT_SEC = int(os.getenv("DEMO_BUILD_TIMEOUT", "600"))

_BUILD_INTENT = re.compile(
    r"\b("
    r"build\s+(me\s+)?(a\s+|an\s+)?(website|site|landing\s*page|web\s*page|demo(\s+site)?|page)"
    r"|make\s+(me\s+)?(a\s+|an\s+)?(website|site|landing\s*page|demo)"
    r"|create\s+(me\s+)?(a\s+|an\s+)?(website|site|landing\s*page|demo)"
    r"|design\s+(me\s+)?(a\s+|an\s+)?(website|site|landing)"
    r"|spin\s+up\s+(a\s+)?(website|site|landing|demo)"
    r")\b",
    re.I,
)


def is_build_intent(message: str) -> bool:
    return bool(_BUILD_INTENT.search(message or ""))


def demos_root() -> Path:
    DEMOS_ROOT.mkdir(parents=True, exist_ok=True)
    return DEMOS_ROOT


def _slug(text: str, max_len: int = 48) -> str:
    s = re.sub(r"[^\w\s-]", "", (text or "demo").lower())
    s = re.sub(r"[\s_-]+", "-", s).strip("-")
    return (s[:max_len] or "demo").strip("-") or "demo"


def _safe_rel(path: str) -> Path:
    p = Path(str(path).replace("\\", "/").lstrip("/"))
    if p.is_absolute() or ".." in p.parts:
        raise ValueError(f"Illegal path: {path}")
    if p.suffix.lower() not in ALLOWED_EXT and p.name not in {"Dockerfile"}:
        # allow extensionless only for known scaffold names
        if p.name not in {"vite.config.js", "package.json"}:
            raise ValueError(f"Disallowed file type: {path}")
    return p


def _extract_json(text: str) -> dict:
    raw = (text or "").strip()
    if raw.startswith("```"):
        raw = re.sub(r"^```(?:json)?\s*", "", raw)
        raw = re.sub(r"\s*```$", "", raw)
    # Strip trailing commas before } or ]
    cleaned = re.sub(r",\s*([}\]])", r"\1", raw)
    try:
        return json.loads(cleaned)
    except json.JSONDecodeError:
        m = re.search(r"\{[\s\S]*\}", cleaned)
        if not m:
            raise
        chunk = re.sub(r",\s*([}\]])", r"\1", m.group(0))
        return json.loads(chunk)


async def _llm_json(system: str, prompt: str) -> dict:
    import os

    # Prefer the stronger report model for creative direction; fall back to chat default.
    model = (os.getenv("GROQ_REPORT_MODEL") or os.getenv("GROQ_MODEL") or "").strip() or None
    last_err = None
    for attempt in range(2):
        try:
            raw = await llm.chat_completion(
                prompt if attempt == 0 else f"{prompt}\n\nIMPORTANT: Reply with ONLY valid minified JSON. No markdown fences.",
                system=system if attempt == 0 else system + "\nOutput MUST be parseable JSON only.",
                model=model,
                max_tokens=2048,
                temperature=0.55,
            )
            return _extract_json(raw)
        except Exception as exc:
            last_err = exc
            print(f"[demo_builder] JSON attempt {attempt + 1} failed: {exc}")
    raise ValueError(f"LLM did not return valid JSON: {last_err}")


def _meta_path(demo_id: str) -> Path:
    return demos_root() / demo_id / "meta.json"


def list_demos(limit: int = 40) -> list[dict[str, Any]]:
    items = []
    root = demos_root()
    if not root.exists():
        return []
    for child in sorted(root.iterdir(), key=lambda p: p.stat().st_mtime, reverse=True):
        meta = _meta_path(child.name)
        if meta.exists():
            try:
                items.append(json.loads(meta.read_text(encoding="utf-8")))
            except Exception:
                continue
        if len(items) >= limit:
            break
    return items


def get_demo(demo_id: str) -> dict[str, Any] | None:
    meta = _meta_path(demo_id)
    if not meta.exists():
        return None
    return json.loads(meta.read_text(encoding="utf-8"))


def demo_dir(demo_id: str) -> Path:
    return demos_root() / demo_id


def preview_url(demo_id: str) -> str:
    return f"/demos-static/{demo_id}/dist/"


def _write_files(root: Path, files: list[dict[str, str]]) -> list[str]:
    written = []
    for item in files[:MAX_FILES]:
        rel = _safe_rel(item["path"])
        content = item.get("content") or ""
        if len(content.encode("utf-8")) > MAX_FILE_BYTES:
            raise ValueError(f"File too large: {rel}")
        dest = root / rel
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_text(content, encoding="utf-8")
        written.append(str(rel).replace("\\", "/"))
    return written


def _scaffold_vite(project: Path, title: str) -> None:
    """Minimal Vite+React scaffold; LLM fills App.jsx + CSS."""
    (project / "src").mkdir(parents=True, exist_ok=True)
    (project / "public").mkdir(parents=True, exist_ok=True)
    if not (project / "package.json").exists():
        (project / "package.json").write_text(
            json.dumps(
                {
                    "name": _slug(title)[:40] or "jarvis-demo",
                    "private": True,
                    "version": "0.0.1",
                    "type": "module",
                    "scripts": {"dev": "vite", "build": "vite build", "preview": "vite preview"},
                    "dependencies": {"react": "^18.3.1", "react-dom": "^18.3.1"},
                    "devDependencies": {"@vitejs/plugin-react": "^4.3.4", "vite": "^5.4.11"},
                },
                indent=2,
            )
            + "\n",
            encoding="utf-8",
        )
    if not (project / "vite.config.js").exists():
        (project / "vite.config.js").write_text(
            "import { defineConfig } from 'vite'\n"
            "import react from '@vitejs/plugin-react'\n"
            "export default defineConfig({ plugins: [react()], base: './' })\n",
            encoding="utf-8",
        )
    if not (project / "index.html").exists():
        (project / "index.html").write_text(
            f"""<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>{title}</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.jsx"></script>
  </body>
</html>
""",
            encoding="utf-8",
        )
    if not (project / "src" / "main.jsx").exists():
        (project / "src" / "main.jsx").write_text(
            "import React from 'react'\n"
            "import { createRoot } from 'react-dom/client'\n"
            "import App from './App.jsx'\n"
            "import './index.css'\n"
            "createRoot(document.getElementById('root')).render(<App />)\n",
            encoding="utf-8",
        )


def _which_npm() -> str | None:
    return shutil.which("npm") or shutil.which("npm.cmd")


def run_npm_build(project: Path) -> dict[str, Any]:
    npm = _which_npm()
    if not npm:
        return {"ok": False, "error": "npm not found on PATH", "log": ""}
    env = os.environ.copy()
    env["CI"] = "1"
    log_parts = []
    try:
        install = subprocess.run(
            [npm, "install", "--no-fund", "--no-audit"],
            cwd=str(project),
            capture_output=True,
            text=True,
            timeout=BUILD_TIMEOUT_SEC,
            env=env,
            shell=False,
        )
        log_parts.append(install.stdout or "")
        log_parts.append(install.stderr or "")
        if install.returncode != 0:
            return {"ok": False, "error": "npm install failed", "log": "\n".join(log_parts)[-4000:]}
        build = subprocess.run(
            [npm, "run", "build"],
            cwd=str(project),
            capture_output=True,
            text=True,
            timeout=BUILD_TIMEOUT_SEC,
            env=env,
            shell=False,
        )
        log_parts.append(build.stdout or "")
        log_parts.append(build.stderr or "")
        if build.returncode != 0:
            return {"ok": False, "error": "npm run build failed", "log": "\n".join(log_parts)[-4000:]}
        dist = project / "dist"
        if not dist.exists():
            return {"ok": False, "error": "dist/ missing after build", "log": "\n".join(log_parts)[-4000:]}
        return {"ok": True, "log": "\n".join(log_parts)[-2000:]}
    except subprocess.TimeoutExpired:
        return {"ok": False, "error": "npm build timed out", "log": "\n".join(log_parts)[-2000:]}
    except Exception as exc:
        return {"ok": False, "error": str(exc), "log": "\n".join(log_parts)[-2000:]}


def _prepare_jsx_for_cdn(app_jsx: str) -> str:
    """Make Vite App.jsx runnable under Babel classic + React UMD."""
    jsx = app_jsx or ""
    jsx = re.sub(r"^import\s+.+$", "", jsx, flags=re.M)
    jsx = jsx.replace("export default function App", "function App")
    jsx = jsx.replace("export default App", "")
    if "useEffect" in jsx and "const { useEffect }" not in jsx:
        jsx = "const { useEffect } = React;\n" + jsx
    # Drop trailing module export render — CDN bootstraps React.createElement(App)
    return jsx.strip() + "\n"


def _static_fallback(project: Path, title: str, kit_key: str, app_jsx: str, css: str) -> None:
    """If Vite/npm unavailable, emit a cinematic CDN preview that still looks intentional."""
    _, kit = resolve_kit(kit_key)
    display, body = kit["fonts"]
    token_css = "\n".join(f"  {k}: {v};" for k, v in kit["tokens"].items())
    prepared = _prepare_jsx_for_cdn(app_jsx)
    # Avoid nested CSS @import fighting the <link> fonts
    css_body = re.sub(r"^@import url\([^)]+\);\s*", "", css or "", count=1)
    # Escape </script> inside source so the HTML parser doesn't truncate
    prepared_safe = prepared.replace("</script>", "<\\/script>")
    html = f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>{title}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family={display.replace(' ', '+')}:ital,wght@0,400;0,600;0,700;1,400&family={body.replace(' ', '+')}:wght@400;500;600&display=swap" rel="stylesheet" />
  <style>
:root {{
{token_css}
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
{css_body}
  </style>
</head>
<body>
  <div id="root"></div>
  <script crossorigin src="https://unpkg.com/react@18/umd/react.production.min.js"></script>
  <script crossorigin src="https://unpkg.com/react-dom@18/umd/react-dom.production.min.js"></script>
  <script src="https://unpkg.com/@babel/standalone/babel.min.js"></script>
  <script type="text/plain" id="app-src">
{prepared_safe}
  </script>
  <script>
    (function () {{
      var src = document.getElementById('app-src').textContent;
      var out = Babel.transform(src, {{
        presets: [['react', {{ runtime: 'classic' }}]],
        filename: 'App.jsx'
      }});
      // classic runtime → React.createElement (UMD-safe)
      (0, eval)(out.code);
      ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(App));
    }})();
  </script>
</body>
</html>
"""
    out = project / "dist"
    out.mkdir(parents=True, exist_ok=True)
    (out / "index.html").write_text(html, encoding="utf-8")


async def build_demo(
    brief: str,
    *,
    brand: str | None = None,
    framework: str = "vite-react",
) -> dict[str, Any]:
    brief = (brief or "").strip()
    if len(brief) < 8:
        raise ValueError("Brief too short")

    demo_id = uuid.uuid4().hex[:12]
    project = demos_root() / demo_id
    project.mkdir(parents=True, exist_ok=True)

    from services.demo_design import llm_refine_system, llm_system_prompt
    from services.demo_offline import spec_from_brief
    from services.demo_templates import normalize_spec, render_app_jsx, render_index_css

    import os

    offline_used = False
    data: dict[str, Any]
    force_offline = (os.getenv("JARVIS_DEMO_OFFLINE") or "").strip().lower() in {
        "1",
        "true",
        "yes",
        "on",
    }
    if force_offline:
        print("[demo_builder] JARVIS_DEMO_OFFLINE=1 — skipping LLM")
        data = spec_from_brief(brief, brand)
        offline_used = True
    else:
        try:
            gen_system = llm_system_prompt()
            gen_prompt = f"Brief: {brief}\nBrand hint: {brand or '(infer)'}\nPick the best kit for this brief."
            data = await _llm_json(gen_system, gen_prompt)
            try:
                refined = await _llm_json(
                    llm_refine_system(),
                    f"Improve this spec JSON for immersion and clarity:\n{json.dumps(data)[:8000]}",
                )
                if isinstance(refined, dict) and refined.get("title"):
                    data = refined
            except Exception as exc:
                print(f"[demo_builder] refine skipped: {exc}")
        except Exception as exc:
            # Groq/Ollama down — still ship a cinematic kit-driven site
            print(f"[demo_builder] LLM unavailable, using offline spec: {exc}")
            data = spec_from_brief(brief, brand)
            offline_used = True

    spec = normalize_spec(data, brief, brand)
    if offline_used:
        spec["offline"] = True
    kit_key = spec["kit"]
    title = spec["title"]
    slug = spec["slug"]

    _scaffold_vite(project, title)
    files = [
        {"path": "src/App.jsx", "content": render_app_jsx(spec, kit_key)},
        {"path": "src/index.css", "content": render_index_css(kit_key)},
    ]
    written = _write_files(project, files)

    build = run_npm_build(project)
    vite_ok = bool(build.get("ok"))
    degraded = False
    build_ok = vite_ok
    if not vite_ok:
        _static_fallback(
            project,
            title,
            kit_key,
            files[0]["content"],
            files[1]["content"],
        )
        build_ok = (project / "dist" / "index.html").exists()
        degraded = build_ok

    vault_path = None
    try:
        vault_files = list(files)
        for extra in ("package.json", "vite.config.js", "index.html", "src/main.jsx"):
            ep = project / extra
            if ep.is_file():
                vault_files.append({"path": extra, "content": ep.read_text(encoding="utf-8")})
        saved = vault.save_demo_tree(slug, vault_files, title=title, kit=kit_key, brief=brief)
        vault_path = saved.get("relative_path")
    except Exception as exc:
        print(f"[demo_builder] vault mirror failed: {exc}")

    from services.demo_design import resolve_kit as _rk

    _, kit = _rk(kit_key)
    meta = {
        "id": demo_id,
        "slug": slug,
        "title": title,
        "brand": spec["brand"],
        "kit": kit_key,
        "kit_label": kit.get("label"),
        "layout": spec.get("layout"),
        "tokens": kit.get("tokens"),
        "fonts": kit.get("fonts"),
        "brief": brief,
        "framework": framework,
        "files": written,
        "preview_url": preview_url(demo_id),
        "public_url": None,
        "vault_path": vault_path,
        "build_ok": build_ok,
        "degraded": degraded,
        "build_error": None if vite_ok else build.get("error"),
        "build_log_tail": build.get("log", "")[-1500:],
        "created_at": datetime.now(timezone.utc).isoformat(),
        "hero_image_url": spec.get("hero_image_url"),
        "offline": offline_used,
        "spec": spec,
    }
    _meta_path(demo_id).write_text(json.dumps(meta, indent=2), encoding="utf-8")
    return meta


def read_file(demo_id: str, rel: str) -> str:
    path = demo_dir(demo_id) / _safe_rel(rel)
    if not path.exists() or not path.is_file():
        raise FileNotFoundError(rel)
    # stay inside demo root
    path.resolve().relative_to(demo_dir(demo_id).resolve())
    return path.read_text(encoding="utf-8")


def write_file(demo_id: str, rel: str, content: str) -> None:
    root = demo_dir(demo_id).resolve()
    path = (demo_dir(demo_id) / _safe_rel(rel)).resolve()
    path.relative_to(root)
    if len(content.encode("utf-8")) > MAX_FILE_BYTES:
        raise ValueError("File too large")
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8")


def list_source_files(demo_id: str) -> list[str]:
    root = demo_dir(demo_id)
    out = []
    skip = {"node_modules", "dist", ".git"}
    for p in root.rglob("*"):
        if not p.is_file():
            continue
        if any(part in skip for part in p.parts):
            continue
        rel = str(p.relative_to(root)).replace("\\", "/")
        out.append(rel)
    return sorted(out)


def rebuild_demo(demo_id: str) -> dict[str, Any]:
    project = demo_dir(demo_id)
    if not project.exists():
        raise FileNotFoundError(demo_id)
    build = run_npm_build(project)
    meta = get_demo(demo_id) or {"id": demo_id}
    meta["build_ok"] = bool(build.get("ok"))
    meta["degraded"] = False
    meta["build_error"] = None if build.get("ok") else build.get("error")
    meta["build_log_tail"] = (build.get("log") or "")[-1500:]
    meta["preview_url"] = preview_url(demo_id)
    if not build.get("ok"):
        app_jsx = ""
        css = ""
        if (project / "src" / "App.jsx").exists():
            app_jsx = (project / "src" / "App.jsx").read_text(encoding="utf-8")
        if (project / "src" / "index.css").exists():
            css = (project / "src" / "index.css").read_text(encoding="utf-8")
        _static_fallback(project, meta.get("title") or "Demo", meta.get("kit") or "editorial_stone", app_jsx, css)
        meta["build_ok"] = (project / "dist" / "index.html").exists()
        meta["degraded"] = bool(meta["build_ok"])
    _meta_path(demo_id).write_text(json.dumps(meta, indent=2), encoding="utf-8")
    return meta
