"""Deterministic simulated mansion (≤10 entities)."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from services import event_bus

_STATE_PATH = Path(__file__).parent.parent.parent / "data" / "sim_house.json"

DEFAULT_ENTITIES: list[dict[str, Any]] = [
    {"id": "light.lab", "name": "Lab Lights", "domain": "light", "state": "off", "attributes": {}, "writable": True},
    {"id": "light.workshop", "name": "Workshop Lights", "domain": "light", "state": "off", "attributes": {}, "writable": True},
    {"id": "light.lounge", "name": "Lounge Lights", "domain": "light", "state": "on", "attributes": {"brightness": 180}, "writable": True},
    {"id": "switch.fabricator", "name": "Fabricator", "domain": "switch", "state": "off", "attributes": {}, "writable": True},
    {
        "id": "climate.lab",
        "name": "Lab Climate",
        "domain": "climate",
        "state": "cool",
        "attributes": {"temperature": 22, "target": 22},
        "writable": True,
    },
    {"id": "lock.front_door", "name": "Front Door", "domain": "lock", "state": "locked", "attributes": {}, "writable": False},
    {"id": "binary_sensor.garage", "name": "Garage Door", "domain": "binary_sensor", "state": "off", "attributes": {}, "writable": False},
    {"id": "sensor.lab_temp", "name": "Lab Temperature", "domain": "sensor", "state": "21.5", "attributes": {"unit": "°C"}, "writable": False},
    {"id": "sensor.power_draw", "name": "Mansion Power", "domain": "sensor", "state": "2.4", "attributes": {"unit": "kW"}, "writable": False},
]


class SimulatedHouse:
    name = "sim"

    def __init__(self) -> None:
        self._entities: dict[str, dict[str, Any]] = {}
        self._load()

    def _load(self) -> None:
        if _STATE_PATH.exists():
            try:
                data = json.loads(_STATE_PATH.read_text(encoding="utf-8"))
                self._entities = {e["id"]: e for e in data.get("entities", [])}
                if self._entities:
                    return
            except Exception:
                pass
        self._entities = {e["id"]: dict(e) for e in DEFAULT_ENTITIES}
        self._save()

    def _save(self) -> None:
        _STATE_PATH.parent.mkdir(parents=True, exist_ok=True)
        _STATE_PATH.write_text(
            json.dumps({"entities": list(self._entities.values())}, indent=2),
            encoding="utf-8",
        )

    def list_entities(self) -> list[dict[str, Any]]:
        return [dict(e) for e in self._entities.values()]

    def get_state(self, entity_id: str) -> dict[str, Any] | None:
        ent = self._entities.get(entity_id)
        return dict(ent) if ent else None

    def call_service(
        self,
        domain: str,
        service: str,
        entity_id: str,
        data: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        ent = self._entities.get(entity_id)
        if not ent:
            raise KeyError(f"Unknown entity {entity_id}")
        if not ent.get("writable", False):
            raise PermissionError(f"Entity {entity_id} is read-only in simulation")
        if ent["domain"] != domain and domain not in {ent["domain"], "homeassistant"}:
            raise ValueError(f"Domain mismatch for {entity_id}")

        data = data or {}
        if service in {"turn_on", "unlock"}:
            ent["state"] = "on" if domain != "lock" else "unlocked"
            if domain == "light" and "brightness" in data:
                ent.setdefault("attributes", {})["brightness"] = data["brightness"]
        elif service in {"turn_off", "lock"}:
            ent["state"] = "off" if domain != "lock" else "locked"
        elif service == "set_temperature" and domain == "climate":
            target = data.get("temperature") or data.get("target")
            if target is not None:
                ent.setdefault("attributes", {})["target"] = target
                ent["state"] = "heat" if float(target) > 24 else "cool"
        elif service == "toggle":
            ent["state"] = "off" if ent["state"] in {"on", "unlocked"} else "on"
        else:
            raise ValueError(f"Unsupported service {domain}.{service}")

        self._entities[entity_id] = ent
        self._save()
        try:
            import asyncio

            loop = asyncio.get_event_loop()
            if loop.is_running():
                asyncio.create_task(event_bus.publish("house.state", {"entity_id": entity_id, "state": ent["state"], "backend": "sim"}))
        except Exception:
            pass
        return dict(ent)

    def evening_mode(self) -> list[dict[str, Any]]:
        results = []
        for eid in ("light.lab", "light.workshop", "light.lounge"):
            results.append(self.call_service("light", "turn_on", eid, {"brightness": 120}))
        return results
