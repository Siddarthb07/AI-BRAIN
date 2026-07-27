"""Home Assistant REST adapter (allowlisted entities)."""

from __future__ import annotations

import os
from typing import Any

import httpx

from services import event_bus


def _allowlist() -> set[str]:
    raw = os.getenv("HA_ENTITY_ALLOWLIST", "light.lab,light.workshop,light.lounge,switch.fabricator,climate.lab")
    return {x.strip() for x in raw.split(",") if x.strip()}


def _ha_url() -> str:
    return (os.getenv("HA_URL") or os.getenv("HOME_ASSISTANT_URL") or "").rstrip("/")


def _ha_token() -> str:
    return (os.getenv("HA_TOKEN") or os.getenv("HOME_ASSISTANT_TOKEN") or "").strip()


def ha_configured() -> bool:
    return bool(_ha_url() and _ha_token())


def writes_enabled() -> bool:
    return os.getenv("HOUSE_WRITES_ENABLED", "0").strip().lower() in {"1", "true", "yes", "on"}


class HomeAssistantAdapter:
    name = "ha"

    def list_entities(self) -> list[dict[str, Any]]:
        if not ha_configured():
            return []
        allow = _allowlist()
        try:
            with httpx.Client(timeout=8.0) as client:
                resp = client.get(
                    f"{_ha_url()}/api/states",
                    headers={"Authorization": f"Bearer {_ha_token()}", "Content-Type": "application/json"},
                )
                if resp.status_code != 200:
                    return []
                out = []
                for item in resp.json():
                    eid = item.get("entity_id")
                    if eid not in allow:
                        continue
                    domain = eid.split(".", 1)[0]
                    out.append(
                        {
                            "id": eid,
                            "name": (item.get("attributes") or {}).get("friendly_name") or eid,
                            "domain": domain,
                            "state": item.get("state"),
                            "attributes": item.get("attributes") or {},
                            "writable": domain in {"light", "switch", "climate"} and writes_enabled(),
                        }
                    )
                return out
        except Exception as exc:
            print(f"[HA] list_entities failed: {exc}")
            return []

    def get_state(self, entity_id: str) -> dict[str, Any] | None:
        if entity_id not in _allowlist():
            raise PermissionError(f"{entity_id} not in HA allowlist")
        if not ha_configured():
            return None
        try:
            with httpx.Client(timeout=8.0) as client:
                resp = client.get(
                    f"{_ha_url()}/api/states/{entity_id}",
                    headers={"Authorization": f"Bearer {_ha_token()}"},
                )
                if resp.status_code != 200:
                    return None
                item = resp.json()
                domain = entity_id.split(".", 1)[0]
                return {
                    "id": entity_id,
                    "name": (item.get("attributes") or {}).get("friendly_name") or entity_id,
                    "domain": domain,
                    "state": item.get("state"),
                    "attributes": item.get("attributes") or {},
                    "writable": domain in {"light", "switch", "climate"} and writes_enabled(),
                }
        except Exception as exc:
            print(f"[HA] get_state failed: {exc}")
            return None

    def call_service(
        self,
        domain: str,
        service: str,
        entity_id: str,
        data: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        if not writes_enabled():
            raise PermissionError("HOUSE_WRITES_ENABLED is off — HA writes blocked")
        if entity_id not in _allowlist():
            raise PermissionError(f"{entity_id} not in HA allowlist")
        # Never allow critical domains via wildcard
        if domain in {"lock", "alarm_control_panel", "cover"} and os.getenv("HA_ALLOW_CRITICAL", "0") != "1":
            raise PermissionError(f"Critical domain {domain} blocked")
        if not ha_configured():
            raise RuntimeError("Home Assistant not configured (HA_URL / HA_TOKEN)")

        body = {"entity_id": entity_id, **(data or {})}
        with httpx.Client(timeout=10.0) as client:
            resp = client.post(
                f"{_ha_url()}/api/services/{domain}/{service}",
                headers={"Authorization": f"Bearer {_ha_token()}", "Content-Type": "application/json"},
                json=body,
            )
            if resp.status_code >= 400:
                raise RuntimeError(f"HA call failed: {resp.status_code} {resp.text[:200]}")
        state = self.get_state(entity_id) or {"id": entity_id, "state": "unknown"}
        try:
            import asyncio

            loop = asyncio.get_event_loop()
            if loop.is_running():
                asyncio.create_task(
                    event_bus.publish("house.state", {"entity_id": entity_id, "state": state.get("state"), "backend": "ha"})
                )
        except Exception:
            pass
        return state
