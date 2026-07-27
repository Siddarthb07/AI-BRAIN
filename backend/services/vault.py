"""Local Obsidian-style vault: save markdown to disk and index for RAG."""

from __future__ import annotations

import os
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

VAULT_SUBROOT = "JARVIS"
FOLDERS = ("Chat", "Briefs", "Generated", "Inbox", "Projects", "Logs")

_SKIP_DIRS = {".obsidian", ".git", ".trash", "node_modules", "__pycache__"}


def _default_vault_root() -> Path:
    """Prefer Desktop/jarvis-vault (OneDrive Desktop on this machine)."""
    desktop = Path.home() / "OneDrive" / "Desktop" / "jarvis-vault"
    if desktop.parent.exists():
        return desktop
    return Path.home() / "Desktop" / "jarvis-vault"


def _vault_root() -> Path:
    raw = (os.getenv("VAULT_PATH") or os.getenv("OBSIDIAN_VAULT_PATH") or "").strip()
    if raw:
        root = Path(raw).expanduser()
    else:
        root = _default_vault_root()
    root = root.resolve()
    root.mkdir(parents=True, exist_ok=True)
    for folder in FOLDERS:
        (root / VAULT_SUBROOT / folder).mkdir(parents=True, exist_ok=True)
    return root


def _slug(title: str, max_len: int = 60) -> str:
    s = re.sub(r"[^\w\s-]", "", title.lower())
    s = re.sub(r"[\s_-]+", "-", s).strip("-")
    return (s[:max_len] or "note").strip("-") or "note"


def _safe_relative(path: str) -> Path:
    """Reject path traversal."""
    p = Path(path.replace("\\", "/").strip("/"))
    if p.is_absolute() or ".." in p.parts:
        raise ValueError("Invalid path")
    return p


def vault_status() -> dict[str, Any]:
    root = _vault_root()
    jarvis = root / VAULT_SUBROOT
    md_files = list(jarvis.rglob("*.md")) if jarvis.exists() else []
    return {
        "vault_path": str(root),
        "jarvis_path": str(jarvis),
        "configured": bool(os.getenv("VAULT_PATH") or os.getenv("OBSIDIAN_VAULT_PATH")),
        "note_count": len(md_files),
        "folders": FOLDERS,
        "auto_save": os.getenv("AUTO_SAVE_VAULT", "0") == "1",
    }


def save_markdown(
    content: str,
    *,
    title: str | None = None,
    folder: str = "Chat",
    tags: list[str] | None = None,
    source: str = "jarvis",
    extra_frontmatter: dict[str, str] | None = None,
) -> dict[str, Any]:
    root = _vault_root()
    if folder not in FOLDERS:
        folder = "Inbox"

    now = datetime.now(timezone.utc)
    stamp = now.strftime("%Y-%m-%d")
    time_id = now.strftime("%H%M%S")
    title = (title or _infer_title(content)).strip() or "Untitled"
    slug = _slug(title)
    filename = f"{stamp}-{time_id}-{slug}.md"
    dest_dir = root / VAULT_SUBROOT / folder
    dest_dir.mkdir(parents=True, exist_ok=True)
    dest = dest_dir / filename

    tag_list = tags or []
    fm_lines = [
        "---",
        f"title: {title}",
        f"created: {now.isoformat()}",
        f"source: {source}",
        f"tags: [{', '.join(tag_list)}]" if tag_list else "tags: []",
    ]
    if extra_frontmatter:
        for k, v in extra_frontmatter.items():
            fm_lines.append(f"{k}: {v}")
    fm_lines.append("---")
    fm_lines.append("")

    body = content.strip()
    if not body.startswith("#"):
        body = f"# {title}\n\n{body}"

    dest.write_text("\n".join(fm_lines) + body + "\n", encoding="utf-8")
    return {
        "path": str(dest),
        "relative_path": str(dest.relative_to(root)),
        "folder": folder,
        "title": title,
        "bytes": dest.stat().st_size,
    }


def _infer_title(content: str) -> str:
    for line in content.splitlines():
        line = line.strip()
        if line.startswith("# "):
            return line[2:].strip()
    first = content.strip().splitlines()[0][:80] if content.strip() else "Note"
    return first.rstrip(".")


def list_notes(limit: int = 50, folder: str | None = None) -> list[dict[str, Any]]:
    root = _vault_root()
    base = root / VAULT_SUBROOT
    if folder and folder in FOLDERS:
        base = base / folder
    if not base.exists():
        return []

    notes = []
    for path in sorted(base.rglob("*.md"), key=lambda p: p.stat().st_mtime, reverse=True):
        if any(part in _SKIP_DIRS for part in path.parts):
            continue
        try:
            stat = path.stat()
            notes.append(
                {
                    "path": str(path),
                    "relative_path": str(path.relative_to(root)),
                    "title": path.stem,
                    "folder": path.parent.name,
                    "modified": datetime.fromtimestamp(stat.st_mtime, tz=timezone.utc).isoformat(),
                    "bytes": stat.st_size,
                }
            )
        except OSError:
            continue
        if len(notes) >= limit:
            break
    return notes


def read_note(relative_path: str) -> dict[str, Any]:
    root = _vault_root()
    rel = _safe_relative(relative_path)
    path = (root / rel).resolve()
    if not str(path).startswith(str(root)):
        raise ValueError("Path outside vault")
    if not path.is_file():
        raise FileNotFoundError(relative_path)
    text = path.read_text(encoding="utf-8", errors="replace")
    return {"path": str(path), "relative_path": str(rel), "content": text}


async def sync_vault_to_rag() -> dict[str, Any]:
    from services import rag, store
    from services.local_ingest import chunk_text

    root = _vault_root()
    jarvis = root / VAULT_SUBROOT
    indexed = 0
    skipped = 0

    for path in jarvis.rglob("*.md"):
        if any(part in _SKIP_DIRS for part in path.parts):
            continue
        try:
            text = path.read_text(encoding="utf-8", errors="replace")
        except OSError:
            skipped += 1
            continue
        if len(text.strip()) < 20:
            skipped += 1
            continue
        rel = str(path.relative_to(root))
        for i, chunk in enumerate(chunk_text(text)):
            meta = {
                "source": "vault",
                "path": rel,
                "chunk": i,
                "title": path.stem,
            }
            await rag.add_document(chunk, meta)
            store.increment_knowledge()
            indexed += 1

    return {"indexed_chunks": indexed, "skipped_files": skipped, "vault_path": str(root)}


def extract_code_artifacts(content: str) -> list[dict[str, str]]:
    """Parse fenced code blocks into saveable files under Generated/."""
    pattern = re.compile(r"```(\w+)?\s*\n([\s\S]*?)```", re.MULTILINE)
    artifacts = []
    for i, match in enumerate(pattern.finditer(content)):
        lang = (match.group(1) or "txt").lower()
        code = match.group(2).strip()
        if len(code) < 10:
            continue
        ext_map = {
            "python": "py",
            "py": "py",
            "javascript": "js",
            "js": "js",
            "typescript": "ts",
            "ts": "ts",
            "tsx": "tsx",
            "jsx": "jsx",
            "json": "json",
            "yaml": "yaml",
            "yml": "yaml",
            "bash": "sh",
            "shell": "sh",
            "markdown": "md",
            "md": "md",
        }
        ext = ext_map.get(lang, lang if len(lang) <= 4 else "txt")
        artifacts.append({"filename": f"artifact-{i + 1}.{ext}", "content": code, "language": lang})
    return artifacts
