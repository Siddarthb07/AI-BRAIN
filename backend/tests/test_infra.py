import asyncio
import json

from services import github, infra_monitor, uptime_store


def test_uptime_history_and_incident_lifecycle(tmp_path, monkeypatch):
    monkeypatch.setattr(uptime_store, "DB_PATH", tmp_path / "uptime.db")
    uptime_store._init()

    first = uptime_store.record_check(
        "github_pages",
        "Siddarthb07/example",
        url="https://example.test",
        status="down",
        status_code=503,
        checked_at="2026-08-07T10:00:00+00:00",
    )
    recovered = uptime_store.record_check(
        "github_pages",
        "Siddarthb07/example",
        url="https://example.test",
        status="up",
        status_code=200,
        checked_at="2026-08-07T10:01:00+00:00",
    )

    assert first["transition"] == "down"
    assert recovered["transition"] == "recovered"
    rows = uptime_store.incidents("github_pages", "Siddarthb07/example", hours=24 * 365)
    assert len(rows) == 1
    assert rows[0]["ended_at"] == "2026-08-07T10:01:00+00:00"


def test_availability_does_not_treat_unknown_time_as_down(tmp_path, monkeypatch):
    monkeypatch.setattr(uptime_store, "DB_PATH", tmp_path / "uptime.db")
    uptime_store._init()
    for index, status in enumerate(("up", "up", "down", "degraded")):
        uptime_store.record_check(
            "github_pages",
            "site",
            url="https://example.test",
            status=status,
            checked_at=f"2026-08-07T10:0{index}:00+00:00",
        )
    result = uptime_store.availability("github_pages", "site", hours=24 * 365)
    assert result["observed_checks"] == 4
    assert result["uptime_pct"] == 75.0


def test_pages_discovery_uses_pages_api_and_dedupes_urls(monkeypatch):
    async def repos(_username):
        return [
            {"name": "one", "has_pages": True, "homepage": "", "url": "https://github.com/u/one"},
            {
                "name": "portfolio",
                "has_pages": False,
                "homepage": "https://u.github.io/portfolio",
                "url": "https://github.com/u/portfolio",
            },
            {
                "name": "two",
                "has_pages": True,
                "homepage": "https://u.github.io/portfolio",
                "url": "https://github.com/u/two",
            },
        ]

    async def pages(_owner, repo):
        if repo == "one":
            return {
                "id": "u/one",
                "owner": "u",
                "repo": "one",
                "url": "https://u.github.io/one/",
                "status": "built",
                "discovery": "pages_api",
            }
        if repo == "two":
            # Same live URL as another repo — should collapse to one card.
            return {
                "id": "u/two",
                "owner": "u",
                "repo": "two",
                "url": "https://u.github.io/one/",
                "status": "built",
                "discovery": "pages_api",
            }
        return None

    monkeypatch.setattr(github, "fetch_user_repos", repos)
    monkeypatch.setattr(github, "fetch_repo_pages", pages)
    sites = asyncio.run(github.discover_user_pages_sites("u"))
    assert len(sites) == 1
    assert sites[0]["url"] == "https://u.github.io/one/"
    assert sites[0]["repo"] == "one"


def test_current_streak_reports_up_for_duration(tmp_path, monkeypatch):
    monkeypatch.setattr(uptime_store, "DB_PATH", tmp_path / "uptime.db")
    uptime_store._init()
    uptime_store.record_check(
        "github_pages",
        "site",
        url="https://example.test",
        status="up",
        checked_at="2026-08-07T10:00:00+00:00",
    )
    streak = uptime_store.current_streak("github_pages", "site")
    assert streak["state"] == "up"
    assert streak["since"] == "2026-08-07T10:00:00+00:00"
    assert streak["label"].startswith("UP FOR")
    assert streak["human"]


def test_container_uptime_from_started_at():
    running = infra_monitor._container_uptime("running", "2026-08-07T10:00:00+00:00")
    stopped = infra_monitor._container_uptime("exited", "2026-08-07T10:00:00+00:00")
    assert running["label"].startswith("UP ")
    assert running["human"]
    assert running["seconds"] is not None and running["seconds"] >= 0
    assert stopped == {"seconds": None, "human": None, "label": "STOPPED", "since": None}


def test_sites_from_uptime_history_dedupes_urls(tmp_path, monkeypatch):
    monkeypatch.setattr(uptime_store, "DB_PATH", tmp_path / "uptime.db")
    uptime_store._init()
    uptime_store.record_check(
        "github_pages",
        "Siddarthb07/siddarthb",
        url="https://siddarthb07.github.io/siddarthb/",
        status="up",
        checked_at="2026-08-07T12:00:00+00:00",
    )
    uptime_store.record_check(
        "github_pages",
        "Siddarthb07/Drift",
        url="https://siddarthb07.github.io/siddarthb/",
        status="up",
        checked_at="2026-08-07T11:00:00+00:00",
    )
    uptime_store.record_check(
        "github_pages",
        "Siddarthb07/Athera",
        url="https://athera.digital/",
        status="up",
        checked_at="2026-08-07T12:01:00+00:00",
    )
    sites = infra_monitor._sites_from_uptime_history()
    assert len(sites) == 2
    urls = {github._normalize_site_url(site["url"]) for site in sites}
    assert urls == {
        "https://siddarthb07.github.io/siddarthb",
        "https://athera.digital",
    }


def test_docker_snapshot_fallback_is_read_only(tmp_path, monkeypatch):
    snapshot = tmp_path / "docker_snapshot.json"
    snapshot.write_text(
        json.dumps(
            {
                "containers": [
                    {
                        "id": "abc123",
                        "name": "jarvis-backend",
                        "state": "running",
                        "health": "healthy",
                        "image": "jarvis-backend",
                        "ports": ["8001:8000/tcp"],
                    }
                ]
            }
        ),
        encoding="utf-8",
    )
    monkeypatch.setattr(infra_monitor, "SNAPSHOT_PATH", snapshot)
    monkeypatch.setenv("INFRA_SNAPSHOT_MAX_AGE_SEC", "120")
    result = infra_monitor._docker_snapshot()
    assert result[0]["name"] == "jarvis-backend"
    assert "action" not in result[0]
