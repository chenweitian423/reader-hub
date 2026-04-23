from __future__ import annotations

import asyncio
import hashlib
import json
import os
import uuid
from contextlib import asynccontextmanager
from datetime import datetime
from json import JSONDecodeError
from pathlib import Path
from typing import Any, Optional

from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.database import SessionLocal, get_db, init_db
from app.models import BookSource, CachedChapter, PrefetchTask, ReaderPreference, ShelfBook
from app.schemas import (
    AppMetaRead,
    BackupRestoreRequest,
    BackupRestoreResponse,
    BookOpenRequest,
    BookOpenResponse,
    BookSourceRead,
    BookSourceUpdate,
    CachedChapterRead,
    ChapterCacheRequest,
    ChapterContentRequest,
    ChapterContentResponse,
    ChapterPrefetchResponse,
    DashboardSummaryRead,
    PrefetchTaskRead,
    ReaderPreferenceRead,
    ReaderPreferenceUpdate,
    ReadingProgressUpdate,
    SearchRequest,
    SearchResponse,
    ShelfBookCreate,
    ShelfBookRead,
    ShelfBookUpdate,
)
from app.services.demo_library import demo_library_stats, get_demo_book, search_demo_books
from app.services.source_executor import (
    build_context,
    dumps_config,
    execute_mapping_request,
    loads_config,
    normalize_source_payload,
    search_source,
)
from app.version import APP_VERSION


BASE_DIR = Path(__file__).resolve().parent
STATIC_DIR = BASE_DIR / "static"
SAMPLE_SOURCES_PATH = STATIC_DIR / "sample_sources.json"
BACKGROUND_PREFETCH_TASKS: set[asyncio.Task[Any]] = set()
APP_TITLE = os.getenv("READER_HUB_APP_TITLE", "Reader Hub").strip() or "Reader Hub"
AUTO_SEED_DEMO_SOURCE = os.getenv("READER_HUB_AUTO_SEED_DEMO_SOURCE", "true").strip().lower() not in {
    "0",
    "false",
    "no",
    "off",
}


def ensure_demo_source_seeded() -> None:
    if not SAMPLE_SOURCES_PATH.exists():
        return

    db = SessionLocal()
    try:
        existing = db.query(BookSource).filter(BookSource.name == "内置演示书源").first()
        if existing:
            return

        payload = json.loads(SAMPLE_SOURCES_PATH.read_text(encoding="utf-8"))
        sources = normalize_source_payload(payload)
        for item in sources:
            if item.name != "内置演示书源":
                continue
            source = BookSource(
                name=item.name,
                description=item.description,
                enabled=item.enabled,
                config_json=dumps_config(item.model_dump()),
            )
            db.add(source)
            db.commit()
            return
    finally:
        db.close()


@asynccontextmanager
async def lifespan(_: FastAPI):
    init_db()
    if AUTO_SEED_DEMO_SOURCE:
        ensure_demo_source_seeded()
    yield


app = FastAPI(title=APP_TITLE, version=APP_VERSION, lifespan=lifespan)
app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")


def serialize_source(source: BookSource) -> BookSourceRead:
    return BookSourceRead(
        id=source.id,
        name=source.name,
        description=source.description,
        enabled=source.enabled,
        config=loads_config(source.config_json),
    )


def build_book_key(source_id: int, book: dict[str, Any]) -> str:
    identity = (
        str(book.get("book_id", "")).strip()
        or str(book.get("detail_url", "")).strip()
        or f"{book.get('title', '').strip()}|{book.get('author', '').strip()}"
    )
    return hashlib.sha1(f"{source_id}|{identity}".encode("utf-8")).hexdigest()


def build_chapter_key(book_key: str, chapter: dict[str, Any]) -> str:
    identity = (
        str(chapter.get("chapter_id", "")).strip()
        or str(chapter.get("chapter_url", "")).strip()
        or str(chapter.get("title", "")).strip()
    )
    return hashlib.sha1(f"{book_key}|{identity}".encode("utf-8")).hexdigest()


def normalize_book_payload(source_id: int, source_name: str, book: dict[str, Any]) -> dict[str, Any]:
    normalized = {
        "source_id": source_id,
        "source_name": source_name,
        "title": book.get("title", ""),
        "author": book.get("author", ""),
        "cover": book.get("cover", ""),
        "intro": book.get("intro", ""),
        "detail_url": book.get("detail_url", ""),
        "book_id": book.get("book_id", ""),
        "book_key": book.get("book_key", ""),
        "latest_chapter": book.get("latest_chapter", ""),
        "status": book.get("status", ""),
        "raw": book.get("raw", {}),
    }
    normalized["book_key"] = normalized["book_key"] or build_book_key(source_id, normalized)
    return normalized


def normalize_chapter_payload(book_key: str, chapter: dict[str, Any]) -> dict[str, Any]:
    normalized = {
        "title": chapter.get("title", ""),
        "chapter_id": chapter.get("chapter_id", ""),
        "chapter_url": chapter.get("chapter_url", ""),
        "raw": chapter.get("raw", {}),
    }
    normalized["chapter_key"] = chapter.get("chapter_key", "") or build_chapter_key(book_key, normalized)
    return normalized


