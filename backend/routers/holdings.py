from datetime import datetime
from typing import List

from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select

from database import get_session
from models import Holding, PriceSnapshot
from schemas import HoldingCreate, HoldingOut, HoldingUpdate
from services.price_fetcher import fetch_usd_twd_rate, get_asset_currency, to_twd

router = APIRouter(prefix="/api/holdings", tags=["holdings"])


def _enrich(holding: Holding, session: Session, rate: float) -> HoldingOut:
    stmt = (
        select(PriceSnapshot)
        .where(PriceSnapshot.symbol == holding.symbol)
        .order_by(PriceSnapshot.fetched_at.desc())
    )
    snap = session.exec(stmt).first()

    price = snap.price if snap else None
    currency = snap.currency if snap else holding.currency
    fetched_at = snap.fetched_at if snap else None

    value_twd = None
    cost_twd = None
    pnl_pct = None

    if price is not None:
        value_twd = to_twd(price * holding.quantity, currency, rate)
        cost_twd = to_twd(holding.cost_per_unit * holding.quantity, holding.currency, rate)
        if cost_twd and cost_twd > 0:
            pnl_pct = (value_twd - cost_twd) / cost_twd * 100

    return HoldingOut(
        id=holding.id,
        symbol=holding.symbol,
        name=holding.name,
        asset_type=holding.asset_type,
        quantity=holding.quantity,
        cost_per_unit=holding.cost_per_unit,
        currency=holding.currency,
        notes=holding.notes,
        current_price=price,
        price_currency=currency,
        value_twd=value_twd,
        cost_twd=cost_twd,
        pnl_pct=pnl_pct,
        fetched_at=fetched_at,
    )


@router.get("", response_model=List[HoldingOut])
def list_holdings(session: Session = Depends(get_session)):
    holdings = session.exec(select(Holding)).all()
    rate = fetch_usd_twd_rate()
    return [_enrich(h, session, rate) for h in holdings]


@router.post("", response_model=HoldingOut, status_code=201)
def create_holding(body: HoldingCreate, session: Session = Depends(get_session)):
    holding = Holding(**body.model_dump())
    session.add(holding)
    session.commit()
    session.refresh(holding)
    rate = fetch_usd_twd_rate()
    return _enrich(holding, session, rate)


@router.put("/{holding_id}", response_model=HoldingOut)
def update_holding(
    holding_id: int,
    body: HoldingUpdate,
    session: Session = Depends(get_session),
):
    holding = session.get(Holding, holding_id)
    if not holding:
        raise HTTPException(status_code=404, detail="Holding not found")
    data = body.model_dump(exclude_unset=True)
    for k, v in data.items():
        setattr(holding, k, v)
    holding.updated_at = datetime.utcnow()
    session.add(holding)
    session.commit()
    session.refresh(holding)
    rate = fetch_usd_twd_rate()
    return _enrich(holding, session, rate)


from pydantic import BaseModel as PydanticBase


class ManualPriceBody(PydanticBase):
    price: float


@router.delete("/{holding_id}", status_code=204)
def delete_holding(holding_id: int, session: Session = Depends(get_session)):
    holding = session.get(Holding, holding_id)
    if not holding:
        raise HTTPException(status_code=404, detail="Holding not found")
    session.delete(holding)
    session.commit()


@router.post("/{holding_id}/nav", response_model=HoldingOut)
def set_manual_nav(
    holding_id: int,
    body: ManualPriceBody,
    session: Session = Depends(get_session),
):
    holding = session.get(Holding, holding_id)
    if not holding:
        raise HTTPException(status_code=404, detail="Holding not found")
    snap = PriceSnapshot(
        symbol=holding.symbol,
        price=body.price,
        currency=holding.currency,
        fetched_at=datetime.utcnow(),
    )
    session.add(snap)
    session.commit()
    rate = fetch_usd_twd_rate()
    return _enrich(holding, session, rate)
