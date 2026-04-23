from __future__ import annotations

import json
import re
import uuid
import zipfile
from datetime import datetime
from html import unescape
from io import BytesIO
from pathlib import Path
from typing import Any
from urllib.parse import quote, unquote, urlparse, parse_qs
from xml.etree import ElementTree as ET

from bs4 import BeautifulSoup


DATA_DIR = Path(__file__).resolve().parent.parent.parent / "data"
UPLOADED_BOOKS_DIR = DATA_DIR / "uploaded_books"
SUPPORTED_UPLOAD_SUFFIXES = {".txt", ".md", ".epub"}


def ensure_uploaded_library_dirs() -> None:
    UPLOADED_BOOKS_DIR.mkdir(parents=True, exist_ok=True)


def sanitize_filename(filename: str) -> str:
    text = Path(filename or "untitled").name.strip()
    return text or "untitled"


def decode_text_bytes(content: bytes) -> str:
    for encoding in ("utf-8-sig", "utf-8", "gb18030", "big5"):
        try:
            return content.decode(encoding)
        except UnicodeDecodeError:
            continue
    return content.decode("utf-8", errors="ignore")


def split_text_into_chapters(text: str, fallback_title: str) -> list[dict[str, str]]:
    normalized = text.replace("\r\n", "\n").replace("\r", "\n")
    chapter_pattern = re.compile(
        r"(?m)^\s*(第[ 0-9零一二三四五六七八九十百千两〇]+[章节卷回部篇集].{0,40}|chapter[ ._-]*\d+.{0,40})\s*$",
        re.IGNORECASE,
    )
    matches = list(chapter_pattern.finditer(normalized))
    if len(matches) < 2:
        content = normalized.strip()
        return [{"id": "chapter-1", "title": "全文", "content": content}] if content else []

    chapters: list[dict[str, str]] = []
    for index, match in enumerate(matches):
        title = match.group(1).strip()
        start = match.end()
        end = matches[index + 1].start() if index + 1 < len(matches) else len(normalized)
        content = normalized[start:end].strip()
        if not content:
            continue
        chapters.append(
            {
                "id": f"chapter-{index + 1}",
                "title": title or f"{fallback_title} · 第 {index + 1} 章",
                "content": content,
            }
        )
    return chapters


def parse_txt_book(filename: str, content: bytes) -> dict[str, Any]:
    text = decode_text_bytes(content).strip()
    title = Path(filename).stem.strip() or "未命名导入书籍"
    chapters = split_text_into_chapters(text, title)
    intro_lines = [line.strip() for line in text.splitlines() if line.strip()][:3]
    intro = " ".join(intro_lines)[:180]
    latest_chapter = chapters[-1]["title"] if chapters else "全文"
    return {
        "title": title,
        "author": "",
        "cover": "",
        "intro": intro or "从本地文本导入的书籍。",
        "status": "本地导入",
        "latest_chapter": latest_chapter,
        "format": "txt",
        "chapters": chapters or [{"id": "chapter-1", "title": "全文", "content": text}],
    }


def parse_epub_container(epub_zip: zipfile.ZipFile) -> str:
    container_xml = epub_zip.read("META-INF/container.xml")
    root = ET.fromstring(container_xml)
    namespace = {"n": "urn:oasis:names:tc:opendocument:xmlns:container"}
    rootfile = root.find(".//n:rootfile", namespace)
    if rootfile is None:
        raise ValueError("EPUB 缺少 OPF 根文件")
    return rootfile.attrib.get("full-path", "")


def parse_epub_book(filename: str, content: bytes) -> dict[str, Any]:
    with zipfile.ZipFile(BytesIO(content)) as epub_zip:
        opf_path = parse_epub_container(epub_zip)
        if not opf_path:
            raise ValueError("EPUB 缺少 OPF 路径")
        opf_root = ET.fromstring(epub_zip.read(opf_path))
        package_dir = Path(opf_path).parent
        ns = {
            "opf": "http://www.idpf.org/2007/opf",
            "dc": "http://purl.org/dc/elements/1.1/",
        }
        metadata = opf_root.find("opf:metadata", ns)
        title = (
            metadata.findtext("dc:title", default="", namespaces=ns).strip() if metadata is not None else ""
        ) or Path(filename).stem.strip() or "未命名 EPUB"
        author = metadata.findtext("dc:creator", default="", namespaces=ns).strip() if metadata is not None else ""

        manifest: dict[str, dict[str, str]] = {}
        for item in opf_root.findall("opf:manifest/opf:item", ns):
            item_id = item.attrib.get("id", "")
            manifest[item_id] = {
                "href": item.attrib.get("href", ""),
                "media_type": item.attrib.get("media-type", ""),
            }

        chapters: list[dict[str, str]] = []
        index = 1
        for itemref in opf_root.findall("opf:spine/opf:itemref", ns):
            item_id = itemref.attrib.get("idref", "")
            entry = manifest.get(item_id)
            if not entry:
                continue
            media_type = entry.get("media_type", "")
            if "html" not in media_type and "xhtml" not in media_type:
                continue
            chapter_path = (package_dir / entry.get("href", "")).as_posix()
            try:
                raw_html = epub_zip.read(chapter_path).decode("utf-8")
            except UnicodeDecodeError:
                raw_html = epub_zip.read(chapter_path).decode("utf-8", errors="ignore")
            soup = BeautifulSoup(raw_html, "lxml")
            for selector in ("script", "style", "nav"):
                for node in soup.select(selector):
                    node.decompose()
            text = unescape(soup.get_text("\n", strip=True)).strip()
            text = re.sub(r"\n{3,}", "\n\n", text)
            if not text:
                continue
            heading = ""
            for selector in ("h1", "h2", "h3", "title"):
                node = soup.select_one(selector)
                if node and node.get_text(strip=True):
                    heading = node.get_text(strip=True)
                    break
            chapters.append(
                {
                    "id": f"chapter-{index}",
                    "title": heading or f"第 {index} 章",
                    "content": text,
                }
            )
            index += 1

    if not chapters:
        raise ValueError("EPUB 没有解析出可读章节")

    intro = chapters[0]["content"][:180]
    return {
        "title": title,
        "author": author,
        "cover": "",
        "intro": intro or "从本地 EPUB 导入的书籍。",
        "status": "本地导入",
        "latest_chapter": chapters[-1]["title"],
        "format": "epub",
        "chapters": chapters,
    }


