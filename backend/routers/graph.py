from typing import Optional

from fastapi import APIRouter, Query

from services import event_bus, graph_projection

router = APIRouter()


@router.get("")
async def get_graph(
    layers: Optional[str] = Query(None, description="Comma layers: core,repos,vault,news,local,house,actions"),
    limit: int = Query(100, ge=10, le=300),
):
    layer_list = [x.strip() for x in layers.split(",")] if layers else None
    return graph_projection.build_projection(layers=layer_list, limit=limit)


@router.get("/events")
async def get_events(limit: int = 40, type: Optional[str] = None):
    return {"events": event_bus.recent(limit=limit, event_type=type)}
