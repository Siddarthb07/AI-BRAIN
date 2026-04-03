import os
import re
import mimetypes
from pathlib import Path
from typing import List, Dict, Tuple, Optional

# Max chars per file chunk before splitting
CHUNK_SIZE = 3000
CHUNK_OVERLAP = 200

# Local directory scan limits
MAX_LOCAL_FILES = 100
MAX_LOCAL_FILE_SIZE = 100_000  # bytes

LOCAL_CODE_EXTENSIONS = {
    '.py', '.ts', '.tsx', '.js', '.jsx', '.go', '.rs', '.java',
    '.c', '.cpp', '.h', '.cs', '.rb', '.php', '.swift', '.kt',
    '.sql', '.sh', '.bash', '.zsh', '.fish',
    '.md', '.txt', '.rst', '.tex',
    '.yaml', '.yml', '.toml', '.json', '.ini', '.cfg', '.conf',
    '.env', '.env.example', '.dockerfile', '.gitignore',
    '.html', '.css', '.scss', '.sass', '.vue', '.svelte',
    '.ipynb',
}

LOCAL_SKIP_DIRS = {
    'node_modules', '.git', '__pycache__', 'dist', 'build',
    '.next', 'venv', '.venv', 'env', '.env', 'vendor',
    'coverage', '.nyc_output', 'target', '.cache', '.idea',
    '.vscode', 'eggs', '*.egg-info',
}

# ── Text extraction ───────────────────────────────────────────────────

def extract_text_from_bytes(content_bytes: bytes, filename: str) -> str:
    """Extract readable text from various file types."""
    filename_lower = filename.lower()
    ext = Path(filename).suffix.lower()

    # PDF
    if ext == '.pdf':
        return _extract_pdf(content_bytes)

    # DOCX
    if ext in ('.docx', '.doc'):
        return _extract_docx(content_bytes)

    # Jupyter notebook
    if ext == '.ipynb':
        return _extract_notebook(content_bytes)

    # Everything else: decode as text
    for encoding in ('utf-8', 'latin-1', 'cp1252'):
        try:
            return content_bytes.decode(encoding)
        except:
            continue
    return content_bytes.decode('utf-8', errors='replace')

def _extract_pdf(content_bytes: bytes) -> str:
    try:
        import io
        try:
            import pypdf
            reader = pypdf.PdfReader(io.BytesIO(content_bytes))
            return "\n\n".join(page.extract_text() or "" for page in reader.pages)
        except ImportError:
            pass
        try:
            import pdfplumber
            with pdfplumber.open(io.BytesIO(content_bytes)) as pdf:
                return "\n\n".join(page.extract_text() or "" for page in pdf.pages)
        except ImportError:
            pass
    except Exception as e:
        print(f"[LocalIngest] PDF extraction failed: {e}")
    return "[PDF content — install pypdf or pdfplumber for text extraction]"

def _extract_docx(content_bytes: bytes) -> str:
    try:
        import io
        import docx
        doc = docx.Document(io.BytesIO(content_bytes))
        return "\n".join(p.text for p in doc.paragraphs if p.text.strip())
    except ImportError:
        return "[DOCX content — install python-docx for text extraction]"
    except Exception as e:
        return f"[DOCX extraction failed: {e}]"

def _extract_notebook(content_bytes: bytes) -> str:
    try:
        import json
        nb = json.loads(content_bytes)
        cells = nb.get("cells", [])
        parts = []
        for cell in cells:
            ct = cell.get("cell_type", "")
            src = "".join(cell.get("source", []))
            if src.strip():
                parts.append(f"[{ct.upper()}]\n{src}")
        return "\n\n---\n\n".join(parts)
    except Exception as e:
        return f"[Notebook extraction failed: {e}]"

# ── Chunking ──────────────────────────────────────────────────────────

def chunk_text(text: str, chunk_size: int = CHUNK_SIZE, overlap: int = CHUNK_OVERLAP) -> List[str]:
    """Split long text into overlapping chunks for RAG."""
    text = text.strip()
    if not text:
        return []
    if len(text) <= chunk_size:
        return [text]

    chunks = []
    start = 0
    while start < len(text):
        end = start + chunk_size
        # Try to break at a newline
        if end < len(text):
            newline = text.rfind('\n', start, end)
            if newline > start + chunk_size // 2:
                end = newline
        chunks.append(text[start:end].strip())
        start = end - overlap
    return [c for c in chunks if c]

