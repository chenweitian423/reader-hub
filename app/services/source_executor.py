from __future__ import annotations

import json
import re
from collections.abc import Iterable
from typing import Any
from urllib.parse import parse_qs, urlparse

import httpx
from pydantic import ValidationError

from app.schemas import BookSourceImport, RequestConfig
from app.services.demo_library import get_demo_book, search_demo_books


PLACEHOLDER_PATTERN = re.compile(r"\{([^{}]+)\}")
LEGACY_UNSUPPORTED_TOKENS = (
    "@js:",
    "<js>",
    "@css:",
    "@xpath:",
    "&&",
    "##",
    "@put:{",
    "@post:{",
)


def normalize_source_payload(payload: Any) -> list[BookSourceImport]:
    if isinstance(payload, dict):
        payload = [payload]
    if not isinstance(payload, list):
        raise ValueError("书源 JSON 必须是对象或对象数组")
    normalized: list[BookSourceImport] = []
    for item in payload:
        try:
            normalized.append(BookSourceImport.model_validate(item))
        except ValidationError as exc:
            if isinstance(item, dict) and is_legacy_source_payload(item):
                normalized.append(convert_legacy_source_payload(item))
                continue
            raise exc
    return normalized


def is_legacy_source_payload(item: dict[str, Any]) -> bool:
    return any(key in item for key in ("bookSourceName", "bookSourceGroup", "searchUrl", "ruleSearch"))


def raise_unsupported_legacy_rule(field_name: str, expression: str) -> None:
    raise ValueError(
        f"暂不支持旧格式书源中的 `{field_name}` 规则：{expression}。"
        "当前只兼容基于 JSON API 的简化规则，不兼容 JS/CSS/XPath 解析语法。"
    )


def normalize_legacy_rule_path(expression: str | None, *, field_name: str, allow_empty: bool = False) -> str:
    text = (expression or "").strip()
    if not text:
        if allow_empty:
            return ""
        raise ValueError(f"旧格式书源缺少 `{field_name}` 配置")
    if any(token in text for token in LEGACY_UNSUPPORTED_TOKENS):
        raise_unsupported_legacy_rule(field_name, text)
    text = text.replace("$.", "").replace("$", "")
    text = re.sub(r"\[(\d+)\]", r".\1", text)
    text = text.replace("[*]", "")
    text = text.lstrip(".")
    if "@" in text:
        raise_unsupported_legacy_rule(field_name, text)
    return text


def normalize_legacy_url_template(raw_url: Any) -> dict[str, Any]:
    if not isinstance(raw_url, str) or not raw_url.strip():
        raise ValueError("旧格式书源缺少 `searchUrl`")
    url_text = raw_url.strip()
    options: dict[str, Any] = {}
    if "," in url_text:
        base_url, possible_options = url_text.split(",", 1)
        maybe_json = possible_options.strip()
        if maybe_json.startswith("{") and maybe_json.endswith("}"):
            try:
                options = json.loads(maybe_json)
                url_text = base_url.strip()
            except json.JSONDecodeError:
                url_text = raw_url.strip()

    if any(token in url_text for token in LEGACY_UNSUPPORTED_TOKENS):
        raise_unsupported_legacy_rule("searchUrl", url_text)

    method = str(options.get("method", "GET")).upper()
    body = options.get("body", {})
    if isinstance(body, str):
        body = {part.split("=", 1)[0]: part.split("=", 1)[1] for part in body.split("&") if "=" in part}
    elif not isinstance(body, dict):
        body = {}

    return {
        "method": method,
        "url": url_text.replace("{{key}}", "{keyword}"),
        "headers": options.get("headers", {}) if isinstance(options.get("headers", {}), dict) else {},
        "body": body,
        "params": options.get("params", {}) if isinstance(options.get("params", {}), dict) else {},
    }