def serialize_cached_chapter(chapter: CachedChapter) -> CachedChapterRead:
    return CachedChapterRead(
        chapter_key=chapter.chapter_key,
        title=chapter.chapter_title,
        chapter_index=chapter.chapter_index,
        chapter=loads_config(chapter.chapter_json),
        cached_at=chapter.cached_at,
    )


def serialize_prefetch_task(task: PrefetchTask) -> PrefetchTaskRead:
    return PrefetchTaskRead(
        task_id=task.task_id,
        book_key=task.book_key,
        source_id=task.source_id,
        status=task.status,
        total_chapters=task.total_chapters,
        completed_chapters=task.completed_chapters,
        failed_chapters=task.failed_chapters,
        message=task.message,
        failures=loads_config(task.failures_json),
        created_at=task.created_at,
        started_at=task.started_at,
        finished_at=task.finished_at,
    )


def serialize_shelf_book(book: ShelfBook, cached_count: int = 0) -> ShelfBookRead:
    return ShelfBookRead(
        book_key=book.book_key,
        source_id=book.source_id,
        source_name=book.source_name,
        title=book.title,
        author=book.author,
        cover=book.cover,
        intro=book.intro,
        detail_url=book.detail_url,
        book_id=book.book_id,
        category=book.category,
        tags=loads_config(book.tags_json),
        status=book.status,
        latest_chapter=book.latest_chapter,
        book=loads_config(book.book_json),
        last_chapter=loads_config(book.last_chapter_json),
        last_chapter_title=book.last_chapter_title,
        last_chapter_index=book.last_chapter_index,
        cached_chapter_count=cached_count,
        added_at=book.added_at,
        last_read_at=book.last_read_at,
    )


def parse_optional_datetime(value: str | None) -> datetime | None:
    if not value:
        return None
    normalized = value.strip()
    if not normalized:
        return None
    normalized = normalized.replace("Z", "+00:00")
    parsed = datetime.fromisoformat(normalized)
    if parsed.tzinfo is not None:
        return parsed.astimezone().replace(tzinfo=None)
    return parsed


def get_source_or_404(source_id: int, db: Session) -> BookSource:
    source = db.query(BookSource).filter(BookSource.id == source_id).first()
    if not source:
        raise HTTPException(status_code=404, detail="书源不存在")
    return source


def get_shelf_book_or_404(book_key: str, db: Session) -> ShelfBook:
    shelf_book = db.query(ShelfBook).filter(ShelfBook.book_key == book_key).first()
    if not shelf_book:
        raise HTTPException(status_code=404, detail="书架书籍不存在")
    return shelf_book


def get_prefetch_task_or_404(task_id: str, db: Session) -> PrefetchTask:
    task = db.query(PrefetchTask).filter(PrefetchTask.task_id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="缓存任务不存在")
    return task


def get_or_create_preferences(db: Session) -> ReaderPreference:
    preference = db.query(ReaderPreference).filter(ReaderPreference.id == 1).first()
    if preference:
        return preference

    preference = ReaderPreference(id=1)
    db.add(preference)
    db.commit()
    db.refresh(preference)
    return preference


def serialize_preferences(preference: ReaderPreference) -> ReaderPreferenceRead:
    return ReaderPreferenceRead(
        theme=preference.theme,
        font_size=preference.font_size,
        content_width=preference.content_width,
        line_height=preference.line_height,
    )


def upsert_shelf_book(
    db: Session,
    *,
    source_id: int,
    source_name: str,
    book: dict[str, Any],
) -> ShelfBook:
    normalized_book = normalize_book_payload(source_id, source_name, book)
    shelf_book = db.query(ShelfBook).filter(ShelfBook.book_key == normalized_book["book_key"]).first()
    if not shelf_book:
        shelf_book = ShelfBook(
            book_key=normalized_book["book_key"],
            source_id=source_id,
            source_name=source_name,
            added_at=datetime.utcnow(),
        )

    shelf_book.source_id = source_id
    shelf_book.source_name = source_name
    shelf_book.title = normalized_book["title"]
    shelf_book.author = normalized_book["author"]
    shelf_book.cover = normalized_book["cover"]
    shelf_book.intro = normalized_book["intro"]
    shelf_book.detail_url = normalized_book["detail_url"]
    shelf_book.book_id = normalized_book["book_id"]
    shelf_book.status = normalized_book["status"]
    shelf_book.latest_chapter = normalized_book["latest_chapter"]
    shelf_book.book_json = dumps_config(normalized_book)
    db.add(shelf_book)
    db.flush()
    return shelf_book


def get_cached_chapter(db: Session, book_key: str, chapter_key: str) -> CachedChapter | None:
    return (
        db.query(CachedChapter)
        .filter(CachedChapter.book_key == book_key, CachedChapter.chapter_key == chapter_key)
        .first()
    )