# ── Single file ingest ────────────────────────────────────────────────

def process_uploaded_file(content_bytes: bytes, filename: str) -> List[Dict]:
    """
    Process a single uploaded file into RAG-ready chunks.
    Returns list of {text, metadata} dicts.
    """
    raw_text = extract_text_from_bytes(content_bytes, filename)
    if not raw_text.strip():
        return []

    ext = Path(filename).suffix.lower()
    lang_map = {
        '.py': 'Python', '.ts': 'TypeScript', '.tsx': 'TypeScript/React',
        '.js': 'JavaScript', '.jsx': 'JavaScript/React', '.go': 'Go',
        '.rs': 'Rust', '.java': 'Java', '.md': 'Markdown',
        '.txt': 'Text', '.pdf': 'PDF', '.docx': 'Word Document',
        '.yaml': 'YAML', '.yml': 'YAML', '.json': 'JSON',
        '.sql': 'SQL', '.sh': 'Shell', '.ipynb': 'Jupyter Notebook',
        '.html': 'HTML', '.css': 'CSS',
    }
    file_type = lang_map.get(ext, ext.lstrip('.').upper() or 'Unknown')

    chunks_text = chunk_text(raw_text)
    results = []
    for i, chunk in enumerate(chunks_text):
        results.append({
            "text": f"File: {filename}\nType: {file_type}\nChunk: {i+1}/{len(chunks_text)}\n---\n{chunk}",
            "metadata": {
                "source": f"local:{filename}",
                "type": "local_file",
                "filename": filename,
                "file_type": file_type,
                "chunk_index": i,
                "total_chunks": len(chunks_text),
            }
        })
    return results

# ── Directory scan ────────────────────────────────────────────────────

def scan_local_directory(directory: str) -> List[Dict]:
    """
    Walk a local directory and extract text from all readable files.
    Returns list of {text, metadata} dicts.
    """
    base = Path(directory)
    if not base.exists() or not base.is_dir():
        raise ValueError(f"Directory not found: {directory}")

    results = []
    file_count = 0

    for path in base.rglob("*"):
        if file_count >= MAX_LOCAL_FILES:
            break

        # Skip hidden dirs and known junk
        parts = path.parts
        if any(p.startswith('.') or p in LOCAL_SKIP_DIRS for p in parts):
            continue

        if not path.is_file():
            continue

        ext = path.suffix.lower()
        if ext not in LOCAL_CODE_EXTENSIONS and ext != '':
            continue

        try:
            if path.stat().st_size > MAX_LOCAL_FILE_SIZE:
                continue
            content_bytes = path.read_bytes()
            rel_path = str(path.relative_to(base))
            chunks = process_uploaded_file(content_bytes, rel_path)
            # Override source to mark as directory scan
            for chunk in chunks:
                chunk["metadata"]["source"] = f"local_dir:{directory}/{rel_path}"
                chunk["metadata"]["type"] = "local_dir"
                chunk["metadata"]["directory"] = str(base)
            results.extend(chunks)
            file_count += 1
        except Exception as e:
            print(f"[LocalIngest] Skipping {path}: {e}")

    print(f"[LocalIngest] Scanned {file_count} files from {directory}")
    return results

# ── Paste ingestion ───────────────────────────────────────────────────

def process_paste(text: str, title: str = "Pasted Content", language: str = "text") -> List[Dict]:
    """Process raw pasted text into RAG chunks."""
    text = text.strip()
    if not text:
        return []

    chunks_text = chunk_text(text)
    results = []
    for i, chunk in enumerate(chunks_text):
        results.append({
            "text": f"Pasted: {title}\nLanguage: {language}\nChunk: {i+1}/{len(chunks_text)}\n---\n{chunk}",
            "metadata": {
                "source": f"paste:{title}",
                "type": "paste",
                "title": title,
                "language": language,
                "chunk_index": i,
                "total_chunks": len(chunks_text),
            }
        })
    return results
