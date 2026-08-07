"""GraphProjection — derived view over canonical stores (never a write SoT)."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from services import action_queue, event_bus, infra_monitor, store, vault
from services.house import get_adapter


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def build_projection(layers: list[str] | None = None, limit: int = 100) -> dict[str, Any]:
    wanted = set(layers or ["core", "infra", "repos", "vault", "news", "local", "actions", "demos"])
    nodes: list[dict[str, Any]] = []
    edges: list[dict[str, Any]] = []
    pulses = [
        {"node_id": p.get("payload", {}).get("entity_id") or p.get("payload", {}).get("node_id") or "jarvis",
         "reason": p.get("type"),
         "ts": p.get("ts")}
        for p in event_bus.recent(30)
    ]

    if "core" in wanted:
        nodes.append({"id": "jarvis", "type": "core", "label": "JARVIS", "meta": {}})

    if "infra" in wanted:
        for site in infra_monitor.sites()[:24]:
            sid = f"site:{site.get('id')}"
            nodes.append(
                {
                    "id": sid,
                    "type": "site",
                    "label": site.get("name") or site.get("repo") or "Pages site",
                    "meta": site,
                }
            )
            repo_id = f"repo:{site.get('repo')}"
            edges.append({"source": repo_id, "target": sid, "kind": "deployment", "weight": 1.3})
        for container in infra_monitor.containers()[:30]:
            cid = f"container:{container.get('id')}"
            nodes.append(
                {
                    "id": cid,
                    "type": "container",
                    "label": container.get("name") or container.get("id") or "container",
                    "meta": container,
                }
            )
            edges.append({"source": "jarvis", "target": cid, "kind": "runtime", "weight": 1.1})

    if "repos" in wanted:
        for repo in store.get_repos()[:40]:
            rid = f"repo:{repo.get('name')}"
            nodes.append(
                {
                    "id": rid,
                    "type": "repo",
                    "label": repo.get("name") or "repo",
                    "meta": {
                        "language": repo.get("language"),
                        "description": repo.get("description"),
                        "topics": repo.get("topics") or [],
                        "archived": bool(repo.get("archived")),
                        "url": repo.get("url"),
                    },
                }
            )
            edges.append({"source": "jarvis", "target": rid, "kind": "related", "weight": 1})
            for topic in (repo.get("topics") or [])[:3]:
                tid = f"topic:{topic}"
                if not any(n["id"] == tid for n in nodes):
                    nodes.append({"id": tid, "type": "topic", "label": str(topic), "meta": {}})
                edges.append({"source": rid, "target": tid, "kind": "related", "weight": 0.6})

    if "news" in wanted:
        for i, story in enumerate(store.get_hn_stories()[:12]):
            nid = f"news:{i}:{story.get('id') or i}"
            nodes.append(
                {
                    "id": nid,
                    "type": "news",
                    "label": (story.get("title") or "HN")[:48],
                    "meta": story,
                }
            )
            edges.append({"source": "jarvis", "target": nid, "kind": "related", "weight": 0.4})

    if "vault" in wanted:
        try:
            notes = vault.list_notes(limit=20)
        except Exception:
            notes = []
        for note in notes:
            nid = f"vault:{note.get('relative_path') or note.get('title')}"
            nodes.append(
                {
                    "id": nid,
                    "type": "local_text",
                    "label": (note.get("title") or note.get("relative_path") or "note")[:40],
                    "meta": note,
                }
            )
            edges.append({"source": "jarvis", "target": nid, "kind": "related", "weight": 0.5})

    if "house" in wanted:
        try:
            adapter = get_adapter()
            for ent in adapter.list_entities()[:15]:
                hid = f"house:{ent['id']}"
                nodes.append(
                    {
                        "id": hid,
                        "type": "house_entity",
                        "label": ent.get("name") or ent["id"],
                        "meta": ent,
                    }
                )
                edges.append({"source": "jarvis", "target": hid, "kind": "house", "weight": 1})
        except Exception as exc:
            print(f"[graph] house layer failed: {exc}")

    if "actions" in wanted:
        for action in action_queue.list_pending(limit=10):
            aid = f"action:{action['id']}"
            nodes.append(
                {
                    "id": aid,
                    "type": "pending_action",
                    "label": action.get("label") or action.get("type"),
                    "meta": action,
                }
            )
            edges.append({"source": "jarvis", "target": aid, "kind": "pending", "weight": 1.2})

    if "demos" in wanted:
        try:
            from services import demo_builder

            for demo in demo_builder.list_demos(limit=12):
                did = f"demo:{demo.get('id')}"
                nodes.append(
                    {
                        "id": did,
                        "type": "demo",
                        "label": (demo.get("title") or demo.get("id") or "demo")[:40],
                        "meta": demo,
                    }
                )
                edges.append({"source": "jarvis", "target": did, "kind": "demo", "weight": 1.0})
        except Exception as exc:
            print(f"[graph] demos layer failed: {exc}")

    # Cap
    if len(nodes) > limit:
        nodes = nodes[:limit]
        keep = {n["id"] for n in nodes}
        edges = [e for e in edges if e["source"] in keep and e["target"] in keep]

    return {
        "nodes": nodes,
        "edges": edges,
        "pulses": pulses[-20:],
        "generated_at": _now(),
        "layers": sorted(wanted),
        "backend_house": get_adapter().name,
    }