async def resolve_chapter_content(
    db: Session,
    *,
    source: BookSource,
    source_config: dict[str, Any],
    book: dict[str, Any],
    chapter: dict[str, Any],
    chapter_index: int = -1,
) -> tuple[CachedChapter, bool]:
    normalized_book = normalize_book_payload(source.id, source.name, book)
    normalized_chapter = normalize_chapter_payload(normalized_book["book_key"], chapter)
    cached = get_cached_chapter(db, normalized_book["book_key"], normalized_chapter["chapter_key"])
    if cached and cached.content.strip():
        return cached, True

    if not source.enabled:
        raise HTTPException(status_code=400, detail="当前书源已停用，且本章节尚未缓存")
    if not source_config.get("content"):
        raise HTTPException(status_code=400, detail="当前书源未配置正文接口")

    context = build_context(
        normalized_book,
        normalized_book.get("raw", {}),
        normalized_chapter,
        normalized_chapter.get("raw", {}),
    )
    content_items = await execute_mapping_request(source_config["content"], context)
    if not content_items:
        raise HTTPException(status_code=400, detail="当前章节没有获取到正文内容")

    content_item = content_items[0]
    content = content_item.get("content", "").strip()
    if not content:
        raise HTTPException(status_code=400, detail="当前章节正文为空")

    cached = cached or CachedChapter(
        book_key=normalized_book["book_key"],
        chapter_key=normalized_chapter["chapter_key"],
        source_id=source.id,
    )
    cached.chapter_title = content_item.get("title") or normalized_chapter["title"]
    cached.chapter_index = chapter_index
    cached.chapter_json = dumps_config(normalized_chapter)
    cached.content = content
    cached.cached_at = datetime.utcnow()
    db.add(cached)
    db.flush()
    return cached, False


async def run_prefetch_task(
    *,
    task_id: str,
    source_id: int,
    book: dict[str, Any],
    chapters: list[dict[str, Any]],
) -> None:
    db = SessionLocal()
    try:
        task = get_prefetch_task_or_404(task_id, db)
        task.status = "running"
        task.started_at = datetime.utcnow()
        task.message = "正在缓存章节"
        db.add(task)
        db.commit()
        db.refresh(task)

        source = get_source_or_404(source_id, db)
        source_config = loads_config(source.config_json)
        normalized_book = normalize_book_payload(source.id, source.name, book)
        upsert_shelf_book(db, source_id=source.id, source_name=source.name, book=normalized_book)
        db.commit()

        failures: list[str] = []
        completed = 0
        failed = 0

        for index, chapter in enumerate(chapters):
            try:
                await resolve_chapter_content(
                    db,
                    source=source,
                    source_config=source_config,
                    book=normalized_book,
                    chapter=chapter,
                    chapter_index=index,
                )
                completed += 1
            except HTTPException as exc:
                failed += 1
                failures.append(f"{chapter.get('title', f'第{index + 1}章')}: {exc.detail}")
            except Exception as exc:
                failed += 1
                failures.append(f"{chapter.get('title', f'第{index + 1}章')}: {exc}")

            task.completed_chapters = completed
            task.failed_chapters = failed
            task.message = f"已完成 {completed}/{task.total_chapters} 章"
            task.failures_json = dumps_config(failures)
            db.add(task)
            db.commit()

        task.status = "completed"
        task.finished_at = datetime.utcnow()
        task.message = (
            f"缓存完成，共 {completed} 章"
            if failed == 0
            else f"缓存完成，成功 {completed} 章，失败 {failed} 章"
        )
        task.failures_json = dumps_config(failures)
        db.add(task)
        db.commit()
    except Exception as exc:
        task = db.query(PrefetchTask).filter(PrefetchTask.task_id == task_id).first()
        if task:
            task.status = "failed"
            task.finished_at = datetime.utcnow()
            task.message = f"缓存任务失败: {exc}"
            db.add(task)
            db.commit()
    finally:
        db.close()


def launch_prefetch_task(
    *,
    task_id: str,
    source_id: int,
    book: dict[str, Any],
    chapters: list[dict[str, Any]],
) -> None:
    task = asyncio.create_task(
        run_prefetch_task(task_id=task_id, source_id=source_id, book=book, chapters=chapters)
    )
    BACKGROUND_PREFETCH_TASKS.add(task)
    task.add_done_callback(BACKGROUND_PREFETCH_TASKS.discard)


@app.get("/")
async def index() -> FileResponse:
    return FileResponse(STATIC_DIR / "index.html")


@app.get("/api/health")
async def health() -> dict[str, str]:
    return {"status": "ok", "version": APP_VERSION, "title": APP_TITLE}


@app.get("/api/app/meta", response_model=AppMetaRead)
async def app_meta() -> AppMetaRead:
    return AppMetaRead(title=APP_TITLE, version=APP_VERSION)


@app.get("/api/dashboard/summary", response_model=DashboardSummaryRead)
async def dashboard_summary(db: Session = Depends(get_db)) -> DashboardSummaryRead:
    source_count = db.query(func.count(BookSource.id)).scalar() or 0
    enabled_source_count = db.query(func.count(BookSource.id)).filter(BookSource.enabled.is_(True)).scalar() or 0
    shelf_count = db.query(func.count(ShelfBook.id)).scalar() or 0
    cached_chapter_count = db.query(func.count(CachedChapter.id)).scalar() or 0
    reading_count = (
        db.query(func.count(ShelfBook.id))
        .filter(ShelfBook.last_read_at.is_not(None))
        .scalar()
        or 0
    )
    return DashboardSummaryRead(
        source_count=int(source_count),
        enabled_source_count=int(enabled_source_count),
        shelf_count=int(shelf_count),
        cached_chapter_count=int(cached_chapter_count),
        reading_count=int(reading_count),
    )


