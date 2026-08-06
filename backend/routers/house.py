from __future__ import annotations
from typing import Any, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from services import action_queue, event_bus
from services.house import get_adapter, ha_configured, writes_enabled
from services.house.home_assistant import HomeAssistantAdapter
from services.house.simulated import SimulatedHouse

router = APIRouter()


class HouseServiceRequest(BaseModel):
    entity_id: str
    domain: Optional[str] = None
    service: str = "turn_on"
    data: dict[str, Any] = Field(default_factory=dict)
    backend: Optional[str] = None
    session_id: Optional[str] = None
    confirm: bool = False
    action_id: Optional[str] = None
    confirm_token: Optional[str] = None


def _tier_for(domain: str) -> int:
    if domain in {"lock", "alarm_control_panel", "cover"}:
        return action_queue.TIER_CRITICAL
    if domain == "climate":
        return action_queue.TIER_CLIMATE
    return action_queue.TIER_LIGHT


@router.get("/status")
async def house_status():
    return {
        "disabled": True,
        "message": "Home automation is parked for now",
        "backend_default": "disabled",
        "sim_entities": 0,
        "ha_configured": False,
        "ha_writes_enabled": False,
        "ha_entities": 0,
        "pending_actions": 0,
    }


@router.get("/entities")
async def list_entities(backend: Optional[str] = None):
    adapter = get_adapter(backend)
    return {"backend": adapter.name, "entities": adapter.list_entities()}


@router.get("/entities/{entity_id}")
async def get_entity(entity_id: str, backend: Optional[str] = None):
    adapter = get_adapter(backend)
    state = adapter.get_state(entity_id)
    if not state:
        raise HTTPException(404, "Entity not found")
    return state


@router.post("/service")
async def call_service(payload: HouseServiceRequest):
    """Propose or execute a house service. Writes require confirm unless confirm=true with action_id."""
    domain = payload.domain or payload.entity_id.split(".", 1)[0]
    adapter = get_adapter(payload.backend)
    tier = _tier_for(domain)

    # Critical always needs confirm binding
    if not payload.confirm:
        action = action_queue.enqueue(
            "house_service",
            label=f"{payload.service} {payload.entity_id}",
            params={
                "entity_id": payload.entity_id,
                "domain": domain,
                "service": payload.service,
                "data": payload.data,
                "backend": adapter.name,
            },
            session_id=payload.session_id,
            tier=tier,
        )
        await event_bus.publish("action.pending", {"action_id": action["id"], "type": "house_service"})
        return {"ok": True, "requires_confirm": True, "action": action}

    if not payload.action_id:
        raise HTTPException(400, "action_id required when confirm=true")

    action, err = action_queue.consume_for_confirm(
        payload.action_id,
        confirm_token=payload.confirm_token,
        session_id=payload.session_id,
    )
    if err:
        raise HTTPException(400, err)

    # Sim writes always allowed; HA gated
    if adapter.name == "ha" and not writes_enabled():
        action_queue.audit(
            "house_service",
            action_id=payload.action_id,
            params=action["params"],
            result="blocked: HOUSE_WRITES_ENABLED=0",
            source="house",
            session_id=payload.session_id,
            ok=False,
        )
        raise HTTPException(403, "HA writes disabled — set HOUSE_WRITES_ENABLED=1 after security gates")

    if tier >= action_queue.TIER_CRITICAL:
        raise HTTPException(403, "Critical house actions require HA_ALLOW_CRITICAL=1 and explicit policy")

    try:
        result = adapter.call_service(domain, payload.service, payload.entity_id, payload.data)
        action_queue.audit(
            "house_service",
            action_id=payload.action_id,
            params=action["params"],
            result=str(result.get("state")),
            source="house",
            session_id=payload.session_id,
            ok=True,
        )
        await event_bus.publish("house.state", {"entity_id": payload.entity_id, "state": result.get("state")})
        return {"ok": True, "entity": result}
    except Exception as exc:
        action_queue.audit(
            "house_service",
            action_id=payload.action_id,
            params=action.get("params") if action else {},
            result=str(exc),
            source="house",
            session_id=payload.session_id,
            ok=False,
        )
        raise HTTPException(400, str(exc)) from exc


@router.post("/scene/evening")
async def evening_scene(backend: Optional[str] = "sim"):
    adapter = get_adapter(backend or "sim")
    if not isinstance(adapter, SimulatedHouse):
        raise HTTPException(400, "Evening scene demo is sim-only")
    results = adapter.evening_mode()
    await event_bus.publish("house.scene", {"name": "evening", "count": len(results)})
    return {"ok": True, "entities": results}


@router.get("/pending")
async def pending_house_actions(session_id: Optional[str] = None):
    return {"actions": action_queue.list_pending(session_id=session_id)}


@router.get("/audit")
async def house_audit(limit: int = 40):
    return {"audit": action_queue.list_audit(limit=limit)}
