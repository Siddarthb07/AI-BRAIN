"""Read-only GitHub Pages and Docker infrastructure monitoring."""

from __future__ import annotations

import asyncio
import json
import os
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

import httpx

from services import event_bus, github, uptime_store

DATA_DIR = Path(__file__).parent.parent / "data"
SNAPSHOT_PATH = Path(os.getenv("INFRA_DOCKER_SNAPSHOT_PATH") or DATA_DIR / "infra" / "docker_snapshot.json")
PAGES_CACHE_PATH = Path(os.getenv("INFRA_PAGES_CACHE_PATH") or DATA_DIR / "infra" / "pages_sites.json")

_lock = asyncio.Lock()
_sites: list[dict[str, Any]] = []
_containers: list[dict[str, Any]] = []
_last_pages_discovery: float = 0
_last_site_poll: str | None = None
_last_docker_poll: str | None = None
_pages_error: str | None = None
_docker_error: str | None = None
_docker_source = "unavailable"
_poller_task: asyncio.Task | None = None


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _safe_error(exc: Exception) -> str:
    return f"{exc.__class__.__name__}: {str(exc)[:180]}"


def _site_identity(site: dict[str, Any]) -> dict[str, Any]:
    """Strip live probe fields for durable discovery cache."""
    return {
        "id": site.get("id"),
        "owner": site.get("owner"),
        "repo": site.get("repo"),
        "name": site.get("name") or site.get("repo"),
        "url": site.get("url"),
        "status": site.get("pages_status") or site.get("build_status") or "built",
        "discovery": site.get("discovery") or "cache",
        "repo_url": site.get("repo_url"),
        "description": site.get("description"),
        "language": site.get("language"),
        "cname": site.get("cname"),
        "html_url": site.get("html_url"),
    }


def _write_pages_cache(sites: list[dict[str, Any]]) -> None:
    if not sites:
        return
    try:
        PAGES_CACHE_PATH.parent.mkdir(parents=True, exist_ok=True)
        payload = {
            "saved_at": _now_iso(),
            "sites": [_site_identity(site) for site in sites if site.get("id") and site.get("url")],
        }
        temporary = PAGES_CACHE_PATH.with_suffix(".tmp")
        temporary.write_text(json.dumps(payload, indent=2), encoding="utf-8")
        temporary.replace(PAGES_CACHE_PATH)
    except OSError as exc:
        print(f"[infra] pages cache write failed: {_safe_error(exc)}")


def _read_pages_cache() -> list[dict[str, Any]]:
    if not PAGES_CACHE_PATH.exists():
        return []
    try:
        data = json.loads(PAGES_CACHE_PATH.read_text(encoding="utf-8"))
        sites = data.get("sites") or []
        return [site for site in sites if site.get("id") and site.get("url")]
    except (OSError, json.JSONDecodeError) as exc:
        print(f"[infra] pages cache read failed: {_safe_error(exc)}")
        return []


def _sites_from_uptime_history() -> list[dict[str, Any]]:
    recovered: list[dict[str, Any]] = []
    seen_urls: set[str] = set()
    for item in uptime_store.known_targets("github_pages", limit=80):
        target_id = item["id"]
        url = item["url"]
        key = github._normalize_site_url(url)
        if not key or key in seen_urls:
            continue
        seen_urls.add(key)
        repo = target_id.split("/", 1)[-1] if "/" in target_id else target_id
        recovered.append(
            {
                "id": target_id,
                "owner": target_id.split("/", 1)[0] if "/" in target_id else (os.getenv("GITHUB_USERNAME") or "Siddarthb07"),
                "repo": repo,
                "name": repo,
                "url": url,
                "status": "built",
                "discovery": "uptime_history",
            }
        )
    return recovered


def _fallback_pages_sites() -> list[dict[str, Any]]:
    return _read_pages_cache() or _sites_from_uptime_history()


