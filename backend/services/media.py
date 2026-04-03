from __future__ import annotations

import json
import os
import random
import re
import threading
import time
from pathlib import Path
from typing import Any

DATA_DIR = Path(__file__).parent.parent / "data"
GENERATED_ROOT = DATA_DIR / "generated"
IMAGE_OUTPUT_DIR = GENERATED_ROOT / "images"
IMAGE_OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

IMAGE_ENABLED = os.getenv("IMAGE_ENABLED", "true").strip().lower() not in {"0", "false", "no"}
IMAGE_MODEL_ID = os.getenv("IMAGE_MODEL_ID", "segmind/tiny-sd").strip()
IMAGE_DEVICE = os.getenv("IMAGE_DEVICE", "auto").strip().lower()
IMAGE_DEFAULT_STEPS = int(os.getenv("IMAGE_DEFAULT_STEPS", "12"))
IMAGE_MAX_STEPS = int(os.getenv("IMAGE_MAX_STEPS", "20"))
IMAGE_DEFAULT_SIZE = int(os.getenv("IMAGE_DEFAULT_SIZE", "512"))

_PIPELINE = None
_PIPELINE_LOCK = threading.Lock()
_GENERATE_LOCK = threading.Lock()


def _resolve_device() -> str:
    if IMAGE_DEVICE != "auto":
        return IMAGE_DEVICE

    try:
        import torch
    except ImportError:
        return "cpu"

    if torch.cuda.is_available():
        return "cuda"
    if getattr(torch.backends, "mps", None) and torch.backends.mps.is_available():
        return "mps"
    return "cpu"


def _resolve_dtype(device: str):
    import torch

    return torch.float16 if device == "cuda" else torch.float32


def _sanitize_dimension(value: int | None) -> int:
    if value is None:
        value = IMAGE_DEFAULT_SIZE

    clamped = max(256, min(1024, int(value)))
    rounded = max(256, int(round(clamped / 64) * 64))
    return min(1024, rounded)


def _sanitize_steps(value: int | None) -> int:
    if value is None:
        value = IMAGE_DEFAULT_STEPS
    return max(4, min(IMAGE_MAX_STEPS, int(value)))


def _sanitize_guidance(value: float | None) -> float:
    if value is None:
        value = 7.0
    return max(0.0, min(20.0, float(value)))


def _seed_value(seed: int | None) -> int:
    return int(seed) if seed is not None else random.randint(1, 2_147_483_647)


def _slugify_prompt(prompt: str) -> str:
    cleaned = re.sub(r"[^a-zA-Z0-9]+", "-", prompt.strip().lower()).strip("-")
    return cleaned[:48] or "jarvis-image"


def _metadata_path(image_path: Path) -> Path:
    return image_path.with_suffix(".json")


def _build_generator(seed: int, device: str):
    import torch

    if device == "cuda":
        return torch.Generator(device="cuda").manual_seed(seed)
    return torch.Generator().manual_seed(seed)


def _load_pipeline():
    global _PIPELINE
    if _PIPELINE is not None:
        return _PIPELINE

    with _PIPELINE_LOCK:
        if _PIPELINE is not None:
            return _PIPELINE

        try:
            from diffusers import AutoPipelineForText2Image, StableDiffusionPipeline
        except ImportError as exc:
            raise RuntimeError(
                "Image generation dependencies are missing. Install diffusers, accelerate, safetensors, and Pillow."
            ) from exc

        device = _resolve_device()
        dtype = _resolve_dtype(device)

        pipeline = None
        auto_error = None
        try:
            pipeline = AutoPipelineForText2Image.from_pretrained(IMAGE_MODEL_ID, torch_dtype=dtype)
        except Exception as exc:
            auto_error = exc

        if pipeline is None:
            try:
                pipeline = StableDiffusionPipeline.from_pretrained(IMAGE_MODEL_ID, torch_dtype=dtype)
            except Exception as exc:
                detail = f"Unable to load image model '{IMAGE_MODEL_ID}'."
                if auto_error:
                    detail += f" Auto pipeline error: {auto_error}."
                detail += f" Stable Diffusion pipeline error: {exc}."
                raise RuntimeError(detail) from exc

        pipeline = pipeline.to(device)
        if hasattr(pipeline, "enable_attention_slicing"):
            pipeline.enable_attention_slicing()
        if hasattr(pipeline, "enable_vae_slicing"):
            pipeline.enable_vae_slicing()

        _PIPELINE = pipeline
        return _PIPELINE


