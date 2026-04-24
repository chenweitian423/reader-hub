from datetime import datetime

from sqlalchemy import Boolean, Column, DateTime, Float, Integer, Text

from app.database import Base


class BookSource(Base):
    __tablename__ = "book_sources"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(Text, nullable=False, unique=True)
    description = Column(Text, nullable=False, default="")
    enabled = Column(Boolean, nullable=False, default=True)
    config_json = Column(Text, nullable=False)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at = Column(
        DateTime,
        nullable=False,
        default=datetime.utcnow,
        onupdate=datetime.utcnow,
    )


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(Text, nullable=False, unique=True, index=True)
    password_hash = Column(Text, nullable=False, default="")
    role = Column(Text, nullable=False, default="user")
    enabled = Column(Boolean, nullable=False, default=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at = Column(
        DateTime,
        nullable=False,
        default=datetime.utcnow,
        onupdate=datetime.utcnow,
    )


class UserSession(Base):
    __tablename__ = "user_sessions"

    id = Column(Integer, primary_key=True, index=True)
    token = Column(Text, nullable=False, unique=True, index=True)
    user_id = Column(Integer, nullable=False, index=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    expires_at = Column(DateTime, nullable=False)


class ShelfBook(Base):
    __tablename__ = "shelf_books"

    id = Column(Integer, primary_key=True, index=True)
    book_key = Column(Text, nullable=False, unique=True, index=True)
    source_id = Column(Integer, nullable=False, index=True)
    source_name = Column(Text, nullable=False, default="")
    title = Column(Text, nullable=False, default="")
    author = Column(Text, nullable=False, default="")
    cover = Column(Text, nullable=False, default="")
    intro = Column(Text, nullable=False, default="")
    detail_url = Column(Text, nullable=False, default="")
    book_id = Column(Text, nullable=False, default="")
    category = Column(Text, nullable=False, default="")
    tags_json = Column(Text, nullable=False, default="[]")
    status = Column(Text, nullable=False, default="")
    latest_chapter = Column(Text, nullable=False, default="")
    book_json = Column(Text, nullable=False)
    last_chapter_json = Column(Text, nullable=False, default="{}")
    last_chapter_title = Column(Text, nullable=False, default="")
    last_chapter_index = Column(Integer, nullable=False, default=-1)
    added_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    last_read_at = Column(DateTime, nullable=True)
    updated_at = Column(
        DateTime,
        nullable=False,
        default=datetime.utcnow,
        onupdate=datetime.utcnow,
    )


class ReaderPreference(Base):
    __tablename__ = "reader_preferences"

    id = Column(Integer, primary_key=True, index=True)
    theme = Column(Text, nullable=False, default="warm")
    font_size = Column(Integer, nullable=False, default=17)
    content_width = Column(Integer, nullable=False, default=820)
    line_height = Column(Float, nullable=False, default=2.0)
    updated_at = Column(
        DateTime,
        nullable=False,
        default=datetime.utcnow,
        onupdate=datetime.utcnow,
    )


class CachedChapter(Base):
    __tablename__ = "cached_chapters"

    id = Column(Integer, primary_key=True, index=True)
    book_key = Column(Text, nullable=False, index=True)
    chapter_key = Column(Text, nullable=False, unique=True, index=True)
    source_id = Column(Integer, nullable=False, index=True)
    chapter_title = Column(Text, nullable=False, default="")
    chapter_index = Column(Integer, nullable=False, default=-1)
    chapter_json = Column(Text, nullable=False, default="{}")
    content = Column(Text, nullable=False, default="")
    cached_at = Column(DateTime, nullable=False, default=datetime.utcnow)


class PrefetchTask(Base):
    __tablename__ = "prefetch_tasks"

    id = Column(Integer, primary_key=True, index=True)
    task_id = Column(Text, nullable=False, unique=True, index=True)
    book_key = Column(Text, nullable=False, index=True)
    source_id = Column(Integer, nullable=False, index=True)
    status = Column(Text, nullable=False, default="pending")
    total_chapters = Column(Integer, nullable=False, default=0)
    completed_chapters = Column(Integer, nullable=False, default=0)
    failed_chapters = Column(Integer, nullable=False, default=0)
    message = Column(Text, nullable=False, default="")
    failures_json = Column(Text, nullable=False, default="[]")
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    started_at = Column(DateTime, nullable=True)
    finished_at = Column(DateTime, nullable=True)
    updated_at = Column(
        DateTime,
        nullable=False,
        default=datetime.utcnow,
        onupdate=datetime.utcnow,
    )
