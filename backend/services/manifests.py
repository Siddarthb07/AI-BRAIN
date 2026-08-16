"""Parse package manifests and declared env names (names only, never values)."""

from __future__ import annotations

import json
import re
from typing import Any

_REQ = re.compile(r"^(?P<name>[A-Za-z0-9_.-]+)(?P<ver>\s*[<>=!~][^;#]+)?")
_ENV_ASSIGN = re.compile(r"^([A-Z][A-Z0-9_]{2,})\s*=")
_GETENV = re.compile(
    r"""(?:os\.getenv|os\.environ(?:\.get)?|process\.env)\s*[\(\[]?\s*['\"]([A-Z][A-Z0-9_]{2,})['\"]""",
    re.I,
)
_SECRET_YAML = re.compile(r"secrets\.([A-Z][A-Z0-9_]{2,})")

LIB_COLORS = {
    "fastapi": "#00d4ff",
    "flask": "#ffb800",
    "django": "#33f0c0",
    "qdrant": "#9af6ff",
    "openai": "#7fdfff",
    "groq": "#ff4d6d",
    "next": "#eaffff",
    "react": "#61dafb",
    "numpy": "#4dabf7",
    "torch": "#ee4c2c",
}


def parse_requirements(text: str) -> dict[str, str]:
    out: dict[str, str] = {}
    for raw in (text or "").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or line.startswith("-"):
            continue
        m = _REQ.match(line)
        if m:
            out[m.group("name").lower()] = (m.group("ver") or "").strip() or "*"
    return out


def parse_package_json(text: str) -> dict[str, str]:
    try:
        data = json.loads(text or "{}")
    except json.JSONDecodeError:
        return {}
    out: dict[str, str] = {}
    for key in ("dependencies", "devDependencies", "peerDependencies", "optionalDependencies"):
        block = data.get(key) or {}
        if isinstance(block, dict):
            for name, ver in block.items():
                out[str(name).lower()] = str(ver)
    return out


def parse_pyproject(text: str) -> dict[str, str]:
    out: dict[str, str] = {}
    in_deps = False
    for raw in (text or "").splitlines():
        line = raw.strip()
        if line.startswith("[") and "dependencies" in line.lower():
            in_deps = True
            continue
        if line.startswith("[") and in_deps:
            in_deps = False
        if not in_deps:
            m = re.search(r"['\"]([A-Za-z0-9_.-]+)([<>=!~][^'\"]+)?['\"]", line)
            if "dependencies" in (text[:200] if False else "") and m:
                pass
        if in_deps:
            m = re.match(r"['\"]?([A-Za-z0-9_.-]+)['\"]?\s*[=:]\s*['\"]?([^'\"]+)", line)
            if m and m.group(1).lower() not in {"python"}:
                out[m.group(1).lower()] = m.group(2).strip().strip(",") or "*"
            else:
                m2 = re.match(r"['\"]([A-Za-z0-9_.-]+)([<>=!~][^'\"]*)['\"]", line)
                if m2:
                    out[m2.group(1).lower()] = (m2.group(2) or "*").strip() or "*"
    return out


def parse_env_example(text: str) -> list[str]:
    names: list[str] = []
    seen = set()
    for raw in (text or "").splitlines():
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        m = _ENV_ASSIGN.match(line)
        if m:
            name = m.group(1)
            if name not in seen:
                seen.add(name)
                names.append(name)
    return names


def parse_getenv_names(text: str) -> list[str]:
    names = []
    seen = set()
    for m in _GETENV.finditer(text or ""):
        name = m.group(1).upper()
        if name not in seen:
            seen.add(name)
            names.append(name)
    for m in _SECRET_YAML.finditer(text or ""):
        name = m.group(1).upper()
        if name not in seen:
            seen.add(name)
            names.append(name)
    return names


def parse_file(path: str, content: str) -> dict[str, Any]:
    p = (path or "").replace("\\", "/").lower()
    name = p.rsplit("/", 1)[-1]
    deps: dict[str, str] = {}
    env_names: list[str] = []
    if name == "requirements.txt" or name.startswith("requirements") and name.endswith(".txt"):
        deps = parse_requirements(content)
    elif name == "package.json":
        deps = parse_package_json(content)
    elif name == "pyproject.toml":
        deps = parse_pyproject(content)
    elif name == ".env.example":
        env_names = parse_env_example(content)
    else:
        env_names = parse_getenv_names(content)[:24]
        if name.endswith(".py") or name.endswith(".js") or name.endswith(".ts"):
            env_names = parse_getenv_names(content)[:24]
    return {"deps": deps, "env_names": env_names}


def merge_inventory(chunks: list[dict]) -> dict[str, Any]:
    deps: dict[str, str] = {}
    env: list[str] = []
    seen_env = set()
    for chunk in chunks or []:
        parsed = parse_file(chunk.get("path") or "", chunk.get("content") or "")
        deps.update(parsed["deps"])
        for n in parsed["env_names"]:
            if n not in seen_env:
                seen_env.add(n)
                env.append(n)
    return {"key_deps": deps, "required_env": env[:40]}
