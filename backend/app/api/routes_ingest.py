from fastapi import APIRouter, HTTPException

from app.ingestion.external_ingestion import ingest_external
from app.ingestion.github_ingestion import ingest_github_repository, ingest_github_user
from app.models.schemas import GitHubIngestIn, IngestResult

router = APIRouter(tags=["ingestion"])


@router.post("/ingest/github", response_model=IngestResult)
def ingest_github(payload: GitHubIngestIn) -> IngestResult:
    try:
        result = ingest_github_repository(payload.repo)
        return IngestResult(**result)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"GitHub ingestion failed: {exc}") from exc


@router.get("/ingest/external", response_model=IngestResult)
def ingest_external_route() -> IngestResult:
    try:
        result = ingest_external(limit_each=8)
        return IngestResult(**result)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"External ingestion failed: {exc}") from exc


@router.get("/ingest/github/user/{username}", response_model=IngestResult)
def ingest_github_user_route(username: str) -> IngestResult:
    try:
        result = ingest_github_user(username)
        return IngestResult(**result)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"GitHub user ingestion failed: {exc}") from exc
