import os
from typing import List

from google import genai
from google.genai import types
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlmodel import Session, select

from database import get_session
from models import Holding, PriceSnapshot, PortfolioHistory, PortfolioAnalysis
from schemas import AllocationItem
from services.price_fetcher import fetch_usd_twd_rate, get_asset_currency, to_twd
from datetime import date, datetime, timedelta, timezone

router = APIRouter(prefix="/api/chat", tags=["chat"])

ASSET_TYPE_LABELS = {
    "tw_stock": "台灣股票",
    "us_stock": "美國股票",
    "tw_etf": "台灣ETF",
    "us_etf": "美國ETF",
    "tw_fund": "台灣共同基金",
    "crypto": "加密貨幣",
}


class ChatMessage(BaseModel):
    role: str  # "user" | "assistant"
    content: str


class ChatRequest(BaseModel):
    messages: List[ChatMessage]


class ChatResponse(BaseModel):
    response: str


def _build_portfolio_context(session: Session) -> str:
    rate = fetch_usd_twd_rate() or 32.0
    holdings = session.exec(select(Holding)).all()

    positions = []
    total_value = 0.0
    total_cost = 0.0

    for h in holdings:
        stmt = (
            select(PriceSnapshot)
            .where(PriceSnapshot.symbol == h.symbol)
            .order_by(PriceSnapshot.fetched_at.desc())
        )
        snap = session.exec(stmt).first()
        price = snap.price if snap else None
        currency = snap.currency if snap else h.currency

        cost_twd = to_twd(h.cost_per_unit * h.quantity, h.currency, rate) or 0
        value_twd = to_twd(price * h.quantity, currency, rate) if price else None
        pnl_pct = ((value_twd - cost_twd) / cost_twd * 100) if (value_twd and cost_twd > 0) else None

        if value_twd:
            total_value += value_twd
        total_cost += cost_twd

        positions.append({
            "symbol": h.symbol,
            "name": h.name,
            "asset_type": ASSET_TYPE_LABELS.get(h.asset_type, h.asset_type),
            "quantity": h.quantity,
            "cost_per_unit": h.cost_per_unit,
            "currency": h.currency,
            "notes": h.notes or "",
            "current_price": price,
            "price_currency": currency,
            "value_twd": value_twd,
            "cost_twd": cost_twd,
            "pnl_pct": pnl_pct,
        })

    # sort by value desc
    positions.sort(key=lambda x: x["value_twd"] or 0, reverse=True)

    total_pnl = total_value - total_cost
    total_pnl_pct = (total_pnl / total_cost * 100) if total_cost > 0 else 0

    lines = [
        "=== 使用者目前投資組合 ===",
        f"總市值：NT$ {total_value:,.0f}",
        f"總成本：NT$ {total_cost:,.0f}",
        f"帳面損益：NT$ {total_pnl:,.0f}（{total_pnl_pct:+.2f}%）",
        f"USD/TWD 匯率：{rate:.2f}",
        "",
        "持倉明細：",
    ]

    for p in positions:
        val_str = f"NT$ {p['value_twd']:,.0f}" if p["value_twd"] else "未取得價格"
        pnl_str = f"{p['pnl_pct']:+.2f}%" if p["pnl_pct"] is not None else "—"
        weight = (p["value_twd"] / total_value * 100) if (p["value_twd"] and total_value > 0) else 0
        notes_str = f"（{p['notes']}）" if p["notes"] else ""
        lines.append(
            f"  - {p['name']}（{p['symbol']}）{notes_str} | "
            f"類型：{p['asset_type']} | "
            f"市值：{val_str}（佔比 {weight:.1f}%） | "
            f"損益：{pnl_str}"
        )

    # recent trend
    since = date.today() - timedelta(days=30)
    history = session.exec(
        select(PortfolioHistory)
        .where(PortfolioHistory.record_date >= since)
        .order_by(PortfolioHistory.record_date)
    ).all()

    if len(history) >= 2:
        oldest = history[0]
        latest = history[-1]
        change = latest.total_value_twd - oldest.total_value_twd
        change_pct = (change / oldest.total_value_twd * 100) if oldest.total_value_twd > 0 else 0
        lines += [
            "",
            f"近30日市值變化：NT$ {change:+,.0f}（{change_pct:+.2f}%）",
        ]

    return "\n".join(lines)