@app.get("/api/sources", response_model=list[BookSourceRead])
async def list_sources(db: Session = Depends(get_db)) -> list[BookSourceRead]:
    sources = db.query(BookSource).order_by(BookSource.created_at.desc()).all()
    return [serialize_source(source) for source in sources]


@app.post("/api/sources/import", response_model=list[BookSourceRead])
async def import_sources(request: Request, db: Session = Depends(get_db)) -> list[BookSourceRead]:
    try:
        payload: Any = await request.json()
    except JSONDecodeError as exc:
        raise HTTPException(status_code=400, detail=f"书源 JSON 解析失败: {exc}") from exc

    sources_to_import = normalize_source_payload(payload)
    imported: list[BookSourceRead] = []

    for item in sources_to_import:
        existing = db.query(BookSource).filter(BookSource.name == item.name).first()
        config = item.model_dump()
        if existing:
            existing.description = item.description
            existing.enabled = item.enabled
            existing.config_json = dumps_config(config)
            db.add(existing)
            db.flush()
            imported.append(serialize_source(existing))
            continue

        source = BookSource(
            name=item.name,
            description=item.description,
            enabled=item.enabled,
            config_json=dumps_config(config),
        )
        db.add(source)
        db.flush()
        imported.append(serialize_source(source))

    db.commit()
    return imported


@app.patch("/api/sources/{source_id}", response_model=BookSourceRead)
async def update_source(
    source_id: int,
    payload: BookSourceUpdate,
    db: Session = Depends(get_db),
) -> BookSourceRead:
    source = get_source_or_404(source_id, db)
    source.enabled = payload.enabled
    config = loads_config(source.config_json)
    config["enabled"] = payload.enabled
    source.config_json = dumps_config(config)
    db.add(source)
    db.commit()
    db.refresh(source)
    return serialize_source(source)


@app.delete("/api/sources/{source_id}")
async def delete_source(source_id: int, db: Session = Depends(get_db)) -> dict[str, str]:
    source = get_source_or_404(source_id, db)
    db.delete(source)
    db.commit()
    return {"message": "书源已删除"}


@app.get("/api/library/books", response_model=list[ShelfBookRead])
async def list_shelf_books(db: Session = Depends(get_db)) -> list[ShelfBookRead]:
    books = (
        db.query(ShelfBook)
        .order_by(ShelfBook.last_read_at.is_(None), ShelfBook.last_read_at.desc(), ShelfBook.added_at.desc())
        .all()
    )
    cache_counts = dict(
        db.query(CachedChapter.book_key, func.count(CachedChapter.id))
        .group_by(CachedChapter.book_key)
        .all()
    )
    return [serialize_shelf_book(book, int(cache_counts.get(book.book_key, 0))) for book in books]


@app.get("/api/library/backup")
async def export_backup(db: Session = Depends(get_db)) -> dict[str, Any]:
    sources = db.query(BookSource).order_by(BookSource.created_at.asc()).all()
    shelf_books = db.query(ShelfBook).order_by(ShelfBook.added_at.asc()).all()
    cached_chapters = db.query(CachedChapter).order_by(CachedChapter.cached_at.asc()).all()
    preferences = get_or_create_preferences(db)
    shelf_map = {book.book_key: book for book in shelf_books}

    return {
        "format_version": 1,
        "app": {
            "title": APP_TITLE,
            "version": APP_VERSION,
        },
        "exported_at": datetime.utcnow().isoformat(),
        "sources": [loads_config(source.config_json) for source in sources],
        "preferences": serialize_preferences(preferences).model_dump(),
        "shelf_books": [
            {
                "source_name": book.source_name,
                "category": book.category,
                "tags": loads_config(book.tags_json),
                "book": loads_config(book.book_json),
                "last_chapter": loads_config(book.last_chapter_json),
                "last_chapter_index": book.last_chapter_index,
                "last_read_at": book.last_read_at.isoformat() if book.last_read_at else None,
                "added_at": book.added_at.isoformat() if book.added_at else None,
            }
            for book in shelf_books
        ],
        "cached_chapters": [
            {
                "source_name": shelf_map[chapter.book_key].source_name,
                "book": loads_config(shelf_map[chapter.book_key].book_json),
                "chapter": loads_config(chapter.chapter_json),
                "chapter_index": chapter.chapter_index,
                "title": chapter.chapter_title,
                "content": chapter.content,
                "cached_at": chapter.cached_at.isoformat() if chapter.cached_at else None,
            }
            for chapter in cached_chapters
            if chapter.book_key in shelf_map
        ],
    }


