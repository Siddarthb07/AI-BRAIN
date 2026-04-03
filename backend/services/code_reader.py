import os
import base64
import httpx
from typing import List, Dict, Tuple

GITHUB_TOKEN = os.getenv("GITHUB_TOKEN", "")

# Files worth reading for code intelligence
CODE_EXTENSIONS = {
    '.py', '.ts', '.tsx', '.js', '.jsx', '.go', '.rs', '.java',
    '.c', '.cpp', '.h', '.cs', '.rb', '.php', '.swift', '.kt',
    '.md', '.txt', '.yaml', '.yml', '.toml', '.json', '.env.example',
    '.sql', '.sh', '.dockerfile', 'dockerfile',
}

# Files/dirs to always skip
SKIP_PATHS = {
    'node_modules', '.git', '__pycache__', 'dist', 'build',
    '.next', 'venv', '.venv', 'env', '.env', 'vendor',
    'coverage', '.nyc_output', 'target', '.cache',
}

MAX_FILE_SIZE = 40_000   # chars per file
MAX_FILES_PER_REPO = 30  # don't blow up the context window
MAX_TOTAL_CHARS = 200_000

def _headers():
    h = {"Accept": "application/vnd.github.v3+json", "User-Agent": "JARVIS-Brain/1.0"}
    if GITHUB_TOKEN:
        h["Authorization"] = f"token {GITHUB_TOKEN}"
    return h

def _should_read(path: str) -> bool:
    parts = path.lower().split('/')
    if any(p in SKIP_PATHS for p in parts):
        return False
    name = parts[-1]
    ext = '.' + name.rsplit('.', 1)[-1] if '.' in name else name
    return ext in CODE_EXTENSIONS or name in CODE_EXTENSIONS

async def fetch_file_tree(owner: str, repo: str) -> List[Dict]:
    """Get full recursive file tree via Git Trees API."""
    try:
        async with httpx.AsyncClient(timeout=20.0) as client:
            # Get default branch
            repo_resp = await client.get(
                f"https://api.github.com/repos/{owner}/{repo}",
                headers=_headers()
            )
            if repo_resp.status_code != 200:
                return []
            branch = repo_resp.json().get("default_branch", "main")

            # Get tree
            tree_resp = await client.get(
                f"https://api.github.com/repos/{owner}/{repo}/git/trees/{branch}",
                headers=_headers(),
                params={"recursive": "1"}
            )
            if tree_resp.status_code != 200:
                return []
            tree = tree_resp.json().get("tree", [])
            return [t for t in tree if t.get("type") == "blob"]
    except Exception as e:
        print(f"[CodeReader] Tree fetch failed {owner}/{repo}: {e}")
    return []

async def fetch_file_content(owner: str, repo: str, path: str) -> str:
    """Fetch raw content of a single file."""
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.get(
                f"https://api.github.com/repos/{owner}/{repo}/contents/{path}",
                headers={**_headers(), "Accept": "application/vnd.github.v3.raw"}
            )
            if resp.status_code == 200:
                text = resp.text
                return text[:MAX_FILE_SIZE]
    except Exception as e:
        print(f"[CodeReader] File fetch failed {path}: {e}")
    return ""

