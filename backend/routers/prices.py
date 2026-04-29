from datetime import datetime
from typing import List, Optional

import yfinance as yf
from fastapi import APIRouter, Depends
from sqlmodel import Session, select

from database import get_session
from models import Holding, PriceSnapshot
from schemas import PriceOut, RefreshResult
from services.price_fetcher import fetch_price, fetch_usd_twd_rate, get_asset_currency
from services.tw_names import get_tw_chinese_name

router = APIRouter(prefix="/api/prices", tags=["prices"])


@router.post("/refresh", response_model=RefreshResult)
def refresh_prices(session: Session = Depends(get_session)):
    holdings = session.exec(select(Holding)).all()
    rate = fetch_usd_twd_rate()
    refreshed = []
    failed = []

    for holding in holdings:
        currency = get_asset_currency(holding.asset_type)
        price = fetch_price(holding.symbol, holding.asset_type)
        if price is not None:
            snap = PriceSnapshot(
                symbol=holding.symbol,
                price=price,
                currency=currency,
                fetched_at=datetime.utcnow(),
            )
            session.add(snap)
            refreshed.append(holding.symbol)
        else:
            failed.append(holding.symbol)

    session.commit()
    return RefreshResult(refreshed=refreshed, failed=failed, usd_twd_rate=rate)


@router.get("/lookup")
def lookup_symbol(symbol: str):
    """Get display name: Chinese name for .TW/.TWO symbols, English from yfinance otherwise."""
    sym = symbol.upper()

    # Taiwan stocks — prefer Chinese name from TWSE/TPEx
    if sym.endswith(".TW") or sym.endswith(".TWO"):
        name = get_tw_chinese_name(sym)
        if name:
            return {"symbol": sym, "name": name}

    # Fallback: yfinance English name
    try:
        info = yf.Ticker(sym).info
        name = info.get("longName") or info.get("shortName") or ""
        return {"symbol": sym, "name": name}
    except Exception:
        return {"symbol": sym, "name": ""}


@router.post("/refresh-names")
def refresh_tw_names(session: Session = Depends(get_session)):
    """Update Chinese names for all Taiwan stock/ETF/fund holdings."""
    holdings = session.exec(select(Holding)).all()
    updated = []
    for h in holdings:
        if h.asset_type in ("tw_stock", "tw_etf", "tw_fund"):
            name = get_tw_chinese_name(h.symbol)
            if name and name != h.name:
                h.name = name
                session.add(h)
                updated.append({"symbol": h.symbol, "name": name})
    session.commit()
    return {"updated": updated, "count": len(updated)}


@router.get("/latest", response_model=List[PriceOut])
def latest_prices(session: Session = Depends(get_session)):
    holdings = session.exec(select(Holding)).all()
    results = []
    for holding in holdings:
        stmt = (
            select(PriceSnapshot)
            .where(PriceSnapshot.symbol == holding.symbol)
            .order_by(PriceSnapshot.fetched_at.desc())
        )
        snap = session.exec(stmt).first()
        results.append(
            PriceOut(
                symbol=holding.symbol,
                price=snap.price if snap else None,
                currency=snap.currency if snap else holding.currency,
                fetched_at=snap.fetched_at if snap else None,
            )
        )
    return results