@app.post("/api/library/restore", response_model=BackupRestoreResponse)
async def restore_backup(
    payload: BackupRestoreRequest,
    db: Session = Depends(get_db),
) -> BackupRestoreResponse:
    mode = payload.mode.strip().lower() or "merge"
    if mode not in {"merge", "replace"}:
        raise HTTPException(status_code=400, detail="恢复模式只支持 merge 或 replace")

    backup = payload.data or {}
    source_items = backup.get("sources", [])
    shelf_items = backup.get("shelf_books", [])
    cached_items = backup.get("cached_chapters", [])
    if not isinstance(source_items, list) or not isinstance(shelf_items, list) or not isinstance(cached_items, list):
        raise HTTPException(status_code=400, detail="备份文件格式不正确")

    if mode == "replace":
        db.query(CachedChapter).delete(synchronize_session=False)
        db.query(PrefetchTask).delete(synchronize_session=False)
        db.query(ShelfBook).delete(synchronize_session=False)
        db.query(BookSource).delete(synchronize_session=False)
        db.commit()

    normalized_sources = normalize_source_payload(source_items)
    source_map: dict[str, BookSource] = {}
    imported_source_count = 0
    imported_shelf_count = 0
    imported_cached_count = 0

    for item in normalized_sources:
        existing = db.query(BookSource).filter(BookSource.name == item.name).first()
        config = item.model_dump()
        if existing:
            existing.description = item.description
            existing.enabled = item.enabled
            existing.config_json = dumps_config(config)
            source = existing
        else:
            source = BookSource(
                name=item.name,
                description=item.description,
                enabled=item.enabled,
                config_json=dumps_config(config),
            )
            db.add(source)
            imported_source_count += 1
        db.flush()
        source_map[source.name] = source

    preference_payload = backup.get("preferences") or {}
    if preference_payload:
        preference = get_or_create_preferences(db)
        preference.theme = preference_payload.get("theme", preference.theme)
        preference.font_size = max(14, min(int(preference_payload.get("font_size", preference.font_size)), 32))
        preference.content_width = max(
            560, min(int(preference_payload.get("content_width", preference.content_width)), 1200)
        )
        preference.line_height = max(1.4, min(float(preference_payload.get("line_height", preference.line_height)), 3.0))
        db.add(preference)

    for item in shelf_items:
        if not isinstance(item, dict):
            continue
        source_name = str(item.get("source_name", "")).strip()
        book_payload = item.get("book") or {}
        source = source_map.get(source_name) or db.query(BookSource).filter(BookSource.name == source_name).first()
        if not source or not isinstance(book_payload, dict):
            continue

        shelf_book = upsert_shelf_book(db, source_id=source.id, source_name=source.name, book=book_payload)
        normalized_book = loads_config(shelf_book.book_json)
        last_chapter = item.get("last_chapter") or {}
        normalized_last_chapter = (
            normalize_chapter_payload(normalized_book["book_key"], last_chapter) if isinstance(last_chapter, dict) and last_chapter else {}
        )
        shelf_book.category = str(item.get("category", "")).strip()
        shelf_book.tags_json = dumps_config([str(tag).strip() for tag in item.get("tags", []) if str(tag).strip()])
        shelf_book.last_chapter_json = dumps_config(normalized_last_chapter)
        shelf_book.last_chapter_title = normalized_last_chapter.get("title", "")
        shelf_book.last_chapter_index = int(item.get("last_chapter_index", -1))
        shelf_book.last_read_at = parse_optional_datetime(item.get("last_read_at"))
        added_at = parse_optional_datetime(item.get("added_at"))
        if added_at:
            shelf_book.added_at = added_at
        db.add(shelf_book)
        imported_shelf_count += 1

    db.flush()

    for item in cached_items:
        if not isinstance(item, dict):
            continue
        source_name = str(item.get("source_name", "")).strip()
        book_payload = item.get("book") or {}
        chapter_payload = item.get("chapter") or {}
        source = source_map.get(source_name) or db.query(BookSource).filter(BookSource.name == source_name).first()
        if not source or not isinstance(book_payload, dict) or not isinstance(chapter_payload, dict):
            continue

        normalized_book = normalize_book_payload(source.id, source.name, book_payload)
        upsert_shelf_book(db, source_id=source.id, source_name=source.name, book=normalized_book)
        normalized_chapter = normalize_chapter_payload(normalized_book["book_key"], chapter_payload)
        cached = get_cached_chapter(db, normalized_book["book_key"], normalized_chapter["chapter_key"])
        cached = cached or CachedChapter(
            book_key=normalized_book["book_key"],
            chapter_key=normalized_chapter["chapter_key"],
            source_id=source.id,
        )
        cached.chapter_title = str(item.get("title") or normalized_chapter.get("title") or "")
        cached.chapter_index = int(item.get("chapter_index", -1))
        cached.chapter_json = dumps_config(normalized_chapter)
        cached.content = str(item.get("content", ""))
        cached.cached_at = parse_optional_datetime(item.get("cached_at")) or datetime.utcnow()
        db.add(cached)
        imported_cached_count += 1

    db.commit()

    source_count = db.query(func.count(BookSource.id)).scalar() or 0
    shelf_count = db.query(func.count(ShelfBook.id)).scalar() or 0
    cached_count = db.query(func.count(CachedChapter.id)).scalar() or 0
    return BackupRestoreResponse(
        mode=mode,
        source_count=int(source_count),
        shelf_count=int(shelf_count),
        cached_chapter_count=int(cached_count),
        imported_source_count=imported_source_count,
        imported_shelf_count=imported_shelf_count,
        imported_cached_chapter_count=imported_cached_count,
    )