async def discover_pages(force: bool = False) -> list[dict[str, Any]]:
    global _sites, _last_pages_discovery, _pages_error
    ttl = max(60, int(os.getenv("INFRA_PAGES_DISCOVERY_SEC", "1800")))
    if not force and _sites and time.time() - _last_pages_discovery < ttl:
        return _sites
    username = (os.getenv("GITHUB_USERNAME") or "Siddarthb07").strip()
    try:
        sites = await github.discover_user_pages_sites(username)
        if not sites:
            # Rate-limits / transient GitHub failures must not erase a good cache.
            fallback = list(_sites) or _fallback_pages_sites()
            _pages_error = "Pages rediscovery returned no deployments — keeping last known set"
            if fallback:
                async with _lock:
                    if not _sites:
                        _sites = fallback
                    _last_pages_discovery = time.time()
                return list(_sites)
            async with _lock:
                _last_pages_discovery = time.time()
            return []
        async with _lock:
            # Preserve live probe fields when the same site id is rediscovered.
            previous = {item.get("id"): item for item in _sites}
            merged = []
            for site in sites:
                prior = previous.get(site.get("id")) or {}
                merged.append(
                    {
                        **site,
                        "status": prior.get("status") or "unknown",
                        "status_code": prior.get("status_code"),
                        "latency_ms": prior.get("latency_ms"),
                        "checked_at": prior.get("checked_at"),
                        "uptime_24h": prior.get("uptime_24h"),
                        "uptime_7d": prior.get("uptime_7d"),
                        "uptime_streak": prior.get("uptime_streak"),
                        "uptime_human": prior.get("uptime_human"),
                        "uptime_label": prior.get("uptime_label"),
                        "active_incident": prior.get("active_incident"),
                        "incidents": prior.get("incidents") or [],
                    }
                )
            _sites = merged
            _last_pages_discovery = time.time()
            _pages_error = None
        _write_pages_cache(_sites)
        return list(_sites)
    except Exception as exc:
        fallback = list(_sites) or _fallback_pages_sites()
        _pages_error = _safe_error(exc)
        if fallback and not _sites:
            async with _lock:
                _sites = fallback
                _last_pages_discovery = time.time()
        return list(_sites)


async def _probe_site(site: dict[str, Any]) -> dict[str, Any]:
    started = time.perf_counter()
    code = None
    error = None
    try:
        timeout = httpx.Timeout(12.0, connect=6.0)
        async with httpx.AsyncClient(timeout=timeout, follow_redirects=True) as client:
            response = await client.get(
                site["url"],
                headers={"User-Agent": "JARVIS-Uptime/1.0", "Accept": "text/html,*/*"},
            )
        code = response.status_code
        status = "up" if 200 <= code < 400 else "down"
        final_url = str(response.url)
    except Exception as exc:
        status = "down"
        final_url = site["url"]
        error = _safe_error(exc)
    latency = round((time.perf_counter() - started) * 1000, 1)
    result = uptime_store.record_check(
        "github_pages",
        site["id"],
        url=site["url"],
        status=status,
        status_code=code,
        latency_ms=latency,
        detail={"error": error, "final_url": final_url},
    )
    if result.get("transition"):
        await event_bus.publish(
            f"infra.site.{result['transition']}",
            {"entity_id": f"site:{site['id']}", "site_id": site["id"], "url": site["url"]},
        )
    incidents = uptime_store.incidents("github_pages", site["id"], hours=24 * 30, limit=10)
    active = next((item for item in incidents if item.get("ended_at") is None), None)
    streak = uptime_store.current_streak("github_pages", site["id"])
    return {
        **site,
        "status": status,
        "status_code": code,
        "latency_ms": latency,
        "checked_at": result["checked_at"],
        "error": error,
        "final_url": final_url,
        "uptime_24h": uptime_store.availability("github_pages", site["id"], 24),
        "uptime_7d": uptime_store.availability("github_pages", site["id"], 168),
        "uptime_streak": streak,
        "uptime_human": streak.get("human"),
        "uptime_label": streak.get("label"),
        "active_incident": active,
        "incidents": incidents[:5],
    }


async def poll_sites(force_discovery: bool = False) -> list[dict[str, Any]]:
    global _sites, _last_site_poll, _pages_error
    sites = await discover_pages(force=force_discovery)
    if not sites:
        _last_site_poll = _now_iso()
        return []
    semaphore = asyncio.Semaphore(8)

    async def probe(site: dict[str, Any]) -> dict[str, Any]:
        async with semaphore:
            return await _probe_site(site)

    try:
        checked = await asyncio.gather(*(probe(site) for site in sites))
        async with _lock:
            _sites = checked
            _last_site_poll = _now_iso()
            _pages_error = None
        uptime_store.prune(int(os.getenv("INFRA_RETENTION_DAYS", "30")))
    except Exception as exc:
        _pages_error = _safe_error(exc)
    return _sites


def _parse_docker_ts(value: str | None) -> datetime | None:
    if not value or value.startswith("0001-01-01"):
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None


