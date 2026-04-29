from datetime import datetime, date
from typing import Optional
from pydantic import BaseModel


class HoldingCreate(BaseModel):
    symbol: str
    name: str
    asset_type: str
    quantity: float
    cost_per_unit: float
    currency: str
    notes: Optional[str] = None


class HoldingUpdate(BaseModel):
    name: Optional[str] = None
    asset_type: Optional[str] = None
    quantity: Optional[float] = None
    cost_per_unit: Optional[float] = None
    currency: Optional[str] = None
    notes: Optional[str] = None


class HoldingOut(BaseModel):
    id: int
    symbol: str
    name: str
    asset_type: str
    quantity: float
    cost_per_unit: float
    currency: str
    notes: Optional[str] = None
    current_price: Optional[float] = None
    price_currency: Optional[str] = None
    value_twd: Optional[float] = None
    cost_twd: Optional[float] = None
    pnl_pct: Optional[float] = None
    fetched_at: Optional[datetime] = None


class PriceOut(BaseModel):
    symbol: str
    price: Optional[float]
    currency: str
    fetched_at: Optional[datetime]


class RefreshResult(BaseModel):
    refreshed: list[str]
    failed: list[str]
    usd_twd_rate: Optional[float]


class SummaryOut(BaseModel):
    total_value_twd: float
    total_cost_twd: float
    pnl_twd: float
    pnl_pct: float
    usd_twd_rate: Optional[float]
    by_type: list[dict]


class AllocationItem(BaseModel):
    symbol: str
    name: str
    asset_type: str
    value_twd: float
    weight_pct: float


class HistoryPoint(BaseModel):
    date: date
    total_value_twd: float
    total_cost_twd: float
