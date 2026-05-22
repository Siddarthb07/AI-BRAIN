import hashlib
import os
import tempfile
from pathlib import Path

TTS_ENGINE = os.getenv("TTS_ENGINE", "pyttsx3").strip().lower()  # auto | coqui | pyttsx3 | espeak
TTS_VOICE = os.getenv("TTS_VOICE", "american_female").strip().lower()
ESPEAK_VOICE = os.getenv("TTS_ESPEAK_VOICE", "en-us+f3").strip()
AUDIO_CACHE = Path("/tmp/jarvis_tts_cache")
AUDIO_CACHE.mkdir(exist_ok=True)

AMERICAN_VOICE_HINTS = (
    "allison",
    "aria",
    "ava",
    "english-us",
    "en-us",
    "hazel",
    "jenny",
    "samantha",
    "united states",
    "us english",
    "zira",
)

FEMALE_VOICE_HINTS = (
    "allison",
    "ana",
    "aria",
    "ava",
    "catherine",
    "emma",
    "eva",
    "female",
    "hazel",
    "jenny",
    "michelle",
    "nancy",
    "olivia",
    "samantha",
    "serena",
    "susan",
    "woman",
    "zira",
)

MALE_VOICE_HINTS = (
    "david",
    "guy",
    "james",
    "male",
    "man",
    "mark",
)

NON_AMERICAN_VOICE_HINTS = (
    "australia",
    "australian",
    "british",
    "canada",
    "canadian",
    "india",
    "indian",
    "irish",
    "new zealand",
    "scotland",
    "uk",
    "united kingdom",
)


def _prefers_american_voice() -> bool:
    return "american" in TTS_VOICE or "us" in TTS_VOICE or "en-us" in TTS_VOICE


def _prefers_female_voice() -> bool:
    return "female" in TTS_VOICE or any(hint in TTS_VOICE for hint in FEMALE_VOICE_HINTS)


def _engine_order():
    if TTS_ENGINE == "coqui":
        return ["coqui", "pyttsx3", "espeak"]
    if TTS_ENGINE == "pyttsx3":
        return ["pyttsx3", "coqui", "espeak"]
    if TTS_ENGINE == "espeak":
        return ["espeak", "pyttsx3", "coqui"]
    return ["pyttsx3", "coqui", "espeak"]


def _voice_text(voice) -> str:
    parts = [getattr(voice, "id", ""), getattr(voice, "name", "")]
    for item in getattr(voice, "languages", []) or []:
        if isinstance(item, bytes):
            parts.append(item.decode(errors="ignore"))
        else:
            parts.append(str(item))
    return " ".join(str(part) for part in parts if part).lower()


def _score_pyttsx3_voice(voice) -> int:
    text = _voice_text(voice)
    score = 0

    if "english" in text or "en-" in text or text.startswith("en"):
        score += 8

    if _prefers_american_voice():
        if any(hint in text for hint in AMERICAN_VOICE_HINTS):
            score += 30
        if any(hint in text for hint in NON_AMERICAN_VOICE_HINTS):
            score -= 20

    if _prefers_female_voice():
        if any(hint in text for hint in FEMALE_VOICE_HINTS):
            score += 32
        if any(hint in text for hint in MALE_VOICE_HINTS):
            score -= 40

    return score


def _pick_pyttsx3_voice(engine) -> str | None:
    try:
        voices = engine.getProperty("voices") or []
    except Exception:
        return None

    if not voices:
        return None

    english_voices = [voice for voice in voices if "english" in _voice_text(voice) or "en-" in _voice_text(voice)]
    candidates = english_voices or voices
    preferred = max(candidates, key=_score_pyttsx3_voice, default=None)
    return getattr(preferred, "id", None)


def _espeak_voice_candidates() -> list[str]:
    base_voice = ESPEAK_VOICE.strip()
    if not base_voice:
        return []

    candidates: list[str] = []
    if _prefers_female_voice() and "+" not in base_voice:
        candidates.extend(
            [
                f"{base_voice}+f3",
                f"{base_voice}+f2",
            ]
        )
    candidates.append(base_voice)

    unique_candidates: list[str] = []
    for candidate in candidates:
        if candidate not in unique_candidates:
            unique_candidates.append(candidate)
    return unique_candidates


async def synthesize(text: str) -> bytes | None:
    normalized = text.strip()
    if not normalized:
        return None

    cache_input = f"v2|{TTS_ENGINE}|{TTS_VOICE}|{ESPEAK_VOICE}|{normalized}"
    cache_key = hashlib.md5(cache_input.encode()).hexdigest()
    cache_file = AUDIO_CACHE / f"{cache_key}.wav"
    if cache_file.exists():
        return cache_file.read_bytes()

    for engine in _engine_order():
        if engine == "coqui":
            audio = await _try_coqui(normalized)
        elif engine == "pyttsx3":
            audio = await _try_pyttsx3(normalized)
        else:
            audio = await _try_espeak(normalized)

        if audio and len(audio) > 256:
            cache_file.write_bytes(audio)
            return audio

    print("[TTS] No working synthesis engine available")
    return None


async def _try_coqui(text: str) -> bytes | None:
    try:
        from TTS.api import TTS

        tts = TTS(model_name="tts_models/en/ljspeech/tacotron2-DDC", progress_bar=False)
        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as handle:
            tmp_path = Path(handle.name)

        tts.tts_to_file(text=text[:500], file_path=str(tmp_path))
        audio = tmp_path.read_bytes()
        tmp_path.unlink(missing_ok=True)
        return audio
    except Exception as exc:
        print(f"[TTS] Coqui failed: {exc}")
    return None


async def _try_pyttsx3(text: str) -> bytes | None:
    try:
        import pyttsx3

        engine = pyttsx3.init()
        voice_id = _pick_pyttsx3_voice(engine)
        if voice_id:
            engine.setProperty("voice", voice_id)
        engine.setProperty("rate", 160)
        engine.setProperty("volume", 0.9)

        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as handle:
            tmp_path = Path(handle.name)

        engine.save_to_file(text[:500], str(tmp_path))
        engine.runAndWait()
        engine.stop()

        if tmp_path.exists() and tmp_path.stat().st_size > 100:
            audio = tmp_path.read_bytes()
            tmp_path.unlink(missing_ok=True)
            return audio
    except Exception as exc:
        print(f"[TTS] pyttsx3 failed: {exc}")
    return None


async def _try_espeak(text: str) -> bytes | None:
    try:
        import subprocess

        for espeak_voice in _espeak_voice_candidates():
            with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as handle:
                tmp_path = Path(handle.name)

            result = subprocess.run(
                ["espeak-ng", "-v", espeak_voice, "-w", str(tmp_path), "-s", "160", text[:500]],
                capture_output=True,
                timeout=15,
            )
            if result.returncode == 0 and tmp_path.exists() and tmp_path.stat().st_size > 100:
                audio = tmp_path.read_bytes()
                tmp_path.unlink(missing_ok=True)
                return audio
            tmp_path.unlink(missing_ok=True)
    except Exception as exc:
        print(f"[TTS] espeak failed: {exc}")
    return None
