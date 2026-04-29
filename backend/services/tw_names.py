import logging
import time
import warnings
from typing import Optional

import requests

warnings.filterwarnings("ignore", message="Unverified HTTPS request")
logger = logging.getLogger(__name__)

_cache: dict[str, str] = {}
_cached_at: float = 0
_TTL = 3600 * 6  # refresh every 6 hours

TWSE_STOCK_URL = "https://openapi.twse.com.tw/v1/openData/t187ap03_L"
TPEx_STOCK_URL = "https://openapi.twse.com.tw/v1/openData/t187ap04_L"
TWSE_ETF_URL = "https://www.twse.com.tw/rwd/zh/ETF/list?response=json"


def _load_names() -> dict[str, str]:
    global _cache, _cached_at
    if _cache and (time.time() - _cached_at) < _TTL:
        return _cache

    names: dict[str, str] = {}

    # Listed & OTC stocks
    for url in (TWSE_STOCK_URL, TPEx_STOCK_URL):
        try:
            resp = requests.get(url, timeout=10, headers={"User-Agent": "Mozilla/5.0"}, verify=False)
            for item in resp.json():
                code = item.get("公司代號", "").strip()
                short = item.get("公司簡稱", "").strip()
                if code and short:
                    names[code] = short
        except Exception as e:
            logger.warning(f"Failed to fetch TW stock names from {url}: {e}")

    # ETFs (separate endpoint)
    try:
        resp = requests.get(TWSE_ETF_URL, timeout=10, headers={"User-Agent": "Mozilla/5.0"}, verify=False)
        data = resp.json()
        # fields: ['上市日期', '證券代號', '證券簡稱', ...]
        for row in data.get("data", []):
            if len(row) >= 3:
                code, short = row[1].strip(), row[2].strip()
                if code and short:
                    names[code] = short
    except Exception as e:
        logger.warning(f"Failed to fetch TW ETF names: {e}")

    if names:
        _cache = names
        _cached_at = time.time()
    return _cache


def get_tw_chinese_name(symbol: str) -> Optional[str]:
    """Return Chinese short name for a Taiwan stock/ETF symbol (e.g. '2330.TW' → '台積電')."""
    code = symbol.upper().removesuffix(".TW").removesuffix(".TWO")
    names = _load_names()
    return names.get(code)