@app.post("/api/library/books", response_model=ShelfBookRead)
async def add_shelf_book(payload: ShelfBookCreate, db: Session = Depends(get_db)) -> ShelfBookRead:
    source = get_source_or_404(payload.source_id, db)
    shelf_book = upsert_shelf_book(db, source_id=source.id, source_name=source.name, book=payload.book)
    cached_count = (
        db.query(func.count(CachedChapter.id))
        .filter(CachedChapter.book_key == shelf_book.book_key)
        .scalar()
        or 0
    )
    db.commit()
    db.refresh(shelf_book)
    return serialize_shelf_book(shelf_book, int(cached_count))


@app.patch("/api/library/books/{book_key}", response_model=ShelfBookRead)
async def update_shelf_book(
    book_key: str,
    payload: ShelfBookUpdate,
    db: Session = Depends(get_db),
) -> ShelfBookRead:
    shelf_book = get_shelf_book_or_404(book_key, db)
    shelf_book.category = payload.category.strip()
    tags = [tag.strip() for tag in payload.tags if tag.strip()]
    shelf_book.tags_json = dumps_config(tags)
    db.add(shelf_book)
    cached_count = (
        db.query(func.count(CachedChapter.id))
        .filter(CachedChapter.book_key == shelf_book.book_key)
        .scalar()
        or 0
    )
    db.commit()
    db.refresh(shelf_book)
    return serialize_shelf_book(shelf_book, int(cached_count))


@app.delete("/api/library/books/{book_key}")
async def delete_shelf_book(book_key: str, db: Session = Depends(get_db)) -> dict[str, str]:
    shelf_book = get_shelf_book_or_404(book_key, db)
    db.query(CachedChapter).filter(CachedChapter.book_key == book_key).delete(synchronize_session=False)
    db.query(PrefetchTask).filter(PrefetchTask.book_key == book_key).delete(synchronize_session=False)
    db.delete(shelf_book)
    db.commit()
    return {"message": "已移出书架并清除缓存"}


@app.get("/api/library/books/{book_key}/cached-chapters", response_model=list[CachedChapterRead])
async def list_cached_chapters(book_key: str, db: Session = Depends(get_db)) -> list[CachedChapterRead]:
    chapters = (
        db.query(CachedChapter)
        .filter(CachedChapter.book_key == book_key)
        .order_by(CachedChapter.chapter_index.asc(), CachedChapter.cached_at.asc())
        .all()
    )
    return [serialize_cached_chapter(chapter) for chapter in chapters]


@app.get("/api/prefetch-tasks/{task_id}", response_model=PrefetchTaskRead)
async def get_prefetch_task(task_id: str, db: Session = Depends(get_db)) -> PrefetchTaskRead:
    task = get_prefetch_task_or_404(task_id, db)
    return serialize_prefetch_task(task)


@app.get("/api/library/books/{book_key}/prefetch-tasks/latest", response_model=Optional[PrefetchTaskRead])
async def get_latest_prefetch_task(book_key: str, db: Session = Depends(get_db)) -> Optional[PrefetchTaskRead]:
    task = (
        db.query(PrefetchTask)
        .filter(PrefetchTask.book_key == book_key)
        .order_by(PrefetchTask.created_at.desc())
        .first()
    )
    if not task:
        return None
    return serialize_prefetch_task(task)


@app.delete("/api/library/books/{book_key}/cached-chapters")
async def clear_cached_chapters(book_key: str, db: Session = Depends(get_db)) -> dict[str, str]:
    db.query(CachedChapter).filter(CachedChapter.book_key == book_key).delete(synchronize_session=False)
    db.commit()
    return {"message": "已清空本书缓存"}


@app.post("/api/library/books/{book_key}/prefetch-jobs", response_model=PrefetchTaskRead)
async def create_prefetch_job(
    book_key: str,
    payload: ChapterCacheRequest,
    db: Session = Depends(get_db),
) -> PrefetchTaskRead:
    source = get_source_or_404(payload.source_id, db)
    normalized_book = normalize_book_payload(source.id, source.name, payload.book)
    if normalized_book["book_key"] != book_key:
        raise HTTPException(status_code=400, detail="缓存请求的书籍标识不匹配")
    if not payload.chapters:
        raise HTTPException(status_code=400, detail="请先提供章节列表")

    running_task = (
        db.query(PrefetchTask)
        .filter(PrefetchTask.book_key == book_key, PrefetchTask.status.in_(["pending", "running"]))
        .order_by(PrefetchTask.created_at.desc())
        .first()
    )
    if running_task:
        return serialize_prefetch_task(running_task)

    task = PrefetchTask(
        task_id=uuid.uuid4().hex,
        book_key=book_key,
        source_id=source.id,
        status="pending",
        total_chapters=len(payload.chapters),
        message="任务已创建，等待开始",
        failures_json=dumps_config([]),
    )
    db.add(task)
    db.commit()
    db.refresh(task)

    launch_prefetch_task(
        task_id=task.task_id,
        source_id=source.id,
        book=normalized_book,
        chapters=payload.chapters,
    )
    return serialize_prefetch_task(task)


