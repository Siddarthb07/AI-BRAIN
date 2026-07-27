"""HouseAdapter protocol + factory."""

from __future__ import annotations

from typing import Any, Protocol, runtime_checkable


@runtime_checkable
class HouseAdapter(Protocol):
    name: str

    def list_entities(self) -> list[dict[str, Any]]: ...

    def get_state(self, entity_id: str) -> dict[str, Any] | None: ...

    def call_service(
        self,
        domain: str,
        service: str,
        entity_id: str,
        data: dict[str, Any] | None = None,
    ) -> dict[str, Any]: ...


def get_adapter(backend: str | None = None) -> HouseAdapter:
    import os

    from services.house.home_assistant import HomeAssistantAdapter
    from services.house.simulated import SimulatedHouse

    choice = (backend or os.getenv("HOUSE_BACKEND", "sim")).strip().lower()
    if choice in {"ha", "homeassistant", "home_assistant"}:
        return HomeAssistantAdapter()
    return SimulatedHouse()