def build_uploaded_book_payload(book_id: str, payload: dict[str, Any]) -> dict[str, Any]:
    chapters = payload.get("chapters", [])
    return {
        "id": book_id,
        "book_id": book_id,
        "title": payload.get("title", ""),
        "author": payload.get("author", ""),
        "cover": payload.get("cover", ""),
        "intro": payload.get("intro", ""),
        "status": payload.get("status", "本地导入"),
        "latest_chapter": payload.get("latest_chapter", chapters[-1]["title"] if chapters else ""),
        "detail_url": f"uploaded://books/{quote(book_id)}",
        "format": payload.get("format", ""),
        "uploaded_at": payload.get("uploaded_at", ""),
    }


def save_uploaded_book(filename: str, parsed_book: dict[str, Any]) -> dict[str, Any]:
    ensure_uploaded_library_dirs()
    book_id = uuid.uuid4().hex
    payload = {
        "id": book_id,
        "filename": sanitize_filename(filename),
        "title": parsed_book.get("title", ""),
        "author": parsed_book.get("author", ""),
        "cover": parsed_book.get("cover", ""),
        "intro": parsed_book.get("intro", ""),
        "status": parsed_book.get("status", "本地导入"),
        "latest_chapter": parsed_book.get("latest_chapter", ""),
        "format": parsed_book.get("format", ""),
        "uploaded_at": datetime.utcnow().isoformat(),
        "chapters": parsed_book.get("chapters", []),
    }
    (UPLOADED_BOOKS_DIR / f"{book_id}.json").write_text(
        json.dumps(payload, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    return build_uploaded_book_payload(book_id, payload)


def parse_uploaded_book(filename: str, content: bytes) -> dict[str, Any]:
    suffix = Path(filename).suffix.lower()
    if suffix not in SUPPORTED_UPLOAD_SUFFIXES:
        raise ValueError(f"暂不支持 `{suffix or '未知'}` 格式，目前支持 TXT、MD、EPUB")
    if suffix in {".txt", ".md"}:
        return parse_txt_book(filename, content)
    return parse_epub_book(filename, content)


def load_uploaded_book(book_id: str) -> dict[str, Any] | None:
    ensure_uploaded_library_dirs()
    path = UPLOADED_BOOKS_DIR / f"{book_id}.json"
    if not path.exists():
        return None
    return json.loads(path.read_text(encoding="utf-8"))


def list_uploaded_books() -> list[dict[str, Any]]:
    ensure_uploaded_library_dirs()
    books: list[dict[str, Any]] = []
    for path in sorted(UPLOADED_BOOKS_DIR.glob("*.json"), reverse=True):
        payload = json.loads(path.read_text(encoding="utf-8"))
        books.append(build_uploaded_book_payload(payload["id"], payload))
    return books


def search_uploaded_books(keyword: str) -> list[dict[str, Any]]:
    query = keyword.strip().lower()
    if not query:
        return []
    matches: list[dict[str, Any]] = []
    for book in list_uploaded_books():
        haystacks = [book.get("title", ""), book.get("author", ""), book.get("intro", "")]
        if any(query in value.lower() for value in haystacks):
            matches.append(book)
    return matches


def uploaded_library_stats() -> dict[str, int]:
    books = [load_uploaded_book(book["id"]) for book in list_uploaded_books()]
    normalized = [book for book in books if book]
    return {
        "book_count": len(normalized),
        "chapter_count": sum(len(book.get("chapters", [])) for book in normalized),
    }


def perform_uploaded_request(url: str) -> Any:
    parsed = urlparse(url)
    route = parsed.netloc
    path_segments = [unquote(segment) for segment in parsed.path.split("/") if segment]
    query = parse_qs(parsed.query)

    if route == "search":
        keyword = query.get("keyword", [""])[0]
        return {"results": search_uploaded_books(keyword)}

    if route == "books" and len(path_segments) == 1:
        book = load_uploaded_book(path_segments[0])
        if not book:
            raise ValueError("导入书籍不存在")
        return {"book": build_uploaded_book_payload(book["id"], book)}

    if route == "books" and len(path_segments) == 2 and path_segments[1] == "chapters":
        book = load_uploaded_book(path_segments[0])
        if not book:
            raise ValueError("导入书籍不存在")
        return {
            "chapters": [
                {
                    "id": chapter["id"],
                    "title": chapter["title"],
                    "url": f"uploaded://books/{quote(book['id'])}/chapters/{quote(chapter['id'])}",
                }
                for chapter in book.get("chapters", [])
            ]
        }

    if route == "books" and len(path_segments) == 3 and path_segments[1] == "chapters":
        book = load_uploaded_book(path_segments[0])
        if not book:
            raise ValueError("导入书籍不存在")
        chapter_id = path_segments[2]
        for chapter in book.get("chapters", []):
            if chapter.get("id") == chapter_id:
                return {"chapter": chapter}
        raise ValueError("导入章节不存在")

    raise ValueError("不支持的导入书籍协议地址")
