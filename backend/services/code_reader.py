import os
import asyncio
import httpx
from typing import List, Dict, Tuple

# Files worth reading for code intelligence
CODE_EXTENSIONS = {
    '.py', '.ts', '.tsx', '.js', '.jsx', '.go', '.rs', '.java',
    '.c', '.cpp', '.h', '.cs', '.rb', '.php', '.swift', '.kt',
    '.md', '.txt', '.yaml', '.yml', '.toml', '.json', '.env.example',
    '.sql', '.sh', '.dockerfile', 'dockerfile',
}

DOTFILE_ALLOW = {'.env.example'}
CREDENTIAL_DENY = {
    '.npmrc', '.netrc', '.pypirc', '.git-credentials', '.dockercfg',
    '.env', '.env.local', '.env.production', '.env.development',
    '.aws', 'credentials', 'id_rsa', 'id_ed25519',
}

# Files/dirs to always skip
SKIP_PATHS = {
    'node_modules', '.git', '__pycache__', 'dist', 'build',
    '.next', 'venv', '.venv', 'env', '.env', 'vendor',
    'coverage', '.nyc_output', 'target', '.cache',
}

MAX_FILE_SIZE = 40_000   # chars per file
MAX_FILES_PER_REPO = 45
MAX_TOTAL_CHARS = 280_000
MAX_MARKDOWN_FILES = 3

# Doc noise that fills the budget on research repos
SKIP_DOC_NAMES = {
    'code_of_conduct.md', 'security.md', 'contributing.md', 'changelog.md',
    'license', 'license.md', 'licence', 'licence.md', 'authors.md',
    'dependabot.yml', 'funding.yml',
}


def _headers():
    h = {"Accept": "application/vnd.github.v3+json", "User-Agent": "JARVIS-Brain/1.0"}
    token = os.getenv("GITHUB_TOKEN", "").strip()
    if token:
        h["Authorization"] = f"Bearer {token}"
    return h

def _should_read(path: str) -> bool:
    parts = path.lower().split('/')
    if any(p in SKIP_PATHS or p in CREDENTIAL_DENY for p in parts):
        return False
    name = parts[-1]
    if name in CREDENTIAL_DENY or name in SKIP_DOC_NAMES:
        return False
    if name.startswith('.') and name not in DOTFILE_ALLOW:
        return False
    ext = '.' + name.rsplit('.', 1)[-1] if '.' in name else name
    return ext in CODE_EXTENSIONS or name in CODE_EXTENSIONS or name in DOTFILE_ALLOW

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

    # Prefer real code/entrypoints; cap nested READMEs so docs don't starve source
    def priority(item):
        p = item["path"].lower()
        name = p.rsplit('/', 1)[-1]
        depth = p.count('/')
        if name in ('main.py', 'app.py', 'server.py', 'index.ts', 'index.js', 'main.go', 'main.rs'):
            return (0, depth, p)
        if name in ('readme.md', 'pyproject.toml', 'package.json', 'requirements.txt', 'cargo.toml', 'setup.py'):
            return (1, depth, p)
        if name.endswith(('.py', '.ts', '.tsx', '.js', '.jsx', '.go', '.rs')):
            return (2, depth, p)
        if name.endswith('.md'):
            return (8, depth, p)
        if depth == 0:
            return (3, depth, p)
        return (4, depth, p)

    readable.sort(key=priority)
    selected = []
    md_count = 0
    for item in readable:
        path = item["path"]
        is_md = path.lower().endswith('.md')
        if is_md:
            if md_count >= MAX_MARKDOWN_FILES:
                continue
            md_count += 1
        selected.append(item)
        if len(selected) >= MAX_FILES_PER_REPO:
            break

    chunks = []
    total_chars = 0
    sem = asyncio.Semaphore(8)

    async def _one(item: Dict):
        async with sem:
            path = item["path"]
            content = await fetch_file_content(owner, repo, path)
            if not content.strip():
                return None
            from services import event_bus

            await event_bus.publish(
                "ingest.file",
                {"owner": owner, "repo": repo, "path": path, "chars": len(content)},
            )
            return {**item, "content": content}

    fetched = await asyncio.gather(*(_one(item) for item in selected))

    for item in fetched:
        if not item or total_chars >= MAX_TOTAL_CHARS:
            continue
        path = item["path"]
        content = item["content"]

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
