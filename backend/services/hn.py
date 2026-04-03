import httpx
from typing import List, Dict

HN_TOP_URL = "https://hacker-news.firebaseio.com/v0/topstories.json"
HN_ITEM_URL = "https://hacker-news.firebaseio.com/v0/item/{}.json"

FALLBACK_STORIES = [
    {"title": "Show HN: Building local-first AI apps with Ollama and RAG", "url": "https://news.ycombinator.com", "score": 342, "by": "dev_builder", "type": "ai"},
    {"title": "FastAPI best practices for production deployments", "url": "https://news.ycombinator.com", "score": 287, "by": "backenddev", "type": "backend"},
    {"title": "How Retrieval-Augmented Generation actually works in 2025", "url": "https://news.ycombinator.com", "score": 415, "by": "mlresearcher", "type": "ai"},
    {"title": "Docker Compose for local AI development stacks", "url": "https://news.ycombinator.com", "score": 198, "by": "devops_ai", "type": "devops"},
    {"title": "Next.js 14 performance patterns you should know", "url": "https://news.ycombinator.com", "score": 231, "by": "webdev_ng", "type": "frontend"},
]

async def fetch_top_stories(limit: int = 10) -> List[Dict]:
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(HN_TOP_URL)
            if resp.status_code != 200:
                return FALLBACK_STORIES
            ids = resp.json()[:limit * 2]
            stories = []
            for story_id in ids[:limit]:
                try:
                    r = await client.get(HN_ITEM_URL.format(story_id))
                    if r.status_code == 200:
                        d = r.json()
                        if d and d.get("type") == "story" and d.get("title"):
                            stories.append({
                                "title": d.get("title", ""),
                                "url": d.get("url", f"https://news.ycombinator.com/item?id={story_id}"),
                                "score": d.get("score", 0),
                                "by": d.get("by", ""),
                                "type": "news"
                            })
                except:
                    continue
            return stories if stories else FALLBACK_STORIES
    except Exception as e:
        print(f"[HN] Failed: {e}")
    return FALLBACK_STORIES

def stories_to_context(stories: List[Dict]) -> str:
    return "\n".join([f"- [{s['score']} pts] {s['title']} (by {s['by']})" for s in stories[:5]])