def _container_uptime(state: str, started_at: str | None) -> dict[str, Any]:
    if state != "running":
        return {"seconds": None, "human": None, "label": "STOPPED", "since": None}
    start = _parse_docker_ts(started_at)
    if not start:
        return {"seconds": None, "human": None, "label": "UNKNOWN", "since": started_at}
    seconds = max(0, int((datetime.now(timezone.utc) - start).total_seconds()))
    human = uptime_store.format_duration_seconds(seconds)
    return {"seconds": seconds, "human": human, "label": f"UP {human}", "since": started_at}


def _port_list(attrs: dict[str, Any]) -> list[str]:
    ports = attrs.get("NetworkSettings", {}).get("Ports") or {}
    result: list[str] = []
    for container_port, bindings in ports.items():
        if not bindings:
            result.append(container_port)
            continue
        for binding in bindings:
            host = binding.get("HostPort")
            result.append(f"{host}:{container_port}" if host else container_port)
    return result


def _container_stats(container: Any) -> tuple[float | None, dict[str, Any]]:
    try:
        stats = container.stats(stream=False)
        cpu_stats = stats.get("cpu_stats") or {}
        pre = stats.get("precpu_stats") or {}
        cpu_delta = (cpu_stats.get("cpu_usage", {}).get("total_usage") or 0) - (
            pre.get("cpu_usage", {}).get("total_usage") or 0
        )
        system_delta = (cpu_stats.get("system_cpu_usage") or 0) - (pre.get("system_cpu_usage") or 0)
        cpus = cpu_stats.get("online_cpus") or len(cpu_stats.get("cpu_usage", {}).get("percpu_usage") or []) or 1
        cpu_pct = round((cpu_delta / system_delta) * cpus * 100, 2) if system_delta > 0 and cpu_delta >= 0 else 0.0
        memory = stats.get("memory_stats") or {}
        usage = max(0, (memory.get("usage") or 0) - (memory.get("stats", {}).get("cache") or 0))
        limit = memory.get("limit") or 0
        return cpu_pct, {
            "usage_bytes": usage,
            "limit_bytes": limit,
            "percent": round((usage / limit) * 100, 2) if limit else 0.0,
        }
    except Exception:
        return None, {"usage_bytes": None, "limit_bytes": None, "percent": None}


def _docker_via_proxy() -> list[dict[str, Any]]:
    import docker

    host = os.getenv("DOCKER_HOST", "tcp://docker-proxy:2375")
    client = docker.DockerClient(base_url=host, timeout=8)
    client.ping()
    output: list[dict[str, Any]] = []
    for container in client.containers.list(all=True):
        attrs = container.attrs
        state = attrs.get("State") or {}
        cpu_pct, memory = _container_stats(container) if container.status == "running" else (
            0.0,
            {"usage_bytes": 0, "limit_bytes": 0, "percent": 0.0},
        )
        health_obj = state.get("Health") or {}
        health_status = health_obj.get("Status") if health_obj else None
        # Exited containers often retain a stale "unhealthy" — only live health matters.
        if container.status != "running":
            health = "none"
        elif health_status:
            health = health_status
        else:
            health = "none"
        started_at = state.get("StartedAt")
        uptime = _container_uptime(container.status, started_at)
        output.append(
            {
                "id": container.short_id,
                "name": container.name,
                "image": (attrs.get("Config", {}).get("Image") or "unknown"),
                "state": container.status,
                "health": health,
                "started_at": started_at,
                "finished_at": state.get("FinishedAt"),
                "uptime_seconds": uptime["seconds"],
                "uptime_human": uptime["human"],
                "uptime_label": uptime["label"],
                "ports": _port_list(attrs),
                "cpu_percent": cpu_pct,
                "memory": memory,
                "labels": {
                    key: value
                    for key, value in (attrs.get("Config", {}).get("Labels") or {}).items()
                    if key.startswith("com.docker.compose.")
                },
            }
        )
    return sorted(output, key=lambda item: item["name"].lower())


def _docker_snapshot() -> list[dict[str, Any]]:
    if not SNAPSHOT_PATH.exists():
        return []
    max_age = max(15, int(os.getenv("INFRA_SNAPSHOT_MAX_AGE_SEC", "120")))
    if time.time() - SNAPSHOT_PATH.stat().st_mtime > max_age:
        raise RuntimeError("host collector snapshot is stale")
    data = json.loads(SNAPSHOT_PATH.read_text(encoding="utf-8"))
    return data.get("containers") or []


