"""Research intent + web search smoke tests (no live LLM)."""

from services.research import extract_topic, is_research_intent
from services.web_search import format_hits_for_context


def test_research_intent():
    assert is_research_intent("Research Fourier neural operators")
    assert is_research_intent("generate a report on BEMT propellers")
    assert is_research_intent("search the web for Spider benchmark")
    assert not is_research_intent("what time is it")


def test_extract_topic():
    assert "Fourier" in extract_topic("Research Fourier neural operators please")
    assert extract_topic("write a report on vortex rings").lower().startswith("vortex")


def test_format_hits():
    text = format_hits_for_context(
        [{"title": "A", "url": "https://example.com", "snippet": "hello"}]
    )
    assert "example.com" in text
    assert format_hits_for_context([]) == "No web results."
