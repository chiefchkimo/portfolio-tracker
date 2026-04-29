import os
from datetime import datetime, timezone
from typing import List, Optional

import yfinance as yf
from fastapi import APIRouter, Depends, HTTPException, Query
from google import genai
from google.genai import types
from pydantic import BaseModel
from sqlmodel import Session, select

from database import get_session
from models import Holding, PriceSnapshot, StockAnalysis
from services.price_fetcher import _normalize_symbol, fetch_usd_twd_rate, to_twd
from services.tw_news import get_tw_news_for_symbol

router = APIRouter(prefix="/api/stocks", tags=["stocks"])


# ── Pydantic schemas ────────────────────────────────────────────────

class PricePoint(BaseModel):
    date: str
    open: float
    high: float
    low: float
    close: float
    volume: Optional[int] = None


class NewsItem(BaseModel):
    title: str
    publisher: str
    link: str
    published_at: str


class StockDetail(BaseModel):
    symbol: str
    name: str
    currency: str
    current_price: Optional[float]
    prev_close: Optional[float]
    change: Optional[float]
    change_pct: Optional[float]
    high_52w: Optional[float]
    low_52w: Optional[float]
    market_cap: Optional[float]
    pe_ratio: Optional[float]
    dividend_yield: Optional[float]
    beta: Optional[float]
    history: List[PricePoint]
    news: List[NewsItem] = []


class StockAnalysisRecord(BaseModel):
    id: int
    symbol: str
    analysis: str
    created_at: str


# ── Technical indicator helpers ─────────────────────────────────────

def _ema(values: list[float], period: int) -> list[float]:
    k = 2 / (period + 1)
    result = []
    for i, v in enumerate(values):
        result.append(v if i == 0 else v * k + result[-1] * (1 - k))
    return result


def _last_ma(closes: list[float], period: int) -> float | None:
    return sum(closes[-period:]) / period if len(closes) >= period else None


def _last_macd(closes: list[float]) -> tuple[float, float, float] | None:
    if len(closes) < 26:
        return None
    ema12 = _ema(closes, 12)
    ema26 = _ema(closes, 26)
    macd_line = [a - b for a, b in zip(ema12, ema26)]
    signal = _ema(macd_line, 9)
    hist = macd_line[-1] - signal[-1]
    return macd_line[-1], signal[-1], hist


def _last_kd(rows: list[dict], n: int = 9) -> tuple[float, float]:
    k, d = 50.0, 50.0
    for i in range(len(rows)):
        window = rows[max(0, i - n + 1): i + 1]
        lo = min(r["low"] for r in window)
        hi = max(r["high"] for r in window)
        rsv = ((rows[i]["close"] - lo) / (hi - lo) * 100) if hi != lo else 50.0
        k = k * 2 / 3 + rsv / 3
        d = d * 2 / 3 + k / 3
    return k, d


# ── GET /api/stocks/{symbol} ─────────────────────────────────────────

@router.get("/{symbol}", response_model=StockDetail)
def get_stock_detail(
    symbol: str,
    period: str = Query("1y", pattern="^(1mo|3mo|6mo|1y|2y)$"),
    asset_type: str = Query("us_stock"),
):
    normalized = _normalize_symbol(symbol.upper(), asset_type)

    try:
        ticker = yf.Ticker(normalized)
        info = ticker.info or {}
        hist = ticker.history(period=period)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"無法取得資料：{e}")

    if hist.empty:
        raise HTTPException(status_code=404, detail="查無歷史價格資料")

    current = info.get("currentPrice") or info.get("regularMarketPrice")
    prev_close = info.get("previousClose") or info.get("regularMarketPreviousClose")

    if not current:
        try:
            current = ticker.fast_info.last_price
        except Exception:
            current = float(hist["Close"].iloc[-1]) if not hist.empty else None

    change = (current - prev_close) if (current and prev_close) else None
    change_pct = (change / prev_close * 100) if (change is not None and prev_close) else None

    name = info.get("longName") or info.get("shortName") or symbol
    currency = info.get("currency") or ("TWD" if normalized.endswith(".TW") else "USD")

    history = []
    for ts, row in hist.iterrows():
        d = ts.date().isoformat() if hasattr(ts, "date") else str(ts)
        history.append(PricePoint(
            date=d,
            open=float(row.get("Open") or row["Close"]),
            high=float(row.get("High") or row["Close"]),
            low=float(row.get("Low") or row["Close"]),
            close=float(row["Close"]),
            volume=int(row["Volume"]) if row.get("Volume") is not None else None,
        ))

    div_yield = info.get("dividendYield")
    if div_yield:
        div_yield = round(div_yield * 100, 2)

    news_items: List[NewsItem] = []
    try:
        if normalized.endswith(".TW"):
            stock_code = normalized.replace(".TW", "")
            for n in get_tw_news_for_symbol(stock_code, limit=6):
                news_items.append(NewsItem(
                    title=n["title"],
                    publisher=n["publisher"],
                    link=n["link"],
                    published_at=n["published_at"],
                ))
        else:
            raw_news = ticker.news or []
            for n in raw_news[:6]:
                ts = n.get("providerPublishTime")
                published = datetime.fromtimestamp(ts, tz=timezone.utc).isoformat() if ts else ""
                content = n.get("content", {})
                title = content.get("title") or n.get("title", "")
                publisher_info = content.get("provider", {})
                publisher = (publisher_info.get("displayName") if isinstance(publisher_info, dict) else "") or n.get("publisher", "")
                link = (content.get("canonicalUrl", {}).get("url", "") if isinstance(content.get("canonicalUrl"), dict) else "") or n.get("link", "")
                if title and link:
                    news_items.append(NewsItem(title=title, publisher=publisher, link=link, published_at=published))
    except Exception:
        pass

    return StockDetail(
        symbol=symbol.upper(),
        name=name,
        currency=currency,
        current_price=current,
        prev_close=prev_close,
        change=round(change, 2) if change is not None else None,
        change_pct=round(change_pct, 2) if change_pct is not None else None,
        high_52w=info.get("fiftyTwoWeekHigh"),
        low_52w=info.get("fiftyTwoWeekLow"),
        market_cap=info.get("marketCap"),
        pe_ratio=info.get("trailingPE") or info.get("forwardPE"),
        dividend_yield=div_yield,
        beta=info.get("beta"),
        history=history,
        news=news_items,
    )