def convert_legacy_source_payload(item: dict[str, Any]) -> BookSourceImport:
    name = str(item.get("bookSourceName", "")).strip()
    if not name:
        raise ValueError("旧格式书源缺少 `bookSourceName`，无法导入")

    search_rule = item.get("ruleSearch")
    if not isinstance(search_rule, dict):
        raise ValueError(f"旧格式书源 `{name}` 缺少 `ruleSearch`，暂时无法导入")

    request_meta = normalize_legacy_url_template(item.get("searchUrl"))
    result_path = normalize_legacy_rule_path(
        search_rule.get("bookList"),
        field_name="ruleSearch.bookList",
    )

    field_candidates = {
        "title": search_rule.get("name"),
        "author": search_rule.get("author"),
        "cover": search_rule.get("coverUrl") or search_rule.get("cover"),
        "intro": search_rule.get("intro") or search_rule.get("introHtml"),
        "detail_url": search_rule.get("bookUrl") or search_rule.get("url"),
        "book_id": search_rule.get("bookUrl") or search_rule.get("bookId"),
        "latest_chapter": search_rule.get("lastChapter") or search_rule.get("latestChapter"),
    }

    fields: dict[str, str] = {}
    for output_field, expression in field_candidates.items():
        if not expression:
            continue
        fields[output_field] = normalize_legacy_rule_path(
            expression,
            field_name=f"ruleSearch.{output_field}",
            allow_empty=True,
        )

    if "title" not in fields:
        raise ValueError(f"旧格式书源 `{name}` 的 `ruleSearch.name` 缺失，无法导入")

    description_parts = [
        str(item.get("bookSourceGroup", "")).strip(),
        str(item.get("bookSourceComment", "")).strip(),
    ]
    description = " · ".join(part for part in description_parts if part)
    if not description:
        description = "从旧格式书源自动转换，仅保证导入与搜索兼容。"

    payload = {
        "name": name,
        "description": description,
        "enabled": bool(item.get("enabled", True)),
        "search": {
            "method": request_meta["method"],
            "url": request_meta["url"],
            "headers": request_meta["headers"],
            "params": request_meta["params"],
            "body": request_meta["body"],
            "result_path": result_path,
            "fields": fields,
            "transforms": {},
            "timeout_seconds": 10.0,
        },
    }
    return BookSourceImport.model_validate(payload)


def flatten_for_context(value: Any, prefix: str = "") -> dict[str, str]:
    flattened: dict[str, str] = {}
    if isinstance(value, dict):
        for key, child in value.items():
            next_prefix = f"{prefix}.{key}" if prefix else str(key)
            flattened.update(flatten_for_context(child, next_prefix))
        return flattened
    if isinstance(value, list):
        for index, child in enumerate(value):
            next_prefix = f"{prefix}.{index}" if prefix else str(index)
            flattened.update(flatten_for_context(child, next_prefix))
        return flattened
    if prefix:
        flattened[prefix] = "" if value is None else str(value)
    return flattened


def build_context(*items: dict[str, Any]) -> dict[str, str]:
    context: dict[str, str] = {}
    for item in items:
        if not isinstance(item, dict):
            continue
        for key, value in item.items():
            if isinstance(value, (str, int, float, bool)) or value is None:
                context[str(key)] = "" if value is None else str(value)
        context.update(flatten_for_context(item))
    return context


def render_template(value: Any, context: dict[str, str]) -> Any:
    if isinstance(value, str):
        return PLACEHOLDER_PATTERN.sub(lambda match: context.get(match.group(1), ""), value)
    if isinstance(value, dict):
        return {k: render_template(v, context) for k, v in value.items()}
    if isinstance(value, list):
        return [render_template(v, context) for v in value]
    return value


def extract_path(payload: Any, path: str) -> Any:
    if not path:
        return payload

    current = payload
    for segment in path.split("."):
        if current is None:
            return None
        if isinstance(current, list):
            if not segment.isdigit():
                return None
            index = int(segment)
            if index >= len(current):
                return None
            current = current[index]
            continue
        if isinstance(current, dict):
            current = current.get(segment)
            continue
        return None
    return current


def apply_transform(value: Any, transform: dict[str, str]) -> str:
    if value is None:
        return ""
    text = str(value)
    prefix = transform.get("prefix", "")
    suffix = transform.get("suffix", "")
    return f"{prefix}{text}{suffix}"


def ensure_list(value: Any) -> list[Any]:
    if value is None:
        return []
    if isinstance(value, list):
        return value
    if isinstance(value, Iterable) and not isinstance(value, (str, bytes, dict)):
        return list(value)
    return [value]


def map_fields(raw_item: Any, fields: dict[str, str], transforms: dict[str, dict[str, str]]) -> dict[str, Any]:
    mapped: dict[str, Any] = {}
    for output_field, path in fields.items():
        mapped_value = extract_path(raw_item, path)
        if output_field in transforms:
            mapped[output_field] = apply_transform(mapped_value, transforms[output_field])
        else:
            mapped[output_field] = "" if mapped_value is None else str(mapped_value)
    return mapped


