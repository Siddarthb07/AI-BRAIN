"""Read-only infrastructure observability routes."""

from fastapi import APIRouter, HTTPException, Query

from services import infra_monitor, uptime_store

router = APIRouter()


@router.get("/status")
async def get_status():
    return infra_monitor.status()


@router.get("/sites")
async def get_sites():
    return {"sites": infra_monitor.sites(), "summary": infra_monitor.status()["sites"]}


@router.get("/sites/{owner}/{repo}/history")
async def get_site_history(owner: str, repo: str, hours: int = Query(24, ge=1, le=24 * 30)):
    target_id = f"{owner}/{repo}"
    if not any(site.get("id") == target_id for site in infra_monitor.sites()):
        raise HTTPException(status_code=404, detail="Monitored Pages site not found")
    return {
        "site_id": target_id,
        "history": uptime_store.history("github_pages", target_id, hours=hours),
        "incidents": uptime_store.incidents("github_pages", target_id, hours=hours),
        "availability": uptime_store.availability("github_pages", target_id, hours=hours),
    }


@router.get("/containers")
async def get_containers():
    return {"containers": infra_monitor.containers(), "summary": infra_monitor.status()["docker"]}


@router.get("/containers/{container_id}/stats")
async def get_container_stats(container_id: str):
    item = next(
        (
            container
            for container in infra_monitor.containers()
            if container.get("id") == container_id or container.get("name") == container_id
        ),
        None,
    )
    if not item:
        raise HTTPException(status_code=404, detail="Container not found")
    return item


@router.get("/containers/{container_id}/logs")
async def get_container_logs(container_id: str, tail: int = Query(100, ge=1, le=500)):
    return await infra_monitor.container_logs(container_id, tail=tail)


@router.post("/poll")
async def poll_now():
    return await infra_monitor.refresh_all(force_discovery=False)


@router.post("/discover")
async def discover_now():
    return await infra_monitor.refresh_all(force_discovery=True)