@app.post("/api/library/books/{book_key}/prefetch", response_model=ChapterPrefetchResponse)
async def prefetch_book_chapters(
    book_key: str,
    payload: ChapterCacheRequest,
    db: Session = Depends(get_db),
) -> ChapterPrefetchResponse:
    source = get_source_or_404(payload.source_id, db)
    source_config = loads_config(source.config_json)
    normalized_book = normalize_book_payload(source.id, source.name, payload.book)
    if normalized_book["book_key"] != book_key:
        raise HTTPException(status_code=400, detail="缓存请求的书籍标识不匹配")
    if not payload.chapters:
        raise HTTPException(status_code=400, detail="请先提供章节列表")

    success_count = 0
    failures: list[str] = []
    for index, chapter in enumerate(payload.chapters):
        try:
            await resolve_chapter_content(
                db,
                source=source,
                source_config=source_config,
                book=normalized_book,
                chapter=chapter,
                chapter_index=index,
            )
            success_count += 1
        except HTTPException as exc:
            failures.append(f"{chapter.get('title', f'第{index + 1}章')}: {exc.detail}")

    upsert_shelf_book(db, source_id=source.id, source_name=source.name, book=normalized_book)
    db.commit()

    cached_total = (
        db.query(func.count(CachedChapter.id))
        .filter(CachedChapter.book_key == book_key)
        .scalar()
        or 0
    )
    return ChapterPrefetchResponse(
        book_key=book_key,
        requested_count=len(payload.chapters),
        cached_count=success_count,
        failed_count=len(failures),
        cached_chapter_count=int(cached_total),
        failures=failures,
    )


@app.post("/api/library/books/{book_key}/progress", response_model=ShelfBookRead)
async def update_reading_progress(
    book_key: str,
    payload: ReadingProgressUpdate,
    db: Session = Depends(get_db),
) -> ShelfBookRead:
    source = get_source_or_404(payload.source_id, db)
    normalized_book = normalize_book_payload(source.id, source.name, payload.book)
    if normalized_book["book_key"] != book_key:
        raise HTTPException(status_code=400, detail="阅读进度的书籍标识不匹配")

    shelf_book = upsert_shelf_book(db, source_id=source.id, source_name=source.name, book=normalized_book)
    shelf_book.last_chapter_json = dumps_config(payload.chapter)
    shelf_book.last_chapter_title = payload.chapter.get("title", "")
    shelf_book.last_chapter_index = payload.chapter_index
    shelf_book.last_read_at = datetime.utcnow()
    db.add(shelf_book)
    cached_count = (
        db.query(func.count(CachedChapter.id))
        .filter(CachedChapter.book_key == shelf_book.book_key)
        .scalar()
        or 0
    )
    db.commit()
    db.refresh(shelf_book)
    return serialize_shelf_book(shelf_book, int(cached_count))


@app.get("/api/reader/preferences", response_model=ReaderPreferenceRead)
async def get_reader_preferences(db: Session = Depends(get_db)) -> ReaderPreferenceRead:
    preference = get_or_create_preferences(db)
    return serialize_preferences(preference)


@app.put("/api/reader/preferences", response_model=ReaderPreferenceRead)
async def update_reader_preferences(
    payload: ReaderPreferenceUpdate,
    db: Session = Depends(get_db),
) -> ReaderPreferenceRead:
    preference = get_or_create_preferences(db)
    preference.theme = payload.theme
    preference.font_size = max(14, min(payload.font_size, 32))
    preference.content_width = max(560, min(payload.content_width, 1200))
    preference.line_height = max(1.4, min(payload.line_height, 3.0))
    db.add(preference)
    db.commit()
    db.refresh(preference)
    return serialize_preferences(preference)


@app.post("/api/search", response_model=SearchResponse)
async def search_books(payload: SearchRequest, db: Session = Depends(get_db)) -> SearchResponse:
    keyword = payload.keyword.strip()
    if not keyword:
        raise HTTPException(status_code=400, detail="请输入搜索关键词")

    query = db.query(BookSource).filter(BookSource.enabled.is_(True))
    if payload.source_ids:
        query = query.filter(BookSource.id.in_(payload.source_ids))
    sources = query.order_by(BookSource.id.asc()).all()
    if not sources:
        raise HTTPException(status_code=400, detail="没有可用书源，请先导入并启用书源")

    tasks = [
        search_source(
            source_id=source.id,
            source_name=source.name,
            source_config=loads_config(source.config_json),
            keyword=keyword,
            limit_per_source=max(1, min(payload.limit_per_source, 50)),
        )
        for source in sources
    ]

    settled = await asyncio.gather(*tasks, return_exceptions=True)
    items: list[dict[str, Any]] = []
    source_summaries: list[dict[str, Any]] = []
    for source, result in zip(sources, settled):
        if isinstance(result, Exception):
            source_summaries.append(
                {
                    "source_id": source.id,
                    "source_name": source.name,
                    "success": False,
                    "count": 0,
                    "error": str(result),
                }
            )
            continue

        normalized_items = [
            normalize_book_payload(source.id, source.name, item)
            for item in result["items"]
        ]
        items.extend(normalized_items)
        source_summaries.append(
            {
                "source_id": result["source_id"],
                "source_name": result["source_name"],
                "success": True,
                "count": len(normalized_items),
                "error": "",
            }
        )

    return SearchResponse(keyword=keyword, total=len(items), items=items, sources=source_summaries)