async def poll_containers() -> list[dict[str, Any]]:
    global _containers, _last_docker_poll, _docker_error, _docker_source
    if os.getenv("DOCKER_MONITOR_ENABLED", "1").lower() in {"0", "false", "off"}:
        _docker_error = "Docker monitoring disabled"
        _docker_source = "disabled"
        return []
    try:
        containers = await asyncio.to_thread(_docker_via_proxy)
        source = "socket_proxy"
        error = None
    except Exception as proxy_exc:
        try:
            containers = await asyncio.to_thread(_docker_snapshot)
            # Snapshot may omit uptime fields — fill from started_at.
            enriched = []
            for item in containers:
                uptime = _container_uptime(item.get("state") or "unknown", item.get("started_at"))
                enriched.append(
                    {
                        **item,
                        "uptime_seconds": item.get("uptime_seconds", uptime["seconds"]),
                        "uptime_human": item.get("uptime_human", uptime["human"]),
                        "uptime_label": item.get("uptime_label", uptime["label"]),
                    }
                )
            containers = enriched
            source = "host_snapshot"
            error = f"proxy unavailable; using snapshot ({_safe_error(proxy_exc)})"
        except Exception as snapshot_exc:
            containers = []
            source = "unavailable"
            error = f"{_safe_error(proxy_exc)}; {_safe_error(snapshot_exc)}"
    async with _lock:
        _containers = containers
        _last_docker_poll = _now_iso()
        _docker_error = error
        _docker_source = source
    return _containers


def _docker_client() -> Any:
    import docker

    client = docker.DockerClient(base_url=os.getenv("DOCKER_HOST", "tcp://docker-proxy:2375"), timeout=8)
    client.ping()
    return client


async def container_logs(container_id: str, tail: int = 100) -> dict[str, Any]:
    bounded = max(1, min(tail, 500))
    try:
        def read() -> str:
            raw = _docker_client().containers.get(container_id).logs(tail=bounded, timestamps=True)
            return raw.decode("utf-8", errors="replace")[-65536:]

        text = await asyncio.to_thread(read)
        return {"container_id": container_id, "tail": bounded, "logs": text, "source": "socket_proxy"}
    except Exception as exc:
        return {"container_id": container_id, "tail": bounded, "logs": "", "source": _docker_source, "error": _safe_error(exc)}


async def refresh_all(force_discovery: bool = False) -> dict[str, Any]:
    await asyncio.gather(poll_sites(force_discovery=force_discovery), poll_containers())
    return status()


def sites() -> list[dict[str, Any]]:
    return list(_sites)


def containers() -> list[dict[str, Any]]:
    return list(_containers)


def status() -> dict[str, Any]:
    up = sum(1 for item in _sites if item.get("status") == "up")
    down = sum(1 for item in _sites if item.get("status") == "down")
    running = sum(1 for item in _containers if item.get("state") == "running")
    unhealthy = sum(
        1
        for item in _containers
        if item.get("state") == "running" and item.get("health") == "unhealthy"
    )
    return {
        "sites": {
            "items": sites(),
            "total": len(_sites),
            "up": up,
            "down": down,
            "unknown": len(_sites) - up - down,
            "last_poll_at": _last_site_poll,
            "last_discovery_at": datetime.fromtimestamp(_last_pages_discovery, timezone.utc).isoformat()
            if _last_pages_discovery
            else None,
            "error": _pages_error,
        },
        "docker": {
            "items": containers(),
            "total": len(_containers),
            "running": running,
            "unhealthy": unhealthy,
            "source": _docker_source,
            "last_poll_at": _last_docker_poll,
            "error": _docker_error,
        },
    }


async def _poll_loop() -> None:
    site_interval = max(15, int(os.getenv("INFRA_SITE_POLL_SEC", "60")))
    docker_interval = max(5, int(os.getenv("INFRA_DOCKER_POLL_SEC", "10")))
    # Give Docker DNS a moment after boot before the first GitHub discovery.
    await asyncio.sleep(5)
    next_site = 0.0
    while True:
        now = time.monotonic()
        tasks = [poll_containers()]
        if now >= next_site:
            tasks.append(poll_sites(force_discovery=not _sites))
            next_site = now + site_interval
        await asyncio.gather(*tasks, return_exceptions=True)
        await asyncio.sleep(docker_interval)


def start_poller() -> None:
    global _poller_task
    if _poller_task is None or _poller_task.done():
        _poller_task = asyncio.create_task(_poll_loop(), name="jarvis-infra-monitor")


async def stop_poller() -> None:
    global _poller_task
    if _poller_task and not _poller_task.done():
        _poller_task.cancel()
        try:
            await _poller_task
        except asyncio.CancelledError:
            pass
    _poller_task = None
