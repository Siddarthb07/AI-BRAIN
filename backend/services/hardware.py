"""Operator-owned hardware — facts that must not be hallucinated away."""

from __future__ import annotations

HARDWARE = [
    {
        "id": "quad",
        "name": "X-quadcopter",
        "frame": "Custom X lattice (red forward arms, white rear)",
        "flight_controller": "HobbyKing KK2.1.5",
        "notes": "KK2.1.5 is a standalone board with onboard gyros and an LCD menu. Not a Naza. Props: two-blade.",
    },
    {
        "id": "hex",
        "name": "Hexcopter F550",
        "frame": "DJI Flame Wheel F550 (six arms, mixed red/white)",
        "flight_controller": "DJI NAZA-M Lite",
        "notes": "NAZA-M Lite + GPS puck on a rear mast. Motors at arm tips. Do not call this a KK2 craft.",
    },
]


def memory_block() -> str:
    lines = ["HARDWARE (authoritative — do not replace FC names):"]
    for h in HARDWARE:
        lines.append(
            f"- {h['id']}: {h['name']}. Frame: {h['frame']}. "
            f"Flight controller: {h['flight_controller']}. {h['notes']}"
        )
    lines.append(
        "If asked about motors, ESCs, tuning, or parts beyond the FC/frame, search the web. "
        "Show hologram via UI: ui_show_hardware quad|hex."
    )
    return "\n".join(lines)


def get(hw_id: str) -> dict | None:
    key = (hw_id or "").strip().lower()
    aliases = {"quadcopter": "quad", "hexacopter": "hex", "f550": "hex", "naza": "hex", "kk2": "quad"}
    key = aliases.get(key, key)
    return next((h for h in HARDWARE if h["id"] == key), None)
