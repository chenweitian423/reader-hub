from datetime import datetime
from typing import Any, Optional

from pydantic import BaseModel, Field


class RequestConfig(BaseModel):
    method: str = "GET"
    url: str
    headers: dict[str, str] = Field(default_factory=dict)
    params: dict[str, Any] = Field(default_factory=dict)
    body: dict[str, Any] = Field(default_factory=dict)
    result_path: str = ""
    fields: dict[str, str] = Field(default_factory=dict)
    transforms: dict[str, dict[str, str]] = Field(default_factory=dict)
    timeout_seconds: float = 10.0


class SearchConfig(RequestConfig):
    fields: dict[str, str]


class BookSourceImport(BaseModel):
    name: str
    description: str = ""
    enabled: bool = True
    search: SearchConfig
    detail: Optional[RequestConfig] = None
    chapters: Optional[RequestConfig] = None
    content: Optional[RequestConfig] = None
    legacy: Optional[dict[str, Any]] = None


class BookSourceRead(BaseModel):
    id: int
    name: str
    description: str
    enabled: bool
    config: dict[str, Any]

    class Config:
        from_attributes = True


class BookSourceUpdate(BaseModel):
    enabled: bool


class SourceBulkDeleteRequest(BaseModel):
    source_ids: list[int] = Field(default_factory=list)
    delete_all: bool = False


class SearchRequest(BaseModel):
    keyword: str
    source_ids: Optional[list[int]] = None
    limit_per_source: int = 10


class SearchResultItem(BaseModel):
    source_id: int
    source_name: str
    title: str
    author: str = ""
    cover: str = ""
    intro: str = ""
    detail_url: str = ""
    book_id: str = ""
    book_key: str = ""
    latest_chapter: str = ""
    import_channel: str = ""
    import_channel_label: str = ""
    raw: dict[str, Any] = Field(default_factory=dict)


class SearchSourceSummary(BaseModel):
    source_id: int
    source_name: str
    success: bool
    count: int = 0
    error: str = ""


class SearchResponse(BaseModel):
    keyword: str
    total: int
    items: list[SearchResultItem]
    sources: list[SearchSourceSummary]


class BookOpenRequest(BaseModel):
    source_id: int
    book: dict[str, Any]


class ChapterContentRequest(BaseModel):
    source_id: int
    book: dict[str, Any]
    chapter: dict[str, Any]


class BookDetail(BaseModel):
    title: str
    author: str = ""
    cover: str = ""
    intro: str = ""
    detail_url: str = ""
    book_id: str = ""
    book_key: str = ""
    latest_chapter: str = ""
    status: str = ""
    import_channel: str = ""
    import_channel_label: str = ""
    raw: dict[str, Any] = Field(default_factory=dict)


class ChapterItem(BaseModel):
    title: str
    chapter_key: str = ""
    chapter_id: str = ""
    chapter_url: str = ""
    raw: dict[str, Any] = Field(default_factory=dict)


class BookOpenResponse(BaseModel):
    source_id: int
    source_name: str
    book: BookDetail
    chapters: list[ChapterItem]


class ChapterContentResponse(BaseModel):
    source_id: int
    source_name: str
    chapter_title: str
    content: str
    chapter: ChapterItem
    cached: bool = False


class ShelfBookCreate(BaseModel):
    source_id: int
    book: dict[str, Any]


class ReadingProgressUpdate(BaseModel):
    source_id: int
    book: dict[str, Any]
    chapter: dict[str, Any]
    chapter_index: int = -1


class ShelfBookRead(BaseModel):
    book_key: str
    source_id: int
    source_name: str
    title: str
    author: str = ""
    cover: str = ""
    intro: str = ""
    detail_url: str = ""
    book_id: str = ""
    category: str = ""
    tags: list[str] = Field(default_factory=list)
    status: str = ""
    latest_chapter: str = ""
    import_channel: str = ""
    import_channel_label: str = ""
    book: dict[str, Any] = Field(default_factory=dict)
    last_chapter: dict[str, Any] = Field(default_factory=dict)
    last_chapter_title: str = ""
    last_chapter_index: int = -1
    cached_chapter_count: int = 0
    added_at: datetime
    last_read_at: Optional[datetime] = None


class ReaderPreferenceRead(BaseModel):
    theme: str = "warm"
    font_size: int = 17
    content_width: int = 820
    line_height: float = 2.0


class ReaderPreferenceUpdate(BaseModel):
    theme: str = "warm"
    font_size: int = 17
    content_width: int = 820
    line_height: float = 2.0


class DashboardSummaryRead(BaseModel):
    source_count: int = 0
    enabled_source_count: int = 0
    shelf_count: int = 0
    cached_chapter_count: int = 0
    reading_count: int = 0


class AppMetaRead(BaseModel):
    title: str
    version: str


class ChapterCacheRequest(BaseModel):
    source_id: int
    book: dict[str, Any]
    chapters: list[dict[str, Any]] = Field(default_factory=list)


class CachedChapterRead(BaseModel):
    chapter_key: str
    title: str
    chapter_index: int = -1
    chapter: dict[str, Any] = Field(default_factory=dict)
    cached_at: datetime


class ChapterPrefetchResponse(BaseModel):
    book_key: str
    requested_count: int
    cached_count: int
    failed_count: int
    cached_chapter_count: int
    failures: list[str] = Field(default_factory=list)


class ShelfBookUpdate(BaseModel):
    category: str = ""
    tags: list[str] = Field(default_factory=list)


class PrefetchTaskRead(BaseModel):
    task_id: str
    book_key: str
    source_id: int
    status: str
    total_chapters: int = 0
    completed_chapters: int = 0
    failed_chapters: int = 0
    message: str = ""
    failures: list[str] = Field(default_factory=list)
    created_at: datetime
    started_at: Optional[datetime] = None
    finished_at: Optional[datetime] = None


class BackupRestoreRequest(BaseModel):
    mode: str = "merge"
    data: dict[str, Any] = Field(default_factory=dict)


class BackupRestoreResponse(BaseModel):
    mode: str
    source_count: int = 0
    shelf_count: int = 0
    cached_chapter_count: int = 0
    imported_source_count: int = 0
    imported_shelf_count: int = 0
    imported_cached_chapter_count: int = 0


class UploadedBookImportItem(BaseModel):
    filename: str
    title: str
    book_key: str
    source_id: int
    source_name: str
    chapter_count: int = 0
    format: str = ""
    import_channel: str = ""
    import_channel_label: str = ""


class UploadedBookImportResponse(BaseModel):
    imported_count: int = 0
    items: list[UploadedBookImportItem] = Field(default_factory=list)