# ── GET /api/stocks/{symbol}/analyses ───────────────────────────────

@router.get("/{symbol}/analyses", response_model=list[StockAnalysisRecord])
def list_stock_analyses(symbol: str, session: Session = Depends(get_session)):
    rows = session.exec(
        select(StockAnalysis)
        .where(StockAnalysis.symbol == symbol.upper())
        .order_by(StockAnalysis.created_at.desc())
        .limit(10)
    ).all()
    return [
        StockAnalysisRecord(
            id=r.id,
            symbol=r.symbol,
            analysis=r.analysis_text,
            created_at=r.created_at.replace(tzinfo=timezone.utc).isoformat(),
        )
        for r in rows
    ]


# ── POST /api/stocks/{symbol}/analyze ───────────────────────────────

STOCK_ANALYSIS_PROMPT = """請根據以上資料，為這支股票產生一份簡潔的分析報告，使用 Markdown 格式：

## 目前位置
（現價在52週區間的百分位，以及相對於 MA5/20/60 的多空排列）

## 技術指標解讀
（MA趨勢 / MACD訊號強弱 / KD超買超賣位置，說明短中長期動能方向）

## 消息面
（一句話摘要近期新聞的整體傾向：正面 / 中性 / 負面）

## 操作參考建議
根據技術面與基本面，給出以下三個明確的參考建議（每項1-2句說明理由）：
- **繼續持有**：（何種條件下適合繼續持有，適合哪類型投資人）
- **加碼買進**：（何種條件或價位可考慮加碼）
- **考慮減碼/平倉**：（何種技術訊號或情境下應警覺）

語言：繁體中文，專業簡潔。最後加上：「以上分析僅供參考，不構成投資建議，投資有風險。」"""