@app.post("/api/books/open", response_model=BookOpenResponse)
async def open_book(payload: BookOpenRequest, db: Session = Depends(get_db)) -> BookOpenResponse:
    source = get_source_or_404(payload.source_id, db)
    source_config = loads_config(source.config_json)

    if not source.enabled:
        raise HTTPException(status_code=400, detail="当前书源已停用")
    if not source_config.get("chapters"):
        raise HTTPException(status_code=400, detail="当前书源未配置章节接口")

    normalized_book = normalize_book_payload(source.id, source.name, payload.book)
    book_context = build_context(normalized_book, normalized_book.get("raw", {}))
    merged_book = {
        "title": normalized_book.get("title", ""),
        "author": normalized_book.get("author", ""),
        "cover": normalized_book.get("cover", ""),
        "intro": normalized_book.get("intro", ""),
        "detail_url": normalized_book.get("detail_url", ""),
        "book_id": normalized_book.get("book_id", ""),
        "book_key": normalized_book.get("book_key", ""),
        "latest_chapter": normalized_book.get("latest_chapter", ""),
        "status": normalized_book.get("status", ""),
        "raw": normalized_book.get("raw", {}),
    }

    if source_config.get("detail"):
        detail_items = await execute_mapping_request(source_config["detail"], book_context)
        if detail_items:
            detail_item = detail_items[0]
            merged_book.update({k: v for k, v in detail_item.items() if k != "raw" and v})
            merged_book["raw"] = detail_item.get("raw", merged_book["raw"])
            merged_book["book_key"] = build_book_key(source.id, merged_book)
            book_context = build_context(merged_book, merged_book.get("raw", {}))

    chapter_items = await execute_mapping_request(
        source_config["chapters"],
        book_context,
        force_list=True,
    )
    if not chapter_items:
        raise HTTPException(status_code=400, detail="当前书籍没有获取到章节列表")

    normalized_chapters = [
        normalize_chapter_payload(
            merged_book["book_key"],
            {
                "title": chapter.get("title", ""),
                "chapter_id": chapter.get("chapter_id", ""),
                "chapter_url": chapter.get("chapter_url", ""),
                "raw": chapter.get("raw", {}),
            },
        )
        for chapter in chapter_items
        if chapter.get("title")
    ]

    return BookOpenResponse(
        source_id=source.id,
        source_name=source.name,
        book=merged_book,
        chapters=normalized_chapters,
    )


@app.post("/api/books/content", response_model=ChapterContentResponse)
async def read_chapter(
    payload: ChapterContentRequest,
    db: Session = Depends(get_db),
) -> ChapterContentResponse:
    source = get_source_or_404(payload.source_id, db)
    source_config = loads_config(source.config_json)
    normalized_book = normalize_book_payload(source.id, source.name, payload.book)
    normalized_chapter = normalize_chapter_payload(normalized_book["book_key"], payload.chapter)

    cached_chapter, from_cache = await resolve_chapter_content(
        db,
        source=source,
        source_config=source_config,
        book=normalized_book,
        chapter=normalized_chapter,
    )
    if not from_cache:
        db.commit()
        db.refresh(cached_chapter)

    return ChapterContentResponse(
        source_id=source.id,
        source_name=source.name,
        chapter_title=cached_chapter.chapter_title,
        content=cached_chapter.content,
        chapter=loads_config(cached_chapter.chapter_json),
        cached=from_cache,
    )


@app.get("/demo-api/search")
async def demo_search(q: str = "") -> dict[str, Any]:
    return {"results": search_demo_books(q)}


@app.get("/demo-api/stats")
async def demo_stats() -> dict[str, Any]:
    return demo_library_stats()


@app.get("/demo-api/books/{book_id}")
async def demo_book_detail(book_id: str) -> dict[str, Any]:
    book = get_demo_book(book_id)
    if not book:
        raise HTTPException(status_code=404, detail="演示书籍不存在")

    return {
        "book": {
            "id": book["id"],
            "title": book["title"],
            "author": book["author"],
            "cover": book["cover"],
            "intro": book["intro"],
            "status": book["status"],
            "latest_chapter": book["latest_chapter"],
            "detail_url": f"demo://books/{book['id']}",
        }
    }


@app.get("/demo-api/books/{book_id}/chapters")
async def demo_book_chapters(book_id: str) -> dict[str, Any]:
    book = get_demo_book(book_id)
    if not book:
        raise HTTPException(status_code=404, detail="演示书籍不存在")

    chapters = [
        {
            "id": chapter["id"],
            "title": chapter["title"],
            "url": f"demo://books/{book_id}/chapters/{chapter['id']}",
        }
        for chapter in book["chapters"]
    ]
    return {"chapters": chapters}


@app.get("/demo-api/books/{book_id}/chapters/{chapter_id}")
async def demo_chapter_content(book_id: str, chapter_id: str) -> dict[str, Any]:
    book = get_demo_book(book_id)
    if not book:
        raise HTTPException(status_code=404, detail="演示书籍不存在")

    for chapter in book["chapters"]:
        if chapter["id"] == chapter_id:
            return {"chapter": chapter}
    raise HTTPException(status_code=404, detail="演示章节不存在")
