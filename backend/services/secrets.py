"""At-rest encryption for OAuth / HA tokens (Fernet + JARVIS_MASTER_KEY)."""

from __future__ import annotations

import base64
import hashlib
import json
import os
from typing import Any, Dict, Optional

from cryptography.fernet import Fernet, InvalidToken

_ENC_MARKER = "__jarvis_enc__"
_PREFIX = "enc:v1:"


def _fernet() -> Optional[Fernet]:
    raw = (os.getenv("JARVIS_MASTER_KEY") or "").strip()
    if not raw:
        return None
    digest = hashlib.sha256(raw.encode("utf-8")).digest()
    key = base64.urlsafe_b64encode(digest)
    return Fernet(key)


def encrypt_mapping(data: Optional[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
    if not data:
        return data
    if data.get(_ENC_MARKER):
        return data
    f = _fernet()
    if f is None:
        return data
    payload = json.dumps(data, separators=(",", ":"), default=str).encode("utf-8")
    token = f.encrypt(payload).decode("ascii")
    return {_ENC_MARKER: True, "blob": _PREFIX + token}


def decrypt_mapping(data: Optional[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
    if not data:
        return data
    if not data.get(_ENC_MARKER):
        return data
    f = _fernet()
    if f is None:
        raise RuntimeError(
            "Encrypted tokens found but JARVIS_MASTER_KEY is not set. "
            "Set the same key used when encrypting."
        )
    blob = data.get("blob") or ""
    if not blob.startswith(_PREFIX):
        raise RuntimeError("Unrecognized encrypted token format")
    try:
        raw = f.decrypt(blob[len(_PREFIX) :].encode("ascii"))
    except InvalidToken as exc:
        raise RuntimeError("Failed to decrypt tokens — wrong JARVIS_MASTER_KEY?") from exc
    return json.loads(raw.decode("utf-8"))


def encryption_enabled() -> bool:
    return _fernet() is not None