async def perform_request(config: RequestConfig | dict[str, Any], context: dict[str, str]) -> Any:
    request_config = config if isinstance(config, dict) else config.model_dump()
    method = request_config.get("method", "GET").upper()
    url = render_template(request_config["url"], context)
    if url.startswith("demo://"):
        return perform_demo_request(url)

    headers = render_template(request_config.get("headers", {}), context)
    params = render_template(request_config.get("params", {}), context)
    body = render_template(request_config.get("body", {}), context)
    timeout_seconds = float(request_config.get("timeout_seconds", 10))

    async with httpx.AsyncClient(timeout=timeout_seconds, follow_redirects=True) as client:
        response = await client.request(
            method=method,
            url=url,
            headers=headers,
            params=params,
            json=body if method != "GET" and body else None,
        )
        response.raise_for_status()
        return response.json()


def perform_demo_request(url: str) -> Any:
    parsed = urlparse(url)
    route = parsed.netloc
    path_segments = [segment for segment in parsed.path.split("/") if segment]
    query = parse_qs(parsed.query)

    if route == "search":
        keyword = query.get("keyword", [""])[0]
        return {"results": search_demo_books(keyword)}

    if route == "books" and len(path_segments) == 1:
        book = get_demo_book(path_segments[0])
        if not book:
            raise httpx.HTTPError("演示书籍不存在")
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

    if route == "books" and len(path_segments) == 2 and path_segments[1] == "chapters":
        book = get_demo_book(path_segments[0])
        if not book:
            raise httpx.HTTPError("演示书籍不存在")
        return {
            "chapters": [
                {
                    "id": chapter["id"],
                    "title": chapter["title"],
                    "url": f"demo://books/{book['id']}/chapters/{chapter['id']}",
                }
                for chapter in book["chapters"]
            ]
        }

    if route == "books" and len(path_segments) == 3 and path_segments[1] == "chapters":
        book = get_demo_book(path_segments[0])
        if not book:
            raise httpx.HTTPError("演示书籍不存在")
        chapter_id = path_segments[2]
        for chapter in book["chapters"]:
            if chapter["id"] == chapter_id:
                return {"chapter": chapter}
        raise httpx.HTTPError("演示章节不存在")

    raise httpx.HTTPError("不支持的演示协议地址")


async def execute_mapping_request(
    config: dict[str, Any],
    context: dict[str, str],
    *,
    limit: int | None = None,
    force_list: bool = False,
) -> list[dict[str, Any]]:
    payload = await perform_request(config, context)
    raw_items = ensure_list(extract_path(payload, config.get("result_path", "")))
    if not force_list and raw_items and not isinstance(extract_path(payload, config.get("result_path", "")), list):
        raw_items = raw_items[:1]

    fields = config.get("fields", {})
    transforms = config.get("transforms", {})
    mapped_items: list[dict[str, Any]] = []

    selected_items = raw_items if limit is None else raw_items[:limit]
    for raw_item in selected_items:
        if not isinstance(raw_item, dict):
            continue
        mapped = map_fields(raw_item, fields, transforms)
        mapped["raw"] = raw_item
        mapped_items.append(mapped)
    return mapped_items


async def search_source(
    source_id: int,
    source_name: str,
    source_config: dict[str, Any],
    keyword: str,
    limit_per_source: int,
) -> dict[str, Any]:
    search_config = source_config["search"]
    items = await execute_mapping_request(
        search_config,
        {"keyword": keyword},
        limit=limit_per_source,
        force_list=True,
    )

    normalized_items: list[dict[str, Any]] = []
    for item in items:
        mapped = {
            "source_id": source_id,
            "source_name": source_name,
            "title": item.get("title", ""),
            "author": item.get("author", ""),
            "cover": item.get("cover", ""),
            "intro": item.get("intro", ""),
            "detail_url": item.get("detail_url", ""),
            "book_id": item.get("book_id", ""),
            "latest_chapter": item.get("latest_chapter", ""),
            "raw": item.get("raw", {}),
        }
        if mapped["title"]:
            normalized_items.append(mapped)

    return {
        "source_id": source_id,
        "source_name": source_name,
        "success": True,
        "count": len(normalized_items),
        "items": normalized_items,
    }


def dumps_config(config: dict[str, Any]) -> str:
    return json.dumps(config, ensure_ascii=False)


def loads_config(config_json: str) -> dict[str, Any]:
    return json.loads(config_json)
