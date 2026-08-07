"""Write a sanitized, read-only Docker snapshot for AI-BRAIN.

Fallback for native/Windows runs where the socket proxy is unavailable.
This script only invokes `docker ps`, `docker inspect`, and `docker stats`.
"""

from __future__ import annotations

import json
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "backend" / "data" / "infra" / "docker_snapshot.json"


def _run(*args: str) -> str:
    result = subprocess.run(
        ["docker", *args],
        check=True,
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
    )
    return result.stdout


def _ports(network: dict) -> list[str]:
    output: list[str] = []
    for container_port, bindings in (network.get("Ports") or {}).items():
        if not bindings:
            output.append(container_port)
            continue
        for binding in bindings:
            host = binding.get("HostPort")
            output.append(f"{host}:{container_port}" if host else container_port)
    return output


def collect() -> dict:
    ids = [line.strip() for line in _run("ps", "-aq").splitlines() if line.strip()]
    if not ids:
        return {"generated_at": datetime.now(timezone.utc).isoformat(), "containers": []}
    inspected = json.loads(_run("inspect", *ids))
    stats_by_id: dict[str, dict] = {}
    try:
        for line in _run(
            "stats",
            "--no-stream",
            "--format",
            "{{json .}}",
            *ids,
        ).splitlines():
            if line.strip():
                item = json.loads(line)
                stats_by_id[item.get("ID", "")] = item
    except subprocess.CalledProcessError:
        pass

    containers = []
    for item in inspected:
        full_id = item.get("Id") or ""
        short_id = full_id[:12]
        state = item.get("State") or {}
        config = item.get("Config") or {}
        stats = stats_by_id.get(short_id) or {}
        memory_pct = str(stats.get("MemPerc") or "").replace("%", "")
        cpu_pct = str(stats.get("CPUPerc") or "").replace("%", "")
        entry = {
            "id": short_id,
            "name": str(item.get("Name") or "").lstrip("/") or short_id,
            "image": config.get("Image") or "unknown",
            "state": state.get("Status") or "unknown",
            "health": (
                (state.get("Health") or {}).get("Status")
                if (state.get("Status") == "running" and state.get("Health"))
                else "none"
            ),
            "started_at": state.get("StartedAt"),
            "finished_at": state.get("FinishedAt"),
            "ports": _ports(item.get("NetworkSettings") or {}),
            "cpu_percent": float(cpu_pct) if cpu_pct else None,
            "memory": {
                "percent": float(memory_pct) if memory_pct else None,
                "display": stats.get("MemUsage"),
            },
            "labels": {
                key: value
                for key, value in (config.get("Labels") or {}).items()
                if key.startswith("com.docker.compose.")
            },
        }
        started = entry["started_at"]
        if entry["state"] == "running" and started and not str(started).startswith("0001-01-01"):
            try:
                start = datetime.fromisoformat(str(started).replace("Z", "+00:00"))
                seconds = max(0, int((datetime.now(timezone.utc) - start).total_seconds()))
                days, rem = divmod(seconds, 86400)
                hours, rem = divmod(rem, 3600)
                minutes, secs = divmod(rem, 60)
                human = f"{days}d {hours}h" if days else (f"{hours}h {minutes}m" if hours else f"{minutes}m {secs}s")
                entry["uptime_seconds"] = seconds
                entry["uptime_human"] = human
                entry["uptime_label"] = f"UP {human}"
            except ValueError:
                entry["uptime_seconds"] = None
                entry["uptime_human"] = None
                entry["uptime_label"] = "UNKNOWN"
        else:
            entry["uptime_seconds"] = None
            entry["uptime_human"] = None
            entry["uptime_label"] = "STOPPED"
        containers.append(entry)
    return {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "source": "host_collector",
        "containers": sorted(containers, key=lambda row: row["name"].lower()),
    }


def main() -> int:
    try:
        snapshot = collect()
        OUTPUT.parent.mkdir(parents=True, exist_ok=True)
        temporary = OUTPUT.with_suffix(".tmp")
        temporary.write_text(json.dumps(snapshot, indent=2), encoding="utf-8")
        temporary.replace(OUTPUT)
        print(f"Wrote {len(snapshot['containers'])} containers to {OUTPUT}")
        return 0
    except (FileNotFoundError, subprocess.CalledProcessError, json.JSONDecodeError) as exc:
        print(f"Docker snapshot failed: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
