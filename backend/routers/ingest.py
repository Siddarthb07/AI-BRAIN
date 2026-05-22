from fastapi import APIRouter, BackgroundTasks, UploadFile, File, HTTPException
from pydantic import BaseModel
from typing import Optional, List
from services import store, github as gh_service, hn as hn_service, rag
from services import code_reader, local_ingest as li

router = APIRouter()

class RepoPayload(BaseModel):
    owner: str
    repo: str
    deep: bool = True

class DirectoryPayload(BaseModel):
    path: str

class PastePayload(BaseModel):
    text: str
    title: Optional[str] = "Pasted Content"
    language: Optional[str] = "text"

async def _ingest_repo_bg(owner: str, repo: str, deep: bool = True):
    repo_data = await gh_service.fetch_repo(owner, repo)
    if not repo_data:
        repo_data = {"name": repo, "description": f"Repository by {owner}",
            "language": "Unknown", "topics": [], "stars": 0,
            "owner": owner, "url": f"https://github.com/{owner}/{repo}"}
    store.add_repo(repo_data)

    readme = await gh_service.fetch_readme(owner, repo)
    base_text = gh_service.build_repo_text(repo_data) + "\n\n" + readme[:2000]
    await rag.add_document(base_text, {"source": f"github:{owner}/{repo}", "type": "repo_meta", "name": repo, "owner": owner})
    store.increment_knowledge()

    if deep:
        print(f"[Ingest] Deep reading code for {owner}/{repo}...")
        chunks = await code_reader.deep_ingest_repo(owner, repo)
        structure = await code_reader.analyse_repo_structure(owner, repo, chunks)

        struct_text = (
            f"Repository structure analysis: {owner}/{repo}\n"
            f"Files read: {structure['file_count']}\n"
            f"Languages: {', '.join(f'{k}({v})' for k,v in structure['languages'].items())}\n"
            f"Detected patterns: {', '.join(structure['detected_patterns'])}\n"
            f"Entry points: {', '.join(structure['entry_points'])}\n"
            f"Key imports: {', '.join(structure['key_imports'])}"
        )
        await rag.add_document(struct_text, {"source": f"github:{owner}/{repo}:structure",
            "type": "repo_structure", "name": repo, "owner": owner,
            "patterns": structure["detected_patterns"]})
        store.increment_knowledge()

        enriched = {**repo_data, "patterns": structure["detected_patterns"], "file_count": structure["file_count"]}
        store.add_repo(enriched)

        for chunk in chunks:
            await rag.add_document(chunk["chunk_text"], {"source": chunk["source"],
                "type": "code_file", "name": repo, "owner": owner,
                "path": chunk["path"], "language": chunk["language"]})
            store.increment_knowledge()

        print(f"[Ingest] Done: {owner}/{repo} -- {len(chunks)} files")

@router.post("/github")
async def ingest_single_repo(payload: RepoPayload, background_tasks: BackgroundTasks):
    background_tasks.add_task(_ingest_repo_bg, payload.owner, payload.repo, payload.deep)
    return {"status": "ingesting", "repo": f"{payload.owner}/{payload.repo}", "deep_code_read": payload.deep}

@router.get("/github/user/{username}")
async def ingest_user_repos(username: str, background_tasks: BackgroundTasks, deep: bool = True):
    repos = await gh_service.fetch_user_repos(username)
    store.set_repos(repos)

    async def ingest_all():
        for repo in repos:
            await _ingest_repo_bg(repo.get("owner", username), repo["name"], deep=deep)

    background_tasks.add_task(ingest_all)
    return {"status": "ingesting", "username": username, "repo_count": len(repos),
            "deep_code_read": deep, "repos": repos}

@router.get("/external")
async def ingest_external():
    stories = await hn_service.fetch_top_stories(limit=15)
    store.set_hn_stories(stories)
    for story in stories[:5]:
        text = f"HN: {story['title']} (score: {story['score']}) by {story.get('by', 'unknown')}"
        await rag.add_document(text, {"source": "hackernews", "type": "news", "url": story.get("url", "")})
    return {"status": "ok", "stories": len(stories),
            "top": [{"title": s["title"], "score": s["score"], "url": s.get("url", ""), "by": s.get("by", "")} for s in stories[:8]]}

@router.post("/local/upload")
async def ingest_file_upload(files: List[UploadFile] = File(...)):
    results = []
    for file in files:
        try:
            content_bytes = await file.read()
            if not content_bytes:
                results.append({"file": file.filename, "status": "empty", "chunks": 0})
                continue
            chunks = li.process_uploaded_file(content_bytes, file.filename or "upload")
            for chunk in chunks:
                await rag.add_document(chunk["text"], chunk["metadata"])
                store.increment_knowledge()
            results.append({"file": file.filename, "status": "ok", "chunks": len(chunks),
                "size_kb": round(len(content_bytes) / 1024, 1)})
        except Exception as e:
            results.append({"file": file.filename, "status": f"error: {e}", "chunks": 0})
    return {"status": "ok", "files_processed": len(results),
            "total_chunks": sum(r.get("chunks", 0) for r in results), "results": results}

@router.post("/local/directory")
async def ingest_directory(payload: DirectoryPayload, background_tasks: BackgroundTasks):
    import os
    path = payload.path.strip()
    if not os.path.exists(path):
        raise HTTPException(status_code=400, detail=f"Path does not exist: {path}")
    if not os.path.isdir(path):
        raise HTTPException(status_code=400, detail=f"Not a directory: {path}")

    async def _scan_bg():
        try:
            chunks = li.scan_local_directory(path)
            for chunk in chunks:
                await rag.add_document(chunk["text"], chunk["metadata"])
                store.increment_knowledge()
            print(f"[Ingest] Dir scan done: {path} -- {len(chunks)} chunks")
        except Exception as e:
            print(f"[Ingest] Dir scan failed: {e}")

    background_tasks.add_task(_scan_bg)
    return {"status": "scanning", "path": path, "message": "Directory scan started in background"}

@router.post("/local/paste")
async def ingest_paste(payload: PastePayload):
    if not payload.text.strip():
        raise HTTPException(status_code=400, detail="Empty text")
    chunks = li.process_paste(payload.text, payload.title or "Pasted Content", payload.language or "text")
    for chunk in chunks:
        await rag.add_document(chunk["text"], chunk["metadata"])
        store.increment_knowledge()
    return {"status": "ok", "title": payload.title, "chunks": len(chunks), "chars": len(payload.text)}

@router.get("/status")
async def ingest_status():
    stats = store.get_stats()
    return {"repos_loaded": stats["repos"], "hn_stories": stats["hn_stories"],
            "knowledge_docs": stats["knowledge_docs"], "active_project": stats["active_project"],
            "repos": store.get_repos(), "local_docs": rag.get_recent_local_documents(limit=12)}