async def deep_ingest_repo(owner: str, repo: str) -> List[Dict]:
    """
    Fetch, filter, and return all readable code files from a repo.
    Returns list of {path, content, language} dicts ready for RAG.
    """
    tree = await fetch_file_tree(owner, repo)
    readable = [t for t in tree if _should_read(t["path"])]

    # Prioritise: entry points, main files, key configs first
    def priority(item):
        p = item["path"].lower()
        if any(k in p for k in ["main.", "app.", "index.", "readme", "requirements", "package.json", "setup.py", "cargo.toml"]):
            return 0
        if p.count('/') == 0:
            return 1   # root level
        if p.count('/') == 1:
            return 2
        return 3

    readable.sort(key=priority)
    readable = readable[:MAX_FILES_PER_REPO]

    chunks = []
    total_chars = 0

    for item in readable:
        if total_chars >= MAX_TOTAL_CHARS:
            break
        path = item["path"]
        content = await fetch_file_content(owner, repo, path)
        if not content.strip():
            continue

        # Determine language from extension
        ext = path.rsplit('.', 1)[-1] if '.' in path else 'text'
        lang_map = {
            'py': 'Python', 'ts': 'TypeScript', 'tsx': 'TypeScript/React',
            'js': 'JavaScript', 'jsx': 'JavaScript/React', 'go': 'Go',
            'rs': 'Rust', 'java': 'Java', 'rb': 'Ruby', 'cs': 'C#',
            'cpp': 'C++', 'c': 'C', 'swift': 'Swift', 'kt': 'Kotlin',
            'sql': 'SQL', 'sh': 'Shell', 'md': 'Markdown',
            'yaml': 'YAML', 'yml': 'YAML', 'json': 'JSON', 'toml': 'TOML',
        }
        language = lang_map.get(ext.lower(), ext.upper())

        # Build enriched chunk for RAG
        chunk_text = (
            f"Repository: {owner}/{repo}\n"
            f"File: {path}\n"
            f"Language: {language}\n"
            f"---\n"
            f"{content}"
        )
        chunks.append({
            "path": path,
            "content": content,
            "language": language,
            "chunk_text": chunk_text,
            "source": f"github:{owner}/{repo}/{path}",
        })
        total_chars += len(content)

    print(f"[CodeReader] {owner}/{repo}: {len(chunks)} files, {total_chars:,} chars ingested")
    return chunks


async def analyse_repo_structure(owner: str, repo: str, chunks: List[Dict]) -> Dict:
    """
    Derive structural insights from the code to enrich the brain graph.
    Returns metadata: imports, dependencies, architecture patterns detected.
    """
    imports = set()
    patterns = set()
    entry_points = []
    file_count_by_lang = {}

    for chunk in chunks:
        path = chunk["path"]
        content = chunk["content"]
        lang = chunk["language"]

        # Count by language
        file_count_by_lang[lang] = file_count_by_lang.get(lang, 0) + 1

        # Detect entry points
        name = path.split('/')[-1].lower()
        if name in ('main.py', 'app.py', 'index.ts', 'index.js', 'main.go', 'main.rs', 'server.py'):
            entry_points.append(path)

        # Extract Python imports
        if lang == 'Python':
            for line in content.split('\n')[:50]:
                line = line.strip()
                if line.startswith('import ') or line.startswith('from '):
                    pkg = line.split()[1].split('.')[0]
                    imports.add(pkg)

        # Detect patterns
        content_lower = content.lower()
        if 'fastapi' in content_lower or 'flask' in content_lower or 'django' in content_lower:
            patterns.add('REST API')
        if 'qdrant' in content_lower or 'chromadb' in content_lower or 'pinecone' in content_lower:
            patterns.add('Vector DB')
        if 'rag' in content_lower or 'retrieval' in content_lower:
            patterns.add('RAG')
        if 'docker' in content_lower or 'dockerfile' in path.lower():
            patterns.add('Docker')
        if 'react' in content_lower or 'nextjs' in content_lower or 'next/app' in content_lower:
            patterns.add('React/Next.js')
        if 'llm' in content_lower or 'ollama' in content_lower or 'groq' in content_lower or 'openai' in content_lower:
            patterns.add('LLM Integration')
        if 'test' in path.lower() or 'pytest' in content_lower or 'jest' in content_lower:
            patterns.add('Tests')
        if 'sqlalchemy' in content_lower or 'postgresql' in content_lower or 'sqlite' in content_lower:
            patterns.add('Database')

    return {
        "file_count": len(chunks),
        "languages": file_count_by_lang,
        "entry_points": entry_points,
        "detected_patterns": list(patterns),
        "key_imports": list(imports)[:20],
    }