@router.post("/{symbol}/analyze", response_model=StockAnalysisRecord)
def analyze_stock(
    symbol: str,
    asset_type: str = Query("us_stock"),
    session: Session = Depends(get_session),
):
    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        raise HTTPException(status_code=503, detail="GEMINI_API_KEY 未設定")

    sym_upper = symbol.upper()
    normalized = _normalize_symbol(sym_upper, asset_type)

    # Fetch market data
    try:
        ticker = yf.Ticker(normalized)
        info = ticker.info or {}
        hist = ticker.history(period="1y")
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"無法取得資料：{e}")

    current = info.get("currentPrice") or info.get("regularMarketPrice")
    if not current:
        try:
            current = ticker.fast_info.last_price
        except Exception:
            current = float(hist["Close"].iloc[-1]) if not hist.empty else None

    prev_close = info.get("previousClose") or info.get("regularMarketPreviousClose")
    change_pct = ((current - prev_close) / prev_close * 100) if (current and prev_close) else None
    name = info.get("longName") or info.get("shortName") or sym_upper
    currency = info.get("currency") or ("TWD" if normalized.endswith(".TW") else "USD")
    high_52w = info.get("fiftyTwoWeekHigh")
    low_52w = info.get("fiftyTwoWeekLow")
    pe = info.get("trailingPE") or info.get("forwardPE")
    div_yield = info.get("dividendYield")
    beta = info.get("beta")

    # Build OHLCV rows for indicators
    rows = []
    closes = []
    for _, row in hist.iterrows():
        c = float(row["Close"])
        rows.append({
            "close": c,
            "high": float(row.get("High") or c),
            "low": float(row.get("Low") or c),
        })
        closes.append(c)

    ma5 = _last_ma(closes, 5)
    ma20 = _last_ma(closes, 20)
    ma60 = _last_ma(closes, 60)
    macd_result = _last_macd(closes)
    kd_result = _last_kd(rows) if len(rows) >= 9 else None

    def pos(price, ma):
        if price is None or ma is None:
            return "—"
        return "上方 ✅" if price > ma else "下方 ⚠️"

    def pct_of_range(price, lo, hi):
        if price is None or lo is None or hi is None or hi == lo:
            return "—"
        return f"{(price - lo) / (hi - lo) * 100:.1f}%"

    # Fetch news headlines
    news_lines = []
    try:
        if normalized.endswith(".TW"):
            stock_code = normalized.replace(".TW", "")
            for n in get_tw_news_for_symbol(stock_code, limit=5):
                if n["title"]:
                    news_lines.append(f"  - {n['title']}")
        else:
            raw_news = ticker.news or []
            for n in raw_news[:5]:
                content = n.get("content", {})
                title = content.get("title") or n.get("title", "")
                if title:
                    news_lines.append(f"  - {title}")
    except Exception:
        pass

    # Holding info from DB
    holding_lines = []
    holdings = session.exec(select(Holding).where(Holding.symbol == sym_upper)).all()
    if holdings:
        rate = fetch_usd_twd_rate() or 32.0
        for h in holdings:
            snap = session.exec(
                select(PriceSnapshot)
                .where(PriceSnapshot.symbol == sym_upper)
                .order_by(PriceSnapshot.fetched_at.desc())
            ).first()
            price_now = snap.price if snap else current
            cost_twd = to_twd(h.cost_per_unit * h.quantity, h.currency, rate) or 0
            value_twd = to_twd((price_now or 0) * h.quantity, currency, rate) or 0
            pnl_pct = ((value_twd - cost_twd) / cost_twd * 100) if cost_twd > 0 else None
            broker = f"（{h.notes}）" if h.notes else ""
            holding_lines.append(
                f"  - {broker}成本 {h.currency} {h.cost_per_unit:.2f}，"
                f"數量 {h.quantity}，"
                f"損益 {pnl_pct:+.2f}%" if pnl_pct is not None else
                f"  - {broker}成本 {h.currency} {h.cost_per_unit:.2f}，數量 {h.quantity}"
            )

    # Build prompt context
    lines = [
        f"=== 個股資料：{name}（{sym_upper}） ===",
        "",
        "【基本資訊】",
        f"  現價：{current:.2f} {currency}" if current else "  現價：—",
        f"  今日變動：{change_pct:+.2f}%" if change_pct is not None else "  今日變動：—",
        f"  52週高：{high_52w}　低：{low_52w}　目前位於區間 {pct_of_range(current, low_52w, high_52w)}",
        f"  本益比：{pe:.1f}" if pe else "  本益比：—",
        f"  殖利率：{div_yield * 100:.2f}%" if div_yield else "  殖利率：—",
        f"  Beta：{beta:.2f}" if beta else "  Beta：—",
        "",
        "【技術指標（最近交易日）】",
        f"  MA5：{ma5:.2f}　→ 股價在 MA5 {pos(current, ma5)}" if ma5 else "  MA5：資料不足",
        f"  MA20：{ma20:.2f}　→ 股價在 MA20 {pos(current, ma20)}" if ma20 else "  MA20：資料不足",
        f"  MA60：{ma60:.2f}　→ 股價在 MA60 {pos(current, ma60)}" if ma60 else "  MA60：資料不足",
    ]

    if macd_result:
        m, sig, hst = macd_result
        trend = "翻正（動能轉強）" if hst > 0 else "翻負（動能轉弱）"
        lines += [
            f"  MACD：{m:.3f}　Signal：{sig:.3f}　Histogram：{hst:.3f}（{trend}）",
        ]
    else:
        lines.append("  MACD：資料不足")

    if kd_result:
        k, d = kd_result
        kd_status = "超買區（>80）" if k > 80 else "超賣區（<20）" if k < 20 else "中性區間"
        cross = "K 上穿 D（黃金交叉）" if k > d else "K 下穿 D（死亡交叉）"
        lines.append(f"  KD：K={k:.1f}　D={d:.1f}　{kd_status}，{cross}")
    else:
        lines.append("  KD：資料不足")

    if news_lines:
        lines += ["", "【近期新聞標題】"] + news_lines
    else:
        lines += ["", "【近期新聞】無資料"]

    if holding_lines:
        lines += ["", "【使用者持倉】"] + holding_lines
    else:
        lines += ["", "【使用者持倉】未持有此股票"]

    prompt = "\n".join(lines) + "\n\n" + STOCK_ANALYSIS_PROMPT

    # Call Gemini
    client = genai.Client(api_key=api_key)
    response = client.models.generate_content(
        model="gemini-2.5-flash",
        contents=prompt,
    )

    record = StockAnalysis(symbol=sym_upper, analysis_text=response.text)
    session.add(record)
    session.commit()
    session.refresh(record)

    return StockAnalysisRecord(
        id=record.id,
        symbol=record.symbol,
        analysis=record.analysis_text,
        created_at=record.created_at.replace(tzinfo=timezone.utc).isoformat(),
    )
