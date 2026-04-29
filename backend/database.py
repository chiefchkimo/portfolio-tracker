from pathlib import Path
from sqlalchemy import text
from sqlmodel import SQLModel, create_engine, Session

DB_PATH = Path(__file__).parent / "data" / "portfolio.db"
DB_PATH.parent.mkdir(exist_ok=True)

engine = create_engine(f"sqlite:///{DB_PATH}", echo=False)


def init_db():
    SQLModel.metadata.create_all(engine)
    # Migration: add notes column to existing DBs
    with engine.connect() as conn:
        try:
            conn.execute(text("ALTER TABLE holding ADD COLUMN notes TEXT"))
            conn.commit()
        except Exception:
            pass  # Column already exists


def get_session():
    with Session(engine) as session:
        yield session
