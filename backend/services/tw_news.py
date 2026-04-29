import time
from datetime import datetime, timezone

import requests

ANUE_URL = "https://api.cnyes.com/media/api/v1/newslist/category/tw_stock"
_cache: dict = {}  # stock_code -> (timestamp, items)
CACHE_TTL = 900  # 15 minutes

# Shared full-list cache to avoid hammering the API per symbol
_full_cache: dict = {"ts": 0.0, "items": []}


def _fetch_full_list() -> list[dict]:
    now = time.time()
    if now - _full_cache["ts"] < CACHE_TTL and _full_cache["items"]:
        return _full_cache["items"]
    try:
        resp = requests.get(ANUE_URL, params={"limit": 100}, timeout=5,
                            headers={"User-Agent": "Mozilla/5.0"})
        resp.raise_for_status()
        items = resp.json().get("data", {}).get("items", []) or []
        _full_cache["ts"] = now
        _full_cache["items"] = items
        return items
    except Exception:
        return _full_cache["items"]  # return stale on error


def get_tw_news_for_symbol(stock_code: str, limit: int = 6) -> list[dict]:
    """
    stock_code: bare code without suffix, e.g. '2330' for 2330.TW
    Returns list of {title, publisher, link, published_at (ISO string)}.
    """
    now = time.time()
    if stock_code in _cache and now - _cache[stock_code][0] < CACHE_TTL:
        return _cache[stock_code][1][:limit]

    items = _fetch_full_list()
    result = []
    for item in items:
        stocks = item.get("stock", []) or []
        codes = [str(s.get("code", "")) for s in stocks]
        if stock_code not in codes:
            continue
        news_id = item.get("newsId") or item.get("id")
        ts = item.get("publishAt")
        published_at = (
            datetime.fromtimestamp(ts, tz=timezone.utc).isoformat() if ts else ""
        )
        result.append({
            "title": item.get("title", ""),
            "publisher": "鉅亨網",
            "link": f"https://news.cnyes.com/news/id/{news_id}",
            "published_at": published_at,
        })

    _cache[stock_code] = (now, result)
    return result[:limit]