def image_status() -> dict[str, Any]:
    return {
        "enabled": IMAGE_ENABLED,
        "model_id": IMAGE_MODEL_ID,
        "device": _resolve_device(),
        "pipeline_loaded": _PIPELINE is not None,
        "default_steps": IMAGE_DEFAULT_STEPS,
        "max_steps": IMAGE_MAX_STEPS,
        "default_size": IMAGE_DEFAULT_SIZE,
    }


def generate_image(
    prompt: str,
    negative_prompt: str = "",
    width: int | None = None,
    height: int | None = None,
    steps: int | None = None,
    guidance_scale: float | None = None,
    seed: int | None = None,
) -> dict[str, Any]:
    if not IMAGE_ENABLED:
        raise RuntimeError("Image generation is disabled. Set IMAGE_ENABLED=true to enable it.")

    cleaned_prompt = prompt.strip()
    if not cleaned_prompt:
        raise ValueError("Prompt is required.")

    width = _sanitize_dimension(width)
    height = _sanitize_dimension(height)
    steps = _sanitize_steps(steps)
    guidance_scale = _sanitize_guidance(guidance_scale)
    seed = _seed_value(seed)

    pipeline = _load_pipeline()
    device = _resolve_device()
    generator = _build_generator(seed, device)

    started_at = time.time()
    with _GENERATE_LOCK:
        result = pipeline(
            prompt=cleaned_prompt,
            negative_prompt=negative_prompt.strip() or None,
            width=width,
            height=height,
            num_inference_steps=steps,
            guidance_scale=guidance_scale,
            generator=generator,
        )
    elapsed = round(time.time() - started_at, 2)

    image = result.images[0]
    timestamp = time.strftime("%Y%m%d-%H%M%S")
    filename = f"{timestamp}-{seed}-{_slugify_prompt(cleaned_prompt)}.png"
    image_path = IMAGE_OUTPUT_DIR / filename
    image.save(image_path)

    metadata = {
        "filename": filename,
        "prompt": cleaned_prompt,
        "negative_prompt": negative_prompt.strip(),
        "width": width,
        "height": height,
        "steps": steps,
        "guidance_scale": guidance_scale,
        "seed": seed,
        "model_id": IMAGE_MODEL_ID,
        "device": device,
        "elapsed_seconds": elapsed,
        "created_at": timestamp,
        "relative_url": f"/generated/images/{filename}",
    }
    _metadata_path(image_path).write_text(json.dumps(metadata, indent=2), encoding="utf-8")
    return metadata


def list_images(limit: int = 12) -> list[dict[str, Any]]:
    items: list[dict[str, Any]] = []

    for image_path in sorted(IMAGE_OUTPUT_DIR.glob("*.png"), key=lambda path: path.stat().st_mtime, reverse=True):
        meta_path = _metadata_path(image_path)
        if meta_path.exists():
            try:
                metadata = json.loads(meta_path.read_text(encoding="utf-8"))
            except Exception:
                metadata = {}
        else:
            metadata = {}

        metadata.setdefault("filename", image_path.name)
        metadata.setdefault("prompt", image_path.stem)
        metadata.setdefault("relative_url", f"/generated/images/{image_path.name}")
        metadata.setdefault("created_at", time.strftime("%Y%m%d-%H%M%S", time.localtime(image_path.stat().st_mtime)))
        metadata.setdefault("size_bytes", image_path.stat().st_size)
        items.append(metadata)

        if len(items) >= limit:
            break

    return items