SYSTEM_PROMPT = """你是一位專業的投資顧問助理，協助使用者分析其投資組合。
每次對話開始時，你都會收到使用者最新的持倉資料。

你的職責：
1. 根據持倉資料評估資產配置是否均衡（地區、資產類別、個股集中度）
2. 指出潛在風險（過度集中、匯率曝險、流動性等）
3. 提出具體的調整建議，但保持客觀，不做絕對的買賣建議
4. 以繁體中文回答，語氣專業但親切
5. 若使用者問的問題超出你能分析的範圍（例如具體股票走勢預測），誠實說明限制

注意事項：
- 你提供的是輔助分析，不構成正式投資建議
- 若使用者詢問某個持倉的看法，結合其在組合中的比重來回答
- 數字分析要具體，引用提供的持倉數據"""


ANALYSIS_PROMPT = """請根據以上投資組合資料，產生一份簡潔的投資組合狀況分析報告。
報告結構如下（使用 Markdown 格式）：

## 整體表現
（一段話摘要目前市值、損益狀況、近30日趨勢）

## 資產配置
（評估地區分散度、資產類別分散度、個股集中風險）

## 主要風險
（列點說明2-3個潛在風險：集中度、匯率、流動性等）

## 建議方向
（列點提出1-3個具體、可行的調整方向，保持客觀不做絕對買賣建議）

語言：繁體中文，語氣專業簡潔，每個段落不超過3句話。
注意：本分析僅為輔助參考，不構成正式投資建議。"""


class AnalyzeResponse(BaseModel):
    id: int
    analysis: str
    created_at: str


class AnalyzeListItem(BaseModel):
    id: int
    analysis: str
    created_at: str


@router.get("/analyze", response_model=list[AnalyzeListItem])
def list_analyses(session: Session = Depends(get_session)):
    rows = session.exec(
        select(PortfolioAnalysis).order_by(PortfolioAnalysis.created_at.desc()).limit(20)
    ).all()
    return [
        AnalyzeListItem(
            id=r.id,
            analysis=r.analysis_text,
            created_at=r.created_at.replace(tzinfo=timezone.utc).isoformat(),
        )
        for r in rows
    ]


@router.post("/analyze", response_model=AnalyzeResponse)
def analyze_portfolio(session: Session = Depends(get_session)):
    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        raise HTTPException(status_code=503, detail="GEMINI_API_KEY 未設定")

    portfolio_context = _build_portfolio_context(session)
    prompt = f"{portfolio_context}\n\n{ANALYSIS_PROMPT}"

    client = genai.Client(api_key=api_key)
    response = client.models.generate_content(
        model="gemini-2.5-flash",
        contents=prompt,
    )

    record = PortfolioAnalysis(analysis_text=response.text)
    session.add(record)
    session.commit()
    session.refresh(record)

    return AnalyzeResponse(
        id=record.id,
        analysis=record.analysis_text,
        created_at=record.created_at.replace(tzinfo=timezone.utc).isoformat(),
    )


@router.post("", response_model=ChatResponse)
def chat(body: ChatRequest, session: Session = Depends(get_session)):
    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        raise HTTPException(status_code=503, detail="GEMINI_API_KEY 未設定")

    portfolio_context = _build_portfolio_context(session)
    system = f"{SYSTEM_PROMPT}\n\n{portfolio_context}"

    client = genai.Client(api_key=api_key)

    # Convert to Gemini history format (all but last message)
    history = [
        types.Content(
            role="user" if m.role == "user" else "model",
            parts=[types.Part(text=m.content)],
        )
        for m in body.messages[:-1]
    ]
    chat_session = client.chats.create(
        model="gemini-2.5-flash",
        config=types.GenerateContentConfig(system_instruction=system),
        history=history,
    )
    response = chat_session.send_message(body.messages[-1].content)

    return ChatResponse(response=response.text)
