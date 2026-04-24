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
from urllib.parse import urlparse

from fastapi import Depends, FastAPI, File, Form, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, HTMLResponse
from fastapi.staticfiles import StaticFiles
from pydantic import ValidationError
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
    UploadedBookImportItem,
    UploadedBookImportResponse,
)
from app.services.demo_library import demo_library_stats, get_demo_book, search_demo_books
from app.services.source_executor import (
    build_context,
    dumps_config,
    execute_mapping_request,
    legacy_source_supports_reading,
    loads_config,
    normalize_source_payload,
    open_legacy_book,
    read_legacy_chapter_content,
    search_source,
)
from app.services.uploaded_library import (
    SUPPORTED_UPLOAD_SUFFIXES,
    ensure_uploaded_library_dirs,
    parse_uploaded_book,
    save_uploaded_book,
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
UPLOADED_SOURCE_NAME = "本地导入书库"
ALLOWED_CORS_ORIGINS = [
    item.strip()
    for item in os.getenv("READER_HUB_CORS_ORIGINS", "*").split(",")
    if item.strip()
]


def build_uploaded_source_config() -> dict[str, Any]:
    return {
        "name": UPLOADED_SOURCE_NAME,
        "description": "支持本地 TXT / MD / EPUB 导入，也支持局域网设备直接上传到书架。",
        "enabled": True,
        "search": {
            "method": "GET",
            "url": "uploaded://search?keyword={keyword}",
            "headers": {},
            "params": {},
            "body": {},
            "result_path": "results",
            "fields": {
                "title": "title",
                "author": "author",
                "cover": "cover",
                "intro": "intro",
                "detail_url": "detail_url",
                "book_id": "id",
                "latest_chapter": "latest_chapter",
                "status": "status",
            },
            "transforms": {},
            "timeout_seconds": 10.0,
        },
        "detail": {
            "method": "GET",
            "url": "uploaded://books/{book_id}",
            "headers": {},
            "params": {},
            "body": {},
            "result_path": "book",
            "fields": {
                "title": "title",
                "author": "author",
                "cover": "cover",
                "intro": "intro",
                "detail_url": "detail_url",
                "book_id": "id",
                "latest_chapter": "latest_chapter",
                "status": "status",
            },
            "transforms": {},
            "timeout_seconds": 10.0,
        },
        "chapters": {
            "method": "GET",
            "url": "uploaded://books/{book_id}/chapters",
            "headers": {},
            "params": {},
            "body": {},
            "result_path": "chapters",
            "fields": {
                "title": "title",
                "chapter_id": "id",
                "chapter_url": "url",
            },
            "transforms": {},
            "timeout_seconds": 10.0,
        },
        "content": {
            "method": "GET",
            "url": "uploaded://books/{book_id}/chapters/{chapter_id}",
            "headers": {},
            "params": {},
            "body": {},
            "result_path": "chapter",
            "fields": {
                "title": "title",
                "content": "content",
            },
            "transforms": {},
            "timeout_seconds": 10.0,
        },
    }


def ensure_uploaded_source_seeded() -> None:
    ensure_uploaded_library_dirs()
    db = SessionLocal()
    try:
        existing = db.query(BookSource).filter(BookSource.name == UPLOADED_SOURCE_NAME).first()
        config = build_uploaded_source_config()
        if existing:
            existing.description = config["description"]
            existing.enabled = True
            existing.config_json = dumps_config(config)
            db.add(existing)
            db.commit()
            return
        source = BookSource(
            name=UPLOADED_SOURCE_NAME,
            description=config["description"],
            enabled=True,
            config_json=dumps_config(config),
        )
        db.add(source)
        db.commit()
    finally:
        db.close()


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
    ensure_uploaded_source_seeded()
    if AUTO_SEED_DEMO_SOURCE:
        ensure_demo_source_seeded()
    yield


app = FastAPI(title=APP_TITLE, version=APP_VERSION, lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_CORS_ORIGINS or ["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")


def format_validation_error(exc: ValidationError) -> str:
    errors: list[str] = []
    for item in exc.errors():
        location = ".".join(str(part) for part in item.get("loc", []))
        message = item.get("msg", "字段校验失败")
        errors.append(f"{location}: {message}" if location else message)
    return "；".join(errors) or "书源格式校验失败"


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
    if not str(normalized["book_id"]).strip() and str(normalized["detail_url"]).startswith(("uploaded://", "demo://")):
        parsed = urlparse(str(normalized["detail_url"]))
        segments = [segment for segment in parsed.path.split("/") if segment]
        if parsed.netloc == "books" and segments:
            normalized["book_id"] = segments[0]
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


def get_uploaded_source_or_404(db: Session) -> BookSource:
    source = db.query(BookSource).filter(BookSource.name == UPLOADED_SOURCE_NAME).first()
    if not source:
        raise HTTPException(status_code=500, detail="本地导入书库尚未初始化")
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
    legacy_config = source_config.get("legacy")
    if not source_config.get("content") and not isinstance(legacy_config, dict):
        raise HTTPException(status_code=400, detail="当前书源未配置正文接口")

    if isinstance(legacy_config, dict) and not source_config.get("content"):
        try:
            content_item = await read_legacy_chapter_content(
                legacy_config,
                book=normalized_book,
                chapter=normalized_chapter,
            )
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        content = content_item.get("content", "").strip()
        if not content:
            raise HTTPException(status_code=400, detail="当前章节正文为空")
    else:
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

    try:
        sources_to_import = normalize_source_payload(payload)
    except ValidationError as exc:
        raise HTTPException(status_code=400, detail=f"书源格式校验失败: {format_validation_error(exc)}") from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
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


@app.get("/api/library/uploads")
async def upload_books_api_info(request: Request) -> Any:
    base_url = str(request.base_url).rstrip("/")
    payload = {
        "message": "这个地址用于局域网书籍上传。请使用 POST multipart/form-data，而不是直接在浏览器里 GET 打开。",
        "method": "POST",
        "content_type": "multipart/form-data",
        "endpoint": f"{base_url}/api/library/uploads",
        "fields": {
            "files": "一个或多个书籍文件",
            "category": "可选，导入后的默认分类",
            "tags": "可选，逗号分隔的默认标签",
        },
        "supported_formats": sorted(item.lstrip('.') for item in SUPPORTED_UPLOAD_SUFFIXES),
        "example_curl": (
            f"curl -X POST '{base_url}/api/library/uploads' "
            "-F 'files=@/path/to/book.epub' "
            "-F 'category=本地导入' "
            "-F 'tags=上传,局域网'"
        ),
        "cors_origins": ALLOWED_CORS_ORIGINS or ["*"],
    }

    accepts_html = "text/html" in (request.headers.get("accept") or "")
    if not accepts_html:
        return payload

    html = f"""<!DOCTYPE html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Reader Hub 局域网上传</title>
    <style>
      :root {{
        color-scheme: light;
        --bg: #f2e6d3;
        --surface: rgba(255, 250, 244, 0.94);
        --ink: #2b1b11;
        --muted: #7e6c5b;
        --line: rgba(89, 62, 32, 0.12);
        --accent: #c25b2f;
        --accent-deep: #8e3716;
        --success: #276749;
        --warning: #9c4221;
      }}
      * {{ box-sizing: border-box; }}
      body {{
        margin: 0;
        min-height: 100vh;
        font-family: "PingFang SC", "Hiragino Sans GB", "Noto Sans SC", sans-serif;
        color: var(--ink);
        background:
          radial-gradient(circle at top right, rgba(194, 91, 47, 0.18), transparent 24%),
          linear-gradient(135deg, #f1e2ca 0%, #ead6b5 52%, #f7efe2 100%);
        padding: 24px;
      }}
      .shell {{
        width: min(920px, 100%);
        margin: 0 auto;
        display: grid;
        gap: 18px;
      }}
      .card {{
        background: var(--surface);
        border: 1px solid var(--line);
        border-radius: 28px;
        padding: 24px;
        box-shadow: 0 24px 60px rgba(77, 43, 14, 0.12);
      }}
      .eyebrow {{
        margin: 0 0 10px;
        text-transform: uppercase;
        letter-spacing: 0.18em;
        font-size: 12px;
        color: var(--accent);
        font-weight: 700;
      }}
      h1, h2, p {{ margin: 0; }}
      h1 {{ font-size: 34px; line-height: 1.12; margin-bottom: 12px; }}
      .muted {{ color: var(--muted); }}
      .dropzone {{
        border-radius: 24px;
        border: 1.5px dashed rgba(194, 91, 47, 0.36);
        background:
          radial-gradient(circle at top right, rgba(194, 91, 47, 0.12), transparent 30%),
          linear-gradient(180deg, rgba(255, 252, 248, 0.92), rgba(255, 247, 239, 0.8));
        padding: 24px;
        display: grid;
        gap: 16px;
        transition: border-color 160ms ease, transform 160ms ease;
      }}
      .dropzone.drag-active {{
        border-color: rgba(194, 91, 47, 0.82);
        transform: translateY(-1px);
      }}
      .actions, .footer {{
        display: flex;
        gap: 12px;
        align-items: center;
        flex-wrap: wrap;
      }}
      button {{
        border: none;
        border-radius: 999px;
        padding: 12px 18px;
        background: var(--accent);
        color: #fff7f0;
        cursor: pointer;
        font: inherit;
      }}
      button.secondary {{
        background: rgba(194, 91, 47, 0.1);
        color: var(--accent-deep);
        border: 1px solid rgba(194, 91, 47, 0.18);
      }}
      input[type="text"] {{
        width: 100%;
        border: 1px solid rgba(84, 59, 29, 0.18);
        border-radius: 16px;
        background: #fffdf9;
        padding: 14px 16px;
        color: var(--ink);
        font: inherit;
      }}
      input[type="file"] {{ display: none; }}
      .grid {{
        display: grid;
        gap: 12px;
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }}
      .selection, .result {{
        display: grid;
        gap: 10px;
        padding: 16px;
        border-radius: 20px;
        background: rgba(255, 253, 250, 0.78);
        border: 1px solid rgba(89, 62, 32, 0.1);
      }}
      .selection.empty, .result.empty {{
        min-height: 120px;
        place-items: center;
        color: var(--muted);
      }}
      .file-list {{
        display: grid;
        gap: 10px;
        max-height: 280px;
        overflow: auto;
      }}
      .file-item {{
        display: grid;
        gap: 4px;
        padding: 14px 16px;
        border-radius: 18px;
        background: rgba(255,255,255,0.9);
        border: 1px solid rgba(89, 62, 32, 0.08);
      }}
      .file-item strong, .file-item span {{ overflow-wrap: anywhere; }}
      .badge {{
        display: inline-flex;
        align-items: center;
        border-radius: 999px;
        padding: 6px 12px;
        font-size: 12px;
        font-weight: 700;
        background: rgba(181, 82, 51, 0.1);
        color: var(--accent-deep);
      }}
      code {{
        display: inline-block;
        padding: 6px 10px;
        border-radius: 999px;
        background: rgba(36, 22, 13, 0.06);
        color: var(--ink);
        word-break: break-all;
      }}
      .status.success {{ color: var(--success); }}
      .status.error {{ color: var(--warning); }}
      @media (max-width: 720px) {{
        body {{ padding: 14px; }}
        .grid {{ grid-template-columns: 1fr; }}
        .actions, .footer {{ align-items: stretch; }}
        button {{ width: 100%; justify-content: center; }}
      }}
    </style>
  </head>
  <body>
    <main class="shell">
      <section class="card">
        <p class="eyebrow">Reader Hub</p>
        <h1>局域网上传书籍</h1>
        <p class="muted">现在直接在浏览器打开这个地址，也可以选择文件、选择目录，或者拖动文件到页面里上传到书架。</p>
      </section>

      <section class="card">
        <div id="dropzone" class="dropzone" role="button" tabindex="0">
          <div>
            <p class="eyebrow">上传入口</p>
            <h2>拖动文件或整个文件夹到这里</h2>
            <p class="muted">支持 TXT、MD、EPUB。兼容浏览器会优先弹出原生文件或目录选择器。</p>
          </div>
          <input id="file-input" type="file" accept=".txt,.md,.epub" multiple />
          <input id="directory-input" type="file" accept=".txt,.md,.epub" webkitdirectory directory multiple />
          <div class="actions">
            <button id="pick-files" type="button">选择书籍文件</button>
            <button id="pick-directory" class="secondary" type="button">选择整个目录</button>
            <button id="clear-files" class="secondary" type="button">清空待上传</button>
          </div>
        </div>
      </section>

      <section class="card">
        <div class="grid">
          <label>
            <p class="eyebrow">默认分类</p>
            <input id="category-input" type="text" placeholder="可选，例如：本地导入 / 小说 / 学习" />
          </label>
          <label>
            <p class="eyebrow">默认标签</p>
            <input id="tags-input" type="text" placeholder="可选，用逗号分隔，例如：上传, 局域网" />
          </label>
        </div>
      </section>

      <section id="selection" class="card selection empty">还没有选择文件。你可以点击按钮，也可以直接拖动文件到页面。</section>

      <section class="card">
        <div class="footer">
          <span class="badge">接口地址</span>
          <code>{payload["endpoint"]}</code>
        </div>
        <div class="footer" style="margin-top: 14px;">
          <button id="upload-btn" type="button">上传到书架</button>
          <span id="status" class="muted">等待选择文件</span>
        </div>
      </section>

      <section id="result" class="card result empty">上传结果会显示在这里。</section>
    </main>

    <script>
      const SUPPORTED = new Set(["txt", "md", "epub"]);
      const state = {{ files: [] }};
      const dropzone = document.querySelector("#dropzone");
      const fileInput = document.querySelector("#file-input");
      const directoryInput = document.querySelector("#directory-input");
      const selection = document.querySelector("#selection");
      const result = document.querySelector("#result");
      const status = document.querySelector("#status");
      const categoryInput = document.querySelector("#category-input");
      const tagsInput = document.querySelector("#tags-input");

      function formatFileSize(size) {{
        if (!Number.isFinite(size) || size <= 0) return "0 B";
        const units = ["B", "KB", "MB", "GB"];
        let value = size;
        let index = 0;
        while (value >= 1024 && index < units.length - 1) {{
          value /= 1024;
          index += 1;
        }}
        const digits = value >= 100 || index === 0 ? 0 : 1;
        return `${{value.toFixed(digits)}} ${{units[index]}}`;
      }}

      function getRelativePath(file) {{
        return file.readerHubRelativePath || file.webkitRelativePath || file.name;
      }}

      function getKey(file) {{
        return [getRelativePath(file), file.size, file.lastModified].join("::");
      }}

      function renderSelection() {{
        const files = state.files;
        if (!files.length) {{
          selection.className = "card selection empty";
          selection.textContent = "还没有选择文件。你可以点击按钮，也可以直接拖动文件到页面。";
          return;
        }}
        const totalSize = files.reduce((sum, file) => sum + (file.size || 0), 0);
        selection.className = "card selection";
        selection.innerHTML = `
          <div class="footer">
            <strong>已选 ${{files.length}} 个文件</strong>
            <span class="muted">${{formatFileSize(totalSize)}}</span>
          </div>
        `;
        const list = document.createElement("div");
        list.className = "file-list";
        files.forEach((file) => {{
          const item = document.createElement("div");
          item.className = "file-item";
          item.innerHTML = `
            <strong>${{file.name}}</strong>
            <span class="muted">${{getRelativePath(file)}}</span>
            <span class="badge">${{formatFileSize(file.size || 0)}}</span>
          `;
          list.appendChild(item);
        }});
        selection.appendChild(list);
      }}

      function setStatus(text, type = "") {{
        status.textContent = text;
        status.className = type ? `status ${{type}}` : "muted";
      }}

      function mergeFiles(files) {{
        const map = new Map(state.files.map((file) => [getKey(file), file]));
        let ignored = 0;
        files.forEach((file) => {{
          const ext = String(file.name || "").split(".").pop()?.toLowerCase();
          if (!ext || !SUPPORTED.has(ext)) {{
            ignored += 1;
            return;
          }}
          map.set(getKey(file), file);
        }});
        state.files = Array.from(map.values()).sort((a, b) => getRelativePath(a).localeCompare(getRelativePath(b), "zh-CN"));
        renderSelection();
        if (ignored) {{
          setStatus(`已忽略 ${{ignored}} 个不支持的文件`, "error");
        }} else if (files.length) {{
          setStatus(`已加入 ${{files.length}} 个待上传文件`);
        }}
      }}

      async function readDirectoryEntry(entry, pathPrefix = "") {{
        if (!entry) return [];
        if (entry.isFile) {{
          return new Promise((resolve) => {{
            entry.file((file) => {{
              file.readerHubRelativePath = `${{pathPrefix}}${{file.name}}`;
              resolve([file]);
            }});
          }});
        }}
        if (!entry.isDirectory) return [];
        const reader = entry.createReader();
        const entries = [];
        while (true) {{
          const batch = await new Promise((resolve, reject) => reader.readEntries(resolve, reject));
          if (!batch.length) break;
          entries.push(...batch);
        }}
        const nested = await Promise.all(entries.map((child) => readDirectoryEntry(child, `${{pathPrefix}}${{entry.name}}/`)));
        return nested.flat();
      }}

      async function extractDroppedFiles(dataTransfer) {{
        const items = Array.from(dataTransfer.items || []);
        if (items.length && items.some((item) => typeof item.webkitGetAsEntry === "function")) {{
          const files = await Promise.all(
            items
              .filter((item) => item.kind === "file")
              .map((item) => readDirectoryEntry(item.webkitGetAsEntry())),
          );
          return files.flat();
        }}
        return Array.from(dataTransfer.files || []);
      }}

      async function readDirectoryHandle(directoryHandle, pathPrefix = "") {{
        const files = [];
        for await (const [name, handle] of directoryHandle.entries()) {{
          const nextPath = `${{pathPrefix}}${{name}}`;
          if (handle.kind === "file") {{
            const file = await handle.getFile();
            file.readerHubRelativePath = nextPath;
            files.push(file);
          }} else if (handle.kind === "directory") {{
            files.push(...await readDirectoryHandle(handle, `${{nextPath}}/`));
          }}
        }}
        return files;
      }}

      async function openFilePicker() {{
        if (typeof window.showOpenFilePicker === "function") {{
          try {{
            const handles = await window.showOpenFilePicker({{
              multiple: true,
              types: [{{ description: "书籍文件", accept: {{ "text/plain": [".txt", ".md"], "application/epub+zip": [".epub"] }} }}],
            }});
            const files = await Promise.all(handles.map(async (handle) => handle.getFile()));
            mergeFiles(files);
          }} catch (error) {{
            if (error?.name !== "AbortError") setStatus("浏览器文件选择失败，请重试", "error");
          }}
          return;
        }}
        fileInput.click();
      }}

      async function openDirectoryPicker() {{
        if (typeof window.showDirectoryPicker === "function") {{
          try {{
            const handle = await window.showDirectoryPicker();
            const files = await readDirectoryHandle(handle);
            mergeFiles(files);
          }} catch (error) {{
            if (error?.name !== "AbortError") setStatus("浏览器目录选择失败，请重试", "error");
          }}
          return;
        }}
        directoryInput.click();
      }}

      async function uploadFiles() {{
        if (!state.files.length) {{
          setStatus("请先选择要上传的书籍文件", "error");
          return;
        }}
        const formData = new FormData();
        state.files.forEach((file) => formData.append("files", file, getRelativePath(file)));
        formData.append("category", categoryInput.value.trim());
        formData.append("tags", tagsInput.value.trim());
        setStatus("正在上传到书架...");
        try {{
          const response = await fetch("{payload["endpoint"]}", {{ method: "POST", body: formData }});
          const data = await response.json();
          if (!response.ok) throw new Error(data.detail || "上传失败");
          result.className = "card result";
          result.innerHTML = `
            <div class="footer">
              <strong>上传完成</strong>
              <span class="badge">共导入 ${{data.imported_count}} 本</span>
            </div>
          `;
          const list = document.createElement("div");
          list.className = "file-list";
          (data.items || []).forEach((item) => {{
            const row = document.createElement("div");
            row.className = "file-item";
            row.innerHTML = `
              <strong>${{item.title || item.filename}}</strong>
              <span class="muted">${{item.filename}} · ${{item.format.toUpperCase()}}</span>
              <span class="badge">${{item.chapter_count}} 章</span>
            `;
            list.appendChild(row);
          }});
          result.appendChild(list);
          state.files = [];
          renderSelection();
          setStatus("上传成功，书已进入书架", "success");
        }} catch (error) {{
          result.className = "card result";
          result.textContent = error.message || "上传失败";
          setStatus(error.message || "上传失败", "error");
        }}
      }}

      document.querySelector("#pick-files").addEventListener("click", openFilePicker);
      document.querySelector("#pick-directory").addEventListener("click", openDirectoryPicker);
      document.querySelector("#clear-files").addEventListener("click", () => {{
        state.files = [];
        renderSelection();
        setStatus("已清空待上传文件");
      }});
      document.querySelector("#upload-btn").addEventListener("click", uploadFiles);
      fileInput.addEventListener("change", (event) => {{
        mergeFiles(Array.from(event.target.files || []));
        event.target.value = "";
      }});
      directoryInput.addEventListener("change", (event) => {{
        mergeFiles(Array.from(event.target.files || []));
        event.target.value = "";
      }});

      dropzone.addEventListener("click", (event) => {{
        if (event.target.closest("button")) return;
        openFilePicker();
      }});
      dropzone.addEventListener("keydown", (event) => {{
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        openFilePicker();
      }});
      ["dragenter", "dragover"].forEach((eventName) => {{
        dropzone.addEventListener(eventName, (event) => {{
          event.preventDefault();
          dropzone.classList.add("drag-active");
        }});
      }});
      dropzone.addEventListener("dragleave", (event) => {{
        if (!dropzone.contains(event.relatedTarget)) {{
          dropzone.classList.remove("drag-active");
        }}
      }});
      dropzone.addEventListener("drop", async (event) => {{
        event.preventDefault();
        dropzone.classList.remove("drag-active");
        mergeFiles(await extractDroppedFiles(event.dataTransfer));
      }});
      window.addEventListener("dragover", (event) => {{
        if (!event.dataTransfer?.types?.includes("Files")) return;
        event.preventDefault();
      }});
      window.addEventListener("drop", (event) => {{
        if (!event.dataTransfer?.types?.includes("Files")) return;
        if (dropzone.contains(event.target)) return;
        event.preventDefault();
        setStatus("请把文件拖到上传区域里");
      }});

      renderSelection();
    </script>
  </body>
</html>"""
    return HTMLResponse(html)


@app.post("/api/library/uploads", response_model=UploadedBookImportResponse)
async def upload_books_to_shelf(
    files: list[UploadFile] = File(...),
    category: str = Form(""),
    tags: str = Form(""),
    db: Session = Depends(get_db),
) -> UploadedBookImportResponse:
    if not files:
        raise HTTPException(status_code=400, detail="请至少选择一个书籍文件")

    source = get_uploaded_source_or_404(db)
    normalized_tags = [item.strip() for item in tags.split(",") if item.strip()]
    imported_items: list[UploadedBookImportItem] = []

    for file in files:
        filename = (file.filename or "").strip()
        if not filename:
            raise HTTPException(status_code=400, detail="存在缺少文件名的上传文件")
        raw = await file.read()
        if not raw:
            raise HTTPException(status_code=400, detail=f"文件 `{filename}` 为空，无法导入")
        try:
            parsed_book = parse_uploaded_book(filename, raw)
            saved_book = save_uploaded_book(filename, parsed_book)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

        shelf_book = upsert_shelf_book(db, source_id=source.id, source_name=source.name, book=saved_book)
        if category.strip():
            shelf_book.category = category.strip()
        if normalized_tags:
            shelf_book.tags_json = dumps_config(normalized_tags)
        db.add(shelf_book)
        db.flush()
        imported_items.append(
            UploadedBookImportItem(
                filename=filename,
                title=saved_book.get("title", ""),
                book_key=shelf_book.book_key,
                source_id=source.id,
                source_name=source.name,
                chapter_count=len(parsed_book.get("chapters", [])),
                format=parsed_book.get("format", ""),
            )
        )

    db.commit()
    return UploadedBookImportResponse(imported_count=len(imported_items), items=imported_items)


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
    if not legacy_source_supports_reading(source_config):
        raise HTTPException(status_code=400, detail="当前书源暂不支持阅读")

    normalized_book = normalize_book_payload(source.id, source.name, payload.book)
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

    chapter_items: list[dict[str, Any]]
    legacy_config = source_config.get("legacy")

    if isinstance(legacy_config, dict) and not source_config.get("chapters"):
        try:
            legacy_result = await open_legacy_book(
                source.id,
                source.name,
                legacy_config,
                merged_book,
            )
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        merged_book.update({k: v for k, v in legacy_result["book"].items() if k != "raw" and v})
        merged_book["raw"] = legacy_result["book"].get("raw", merged_book["raw"])
        merged_book["book_key"] = build_book_key(source.id, merged_book)
        chapter_items = legacy_result["chapters"]
    else:
        book_context = build_context(normalized_book, normalized_book.get("raw", {}))
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

    if not normalized_chapters:
        raise HTTPException(status_code=400, detail="当前书籍没有获取到可用章节")

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
