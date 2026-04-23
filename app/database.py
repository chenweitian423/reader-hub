from sqlalchemy import create_engine, inspect, text
from sqlalchemy.orm import declarative_base, sessionmaker


DATABASE_URL = "sqlite:///./data/app.db"

engine = create_engine(
    DATABASE_URL,
    connect_args={"check_same_thread": False},
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db() -> None:
    from app import models

    models.Base.metadata.create_all(bind=engine)
    run_migrations()


def run_migrations() -> None:
    inspector = inspect(engine)
    with engine.begin() as connection:
        if "shelf_books" in inspector.get_table_names():
            columns = {column["name"] for column in inspector.get_columns("shelf_books")}
            if "category" not in columns:
                connection.execute(text("ALTER TABLE shelf_books ADD COLUMN category TEXT NOT NULL DEFAULT ''"))
            if "tags_json" not in columns:
                connection.execute(text("ALTER TABLE shelf_books ADD COLUMN tags_json TEXT NOT NULL DEFAULT '[]'"))
