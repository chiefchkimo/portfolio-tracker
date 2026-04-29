import json
from datetime import date, datetime, timedelta, timezone
from typing import List, Optional

import yfinance as yf
from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlmodel import Session, select

from database import get_session
from models import Holding, PortfolioHistory, PriceSnapshot
from schemas import AllocationItem, HistoryPoint, SummaryOut
from services.price_fetcher import fetch_price, fetch_usd_twd_rate, get_asset_currency, to_twd
from services.tw_news import get_tw_news_for_symbol

router = APIRouter(prefix="/api/portfolio", tags=["portfolio"])


def _build_position_values(session: Session, rate: float) -> list[dict]:
    holdings = session.exec(select(Holding)).all()
    positions = []
    for h in holdings:
        stmt = (
            select(PriceSnapshot)
            .where(PriceSnapshot.symbol == h.symbol)
            .order_by(PriceSnapshot.fetched_at.desc())
        )
        snap = session.exec(stmt).first()
        price = snap.price if snap else None
        currency = snap.currency if snap else h.currency

        value_twd = None
        cost_twd = to_twd(h.cost_per_unit * h.quantity, h.currency, rate)

        if price is not None:
            value_twd = to_twd(price * h.quantity, currency, rate)

        positions.append(
            {
                "holding": h,
                "price": price,
                "value_twd": value_twd,
                "cost_twd": cost_twd,
            }
        )
    return positions


@router.get("/summary", response_model=SummaryOut)
def portfolio_summary(session: Session = Depends(get_session)):
    rate = fetch_usd_twd_rate()
    positions = _build_position_values(session, rate)

    total_value = sum(p["value_twd"] for p in positions if p["value_twd"] is not None)
    total_cost = sum(p["cost_twd"] for p in positions if p["cost_twd"] is not None)
    pnl = total_value - total_cost
    pnl_pct = (pnl / total_cost * 100) if total_cost > 0 else 0

    type_map: dict[str, float] = {}
    for p in positions:
        t = p["holding"].asset_type
        type_map[t] = type_map.get(t, 0) + (p["value_twd"] or 0)

    by_type = [
        {"asset_type": k, "value_twd": v, "weight_pct": (v / total_value * 100) if total_value else 0}
        for k, v in type_map.items()
    ]

    return SummaryOut(
        total_value_twd=total_value,
        total_cost_twd=total_cost,
        pnl_twd=pnl,
        pnl_pct=pnl_pct,
        usd_twd_rate=rate,
        by_type=by_type,
    )


@router.get("/allocation", response_model=List[AllocationItem])
def portfolio_allocation(session: Session = Depends(get_session)):
    rate = fetch_usd_twd_rate()
    positions = _build_position_values(session, rate)

    total_value = sum(p["value_twd"] for p in positions if p["value_twd"] is not None)

    # Consolidate same symbol across multiple holdings (e.g. different brokers)
    merged: dict[str, dict] = {}
    for p in positions:
        h = p["holding"]
        val = p["value_twd"] or 0
        if h.symbol in merged:
            merged[h.symbol]["value_twd"] += val
        else:
            merged[h.symbol] = {
                "symbol": h.symbol,
                "name": h.name,
                "asset_type": h.asset_type,
                "value_twd": val,
            }

    items = [
        AllocationItem(
            symbol=m["symbol"],
            name=m["name"],
            asset_type=m["asset_type"],
            value_twd=m["value_twd"],
            weight_pct=(m["value_twd"] / total_value * 100) if total_value else 0,
        )
        for m in merged.values()
    ]
    items.sort(key=lambda x: x.value_twd, reverse=True)
    return items


@router.get("/history", response_model=List[HistoryPoint])
def portfolio_history(days: int = Query(365, ge=1, le=3650), session: Session = Depends(get_session)):
    since = date.today() - timedelta(days=days)
    rows = session.exec(
        select(PortfolioHistory)
        .where(PortfolioHistory.record_date >= since)
        .order_by(PortfolioHistory.record_date)
    ).all()
    return [
        HistoryPoint(date=r.record_date, total_value_twd=r.total_value_twd, total_cost_twd=r.total_cost_twd)
        for r in rows
    ]


def _upsert_history(session: Session, target_date: date, total_value_twd: float, total_cost_twd: float, snapshot: list):
    existing = session.exec(
        select(PortfolioHistory).where(PortfolioHistory.record_date == target_date)
    ).first()
    if existing:
        existing.total_value_twd = total_value_twd
        existing.total_cost_twd = total_cost_twd
        existing.snapshot_json = json.dumps(snapshot)
        session.add(existing)
    else:
        session.add(
            PortfolioHistory(
                record_date=target_date,
                total_value_twd=total_value_twd,
                total_cost_twd=total_cost_twd,
                snapshot_json=json.dumps(snapshot),
            )
        )
    session.commit()


@router.post("/snapshot")
def save_snapshot(session: Session = Depends(get_session)):
    rate = fetch_usd_twd_rate()
    positions = _build_position_values(session, rate)
    total_value = sum(p["value_twd"] for p in positions if p["value_twd"] is not None)
    total_cost = sum(p["cost_twd"] for p in positions if p["cost_twd"] is not None)
    snap_list = [
        {"symbol": p["holding"].symbol, "value_twd": p["value_twd"] or 0}
        for p in positions
    ]
    _upsert_history(session, date.today(), total_value, total_cost, snap_list)
    return {"ok": True, "date": str(date.today()), "total_value_twd": total_value}


