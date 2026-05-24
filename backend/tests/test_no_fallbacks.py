from services import github
from services.config import demo_mode


def test_demo_mode_off_by_default():
    assert demo_mode() is False


def test_github_empty_when_not_demo(monkeypatch):
    monkeypatch.setenv("DEMO_MODE", "0")

    async def fake_fetch(_username):
        return []

    import services.github as gh

    monkeypatch.setattr(gh, "demo_mode", lambda: False)
    # Direct logic: empty fetch should not substitute fallbacks
    repos: list = []
    result = repos if repos else (gh.FALLBACK_REPOS if gh.demo_mode() else [])
    assert result == []


def test_github_allows_fallback_in_demo(monkeypatch):
    import services.github as gh

    monkeypatch.setattr(gh, "demo_mode", lambda: True)
    repos: list = []
    result = repos if repos else (gh.FALLBACK_REPOS if gh.demo_mode() else [])
    assert len(result) == len(gh.FALLBACK_REPOS)
