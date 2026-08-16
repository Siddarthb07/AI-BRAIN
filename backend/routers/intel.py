"""Cinematic intel API — library scan, armory, radar, x-ray."""

from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from services import event_bus, intel

router = APIRouter()


class ScanBody(BaseModel):
    query: str = Field(..., min_length=2, max_length=80)


class SearchBody(BaseModel):
    query: str = Field(..., min_length=2, max_length=200)


class SummarizeBody(BaseModel):
    title: str = ""
    snippet: str = ""
    url: str = ""


class VennBody(BaseModel):
    left: str
    right: str


@router.get("/armory")
def armory():
    return {"keys": intel.key_armory(), "recap": intel.boot_recap()}


@router.get("/libraries")
def libraries():
    return {"repos": intel.library_index()}


@router.post("/scan")
async def scan(body: ScanBody):
    return await intel.scan_library(body.query)


@router.post("/radar")
async def radar(body: SearchBody):
    return await intel.radar_search(body.query)


@router.post("/summarize")
async def summarize(body: SummarizeBody):
    return await intel.summarize_web_hit(body.title, body.snippet, body.url)


@router.get("/xray/{repo}")
def xray(repo: str):
    return intel.xray(repo)


@router.post("/venn")
def venn(body: VennBody):
    if not body.left or not body.right:
        raise HTTPException(400, "two repos required")
    return intel.venn(body.left, body.right)


@router.get("/world")
async def world():
    from services import world_events

    return await world_events.world_feed()


@router.get("/hotspot")
async def hotspot(title: str = "", region: str = ""):
    from services import world_events

    if not title and not region:
        raise HTTPException(400, "title or region required")
    return await world_events.hotspot_brief(title, region)


@router.get("/events")
def events(limit: Optional[int] = 40):
    return {"events": event_bus.recent(limit or 40)}
