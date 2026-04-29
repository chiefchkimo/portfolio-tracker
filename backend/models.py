from datetime import datetime
from datetime import date as DateType
from typing import Optional
from sqlmodel import SQLModel, Field


class Holding(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    symbol: str = Field(index=True)
    name: str
    asset_type: str
    quantity: float
    cost_per_unit: float
    currency: str
    notes: Optional[str] = Field(default=None)
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)


class PriceSnapshot(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    symbol: str = Field(index=True)
    price: float
    currency: str
    fetched_at: datetime = Field(default_factory=datetime.utcnow)


class PortfolioHistory(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    record_date: DateType = Field(index=True)
    total_value_twd: float
    total_cost_twd: float
    snapshot_json: str


class PortfolioAnalysis(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    created_at: datetime = Field(default_factory=datetime.utcnow, index=True)
    analysis_text: str


class StockAnalysis(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    symbol: str = Field(index=True)
    created_at: datetime = Field(default_factory=datetime.utcnow, index=True)
    analysis_text: str
