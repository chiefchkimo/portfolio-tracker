import logging
from datetime import datetime
from typing import Optional

import requests
import yfinance as yf
from bs4 import BeautifulSoup

logger = logging.getLogger(__name__)

_usd_twd_cache: dict = {"rate": None, "fetched_at": None}


def fetch_usd_twd_rate() -> Optional[float]:
    try:
        ticker = yf.Ticker("TWD=X")
        rate = ticker.fast_info.last_price
        if rate and rate > 0:
            _usd_twd_cache["rate"] = rate
            _usd_twd_cache["fetched_at"] = datetime.utcnow()
            return rate
    except Exception as e:
        logger.warning(f"TWD=X fetch failed: {e}")
    return _usd_twd_cache.get("rate")


def _fetch_via_yfinance(symbol: str) -> Optional[float]:
    try:
        ticker = yf.Ticker(symbol)
        price = ticker.fast_info.last_price
        if price and price > 0:
            return float(price)
    except Exception as e:
        logger.warning(f"yfinance fetch failed for {symbol}: {e}")
    return None


def _fetch_tw_fund_nav(symbol: str) -> Optional[float]:
    """Scrape NAV from fundclear.com.tw for Taiwan mutual funds."""
    try:
        url = f"https://www.fundclear.com.tw/SmartFundWeb/F01.do?fundId={symbol}"
        resp = requests.get(url, timeout=10, headers={"User-Agent": "Mozilla/5.0"})
        if resp.status_code != 200:
            return None
        soup = BeautifulSoup(resp.text, "html.parser")
        # Look for NAV value in the page — selector may vary by site structure
        cells = soup.select("td")
        for i, cell in enumerate(cells):
            if "淨值" in cell.get_text():
                if i + 1 < len(cells):
                    text = cells[i + 1].get_text(strip=True).replace(",", "")
                    try:
                        return float(text)
                    except ValueError:
                        pass
    except Exception as e:
        logger.warning(f"fundclear scrape failed for {symbol}: {e}")
    return None


def _normalize_symbol(symbol: str, asset_type: str) -> str:
    """Ensure crypto symbols use Yahoo Finance format (BTC → BTC-USD)."""
    if asset_type == "crypto" and not symbol.endswith("-USD"):
        return symbol + "-USD"
    return symbol


def fetch_price(symbol: str, asset_type: str) -> Optional[float]:
    """Fetch latest price for any asset type. Returns price in native currency."""
    symbol = _normalize_symbol(symbol, asset_type)
    price = _fetch_via_yfinance(symbol)
    if price is not None:
        return price

    if asset_type == "tw_fund":
        price = _fetch_tw_fund_nav(symbol)

    return price


def to_twd(price: float, currency: str, usd_twd_rate: Optional[float]) -> Optional[float]:
    if currency == "TWD":
        return price
    if currency == "USD" and usd_twd_rate:
        return price * usd_twd_rate
    return None


def get_asset_currency(asset_type: str) -> str:
    if asset_type in ("us_stock", "us_etf", "crypto", "commodity"):
        return "USD"
    return "TWD"