@router.post("/backfill")
def backfill_history(session: Session = Depends(get_session)):
    holdings = session.exec(select(Holding)).all()
    if not holdings:
        return {"ok": True, "days_filled": 0}

    rate = fetch_usd_twd_rate() or 32.0

    # Step 1: collect per-holding price series {date -> price} and cost
    holding_series: list[dict] = []
    all_dates: set[date] = set()

    for h in holdings:
        currency = get_asset_currency(h.asset_type)
        cost_twd = to_twd(h.cost_per_unit * h.quantity, h.currency, rate) or 0
        price_by_date: dict[date, float] = {}

        try:
            hist = yf.Ticker(h.symbol).history(period="1y")
            for ts, row in hist.iterrows():
                d = ts.date() if hasattr(ts, "date") else ts
                price_by_date[d] = float(row.get("Close", 0))
                all_dates.add(d)
        except Exception:
            pass

        holding_series.append({
            "price_by_date": price_by_date,
            "currency": currency,
            "quantity": h.quantity,
            "cost_twd": cost_twd,
        })

    if not all_dates:
        return {"ok": True, "days_filled": 0}

    # Step 2: forward-fill each holding across all sorted dates, then sum
    sorted_dates = sorted(all_dates)
    daily_value: dict[date, float] = {}
    daily_cost: dict[date, float] = {}

    for hs in holding_series:
        last_price: float | None = None
        for d in sorted_dates:
            if d in hs["price_by_date"]:
                last_price = hs["price_by_date"][d]

            # Always include cost; only add value when we have a price
            daily_cost[d] = daily_cost.get(d, 0) + hs["cost_twd"]
            if last_price is not None:
                value = to_twd(last_price * hs["quantity"], hs["currency"], rate) or 0
                daily_value[d] = daily_value.get(d, 0) + value

    for d in sorted_dates:
        v = daily_value.get(d, 0)
        c = daily_cost.get(d, 0)
        _upsert_history(session, d, v, c, [])

    return {"ok": True, "days_filled": len(sorted_dates)}


class PortfolioNewsItem(BaseModel):
    title: str
    publisher: str
    link: str
    published_at: str
    symbol: str
    name: str


_news_cache: dict = {"data": None, "fetched_at": None}
_NEWS_TTL = 1800  # 30 minutes


@router.get("/news", response_model=List[PortfolioNewsItem])
def portfolio_news(session: Session = Depends(get_session)):
    # Return cached result if fresh
    if _news_cache["data"] is not None and _news_cache["fetched_at"]:
        age = (datetime.utcnow() - _news_cache["fetched_at"]).total_seconds()
        if age < _NEWS_TTL:
            return _news_cache["data"]

    rate = fetch_usd_twd_rate() or 32.0
    positions = _build_position_values(session, rate)

    # Pick top 10 holdings by value to limit API calls
    top = sorted(
        [p for p in positions if p["value_twd"]],
        key=lambda p: p["value_twd"],
        reverse=True,
    )[:10]

    seen_links: set[str] = set()
    all_news: list[PortfolioNewsItem] = []

    for p in top:
        h = p["holding"]
        try:
            if h.symbol.endswith(".TW"):
                stock_code = h.symbol.replace(".TW", "")
                raw_tw = get_tw_news_for_symbol(stock_code, limit=5)
                for n in raw_tw:
                    link = n["link"]
                    if not n["title"] or link in seen_links:
                        continue
                    seen_links.add(link)
                    all_news.append(PortfolioNewsItem(
                        title=n["title"],
                        publisher=n["publisher"],
                        link=link,
                        published_at=n["published_at"],
                        symbol=h.symbol,
                        name=h.name,
                    ))
            else:
                raw = yf.Ticker(h.symbol).news or []
                for n in raw[:5]:
                    content = n.get("content", {})
                    title = content.get("title") or n.get("title", "")
                    link_obj = content.get("canonicalUrl", {})
                    link = (link_obj.get("url") if isinstance(link_obj, dict) else "") or n.get("link", "")
                    publisher_info = content.get("provider", {})
                    publisher = (publisher_info.get("displayName") if isinstance(publisher_info, dict) else "") or n.get("publisher", "")
                    ts = n.get("providerPublishTime")
                    published = datetime.fromtimestamp(ts, tz=timezone.utc).isoformat() if ts else ""

                    if not title or not link or link in seen_links:
                        continue
                    seen_links.add(link)
                    all_news.append(PortfolioNewsItem(
                        title=title,
                        publisher=publisher,
                        link=link,
                        published_at=published,
                        symbol=h.symbol,
                        name=h.name,
                    ))
        except Exception:
            continue

    # Sort by published_at descending, take top 20
    all_news.sort(key=lambda x: x.published_at, reverse=True)
    result = all_news[:20]

    _news_cache["data"] = result
    _news_cache["fetched_at"] = datetime.utcnow()
    return result
