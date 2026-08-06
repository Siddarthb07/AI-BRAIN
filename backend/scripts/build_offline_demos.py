import asyncio
import json

from services.demo_builder import build_demo, demos_root


async def main():
    meta = await build_demo(
        "build me a website for Ember Oak night coffee roast bar",
        brand="Ember Oak",
    )
    keys = ["id", "title", "brand", "kit", "offline", "build_ok", "degraded", "preview_url", "hero_image_url"]
    print(json.dumps({k: meta.get(k) for k in keys}, indent=2))
    root = demos_root() / meta["id"]
    dist = root / "dist" / "index.html"
    print("dist_exists", dist.exists(), "bytes", dist.stat().st_size if dist.exists() else 0)
    css = (root / "src" / "index.css").read_text(encoding="utf-8")
    assert "{{" not in css
    jsx = (root / "src" / "App.jsx").read_text(encoding="utf-8")
    assert "marquee" in jsx and "Ember Oak" in jsx
    # industrial too
    meta2 = await build_demo("Make a landing page for Orbis industrial drone inspection", brand="Orbis")
    print("ind", meta2.get("kit"), meta2.get("layout") if False else meta2.get("offline"), meta2.get("id"))
    jsx2 = (demos_root() / meta2["id"] / "src" / "App.jsx").read_text(encoding="utf-8")
    assert "terminal-rail" in jsx2 or "layout-terminal" in jsx2
    print("RENDER_OK", meta["id"], meta2["id"])


if __name__ == "__main__":
    asyncio.run(main())
