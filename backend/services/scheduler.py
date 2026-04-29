import logging
from datetime import datetime

from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger
from sqlmodel import Session, select

from database import engine
from models import Holding, PriceSnapshot
from services.price_fetcher import fetch_price, fetch_usd_twd_rate, get_asset_currency

logger = logging.getLogger(__name__)
scheduler = BackgroundScheduler(timezone="Asia/Taipei")


def _refresh_and_snapshot():
    logger.info("Scheduler: refreshing prices and saving snapshot")
    from routers.portfolio import _upsert_history, _build_position_values
    from datetime import date

    with Session(engine) as session:
        holdings = session.exec(select(Holding)).all()
        rate = fetch_usd_twd_rate()

        for h in holdings:
            currency = get_asset_currency(h.asset_type)
            price = fetch_price(h.symbol, h.asset_type)
            if price is not None:
                snap = PriceSnapshot(
                    symbol=h.symbol,
                    price=price,
                    currency=currency,
                    fetched_at=datetime.utcnow(),
                )
                session.add(snap)
        session.commit()

        positions = _build_position_values(session, rate)
        total_value = sum(p["value_twd"] for p in positions if p["value_twd"] is not None)
        total_cost = sum(p["cost_twd"] for p in positions if p["cost_twd"] is not None)
        snap_list = [
            {"symbol": p["holding"].symbol, "value_twd": p["value_twd"] or 0}
            for p in positions
        ]
        _upsert_history(session, date.today(), total_value, total_cost, snap_list)
        logger.info(f"Scheduler: snapshot saved, total_value_twd={total_value:.0f}")


def start_scheduler():
    scheduler.add_job(_refresh_and_snapshot, CronTrigger(hour=18, minute=0), id="tw_close")
    scheduler.add_job(_refresh_and_snapshot, CronTrigger(hour=22, minute=0), id="us_close")
    scheduler.start()
    logger.info("APScheduler started (18:00 and 22:00 Asia/Taipei)")


def stop_scheduler():
    if scheduler.running:
        scheduler.shutdown()
