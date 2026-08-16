"""Local API auth — Bearer JARVIS_API_TOKEN on mutating routes when set."""

from __future__ import annotations

import os
from typing import Callable

from fastapi import HTTPException, Request
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware

SAFE_METHODS = {"GET", "HEAD", "OPTIONS"}
PUBLIC_PREFIXES = ("/health", "/docs", "/openapi", "/redoc", "/generated", "/")


def api_token() -> str:
    return (os.getenv("JARVIS_API_TOKEN") or "").strip()


def auth_required() -> bool:
    return bool(api_token())


class JarvisAuthMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next: Callable):
        token = api_token()
        if not token:
            return await call_next(request)

        path = request.url.path
        if request.method in SAFE_METHODS and (
            path == "/" or path.startswith(("/health", "/docs", "/openapi", "/redoc", "/generated"))
        ):
            return await call_next(request)

        # Allow OAuth callback without Bearer
        if path.startswith("/calendar/google/callback"):
            return await call_next(request)

        if request.method in SAFE_METHODS and path.startswith(
            ("/graph", "/house/entities", "/house/status", "/gestures", "/demos", "/demos-static", "/research/status", "/vision/status", "/intel/armory")
        ):
            return await call_next(request)

        auth = request.headers.get("Authorization") or ""
        provided = ""
        if auth.lower().startswith("bearer "):
            provided = auth[7:].strip()
        if not provided:
            provided = request.headers.get("X-Jarvis-Token") or ""
        if provided != token:
            return JSONResponse({"detail": "Unauthorized — set Authorization: Bearer <JARVIS_API_TOKEN>"}, status_code=401)
        return await call_next(request)
