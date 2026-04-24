from __future__ import annotations

import json
import re
from collections import Counter
from collections.abc import Iterable
from html import unescape
from typing import Any
from urllib.parse import parse_qs, urlencode, urljoin, urlparse, urlunparse

import httpx
from bs4 import BeautifulSoup, Tag
from lxml import html as lxml_html
from pydantic import ValidationError

from app.schemas import (
    BookSourceImport,
    PrivateSiteAutodetectResponse,
    PrivateSiteSourceRequest,
    RequestConfig,
)
from app.services.demo_library import get_demo_book, search_demo_books
from app.services.uploaded_library import perform_uploaded_request


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
CHAPTER_TEXT_PATTERN = re.compile(r"(第.{1,12}[章回节卷]|楔子|序章|终章|番外)")


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


def get_legacy_raw_config(legacy_config: dict[str, Any]) -> dict[str, Any]:
    raw = legacy_config.get("raw", {})
    return raw if isinstance(raw, dict) else {}


def get_legacy_rule(raw_config: dict[str, Any], key: str) -> dict[str, Any]:
    value = raw_config.get(key, {})
    return value if isinstance(value, dict) else {}


def parse_legacy_headers(legacy_config: dict[str, Any]) -> dict[str, str]:
    raw_config = get_legacy_raw_config(legacy_config)
    raw_headers = raw_config.get("header")
    if isinstance(raw_headers, str) and raw_headers.strip():
        try:
            parsed = json.loads(raw_headers)
            if isinstance(parsed, dict):
                return {str(key): str(value) for key, value in parsed.items()}
        except json.JSONDecodeError:
            return {}
    if isinstance(raw_headers, dict):
        return {str(key): str(value) for key, value in raw_headers.items()}
    return {}


def normalize_legacy_origin(value: str) -> str:
    text = (value or "").strip()
    if not text:
        return ""
    if "#" in text:
        text = text.split("#", 1)[0].strip()
    if "," in text and text.count("{") and text.rstrip().endswith("}"):
        text = text.split(",", 1)[0].strip()
    return text


def resolve_legacy_base_url(legacy_config: dict[str, Any]) -> str:
    raw_config = get_legacy_raw_config(legacy_config)
    for candidate in (
        raw_config.get("bookSourceUrl"),
        legacy_config.get("search_url"),
    ):
        normalized = normalize_legacy_origin(str(candidate or ""))
        if normalized:
            return normalized
    return ""


def absolutize_legacy_url(url: str, base_url: str) -> str:
    text = (url or "").strip()
    if not text:
        return ""
    if text.startswith(("http://", "https://", "demo://")):
        return text
    if text.startswith("//"):
        parsed = urlparse(base_url)
        scheme = parsed.scheme or "https"
        return f"{scheme}:{text}"
    if text.startswith("javascript:"):
        return ""
    return urljoin(base_url, text) if base_url else text


def legacy_source_supports_reading(source_config: dict[str, Any]) -> bool:
    if source_config.get("chapters") and source_config.get("content"):
        return True
    legacy_config = source_config.get("legacy")
    if not isinstance(legacy_config, dict):
        return False
    raw_config = get_legacy_raw_config(legacy_config)
    rule_toc = get_legacy_rule(raw_config, "ruleToc")
    rule_content = get_legacy_rule(raw_config, "ruleContent")
    return bool(rule_toc.get("chapterList") and rule_content.get("content"))


def convert_legacy_source_payload(item: dict[str, Any]) -> BookSourceImport:
    name = str(item.get("bookSourceName", "")).strip()
    if not name:
        raise ValueError("旧格式书源缺少 `bookSourceName`，无法导入")

    search_rule = item.get("ruleSearch")
    if not isinstance(search_rule, dict):
        raise ValueError(f"旧格式书源 `{name}` 缺少 `ruleSearch`，暂时无法导入")

    search_url = str(item.get("searchUrl", "")).strip()
    if not search_url:
        raise ValueError(f"旧格式书源 `{name}` 缺少 `searchUrl`，无法导入")
    if not str(search_rule.get("bookList", "")).strip():
        raise ValueError(f"旧格式书源 `{name}` 的 `ruleSearch.bookList` 缺失，无法导入")
    if not str(search_rule.get("name", "")).strip():
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
            "method": "GET",
            "url": "legacy://search",
            "headers": {},
            "params": {},
            "body": {},
            "result_path": "",
            "fields": {"title": "title"},
            "transforms": {},
            "timeout_seconds": 10.0,
        },
        "legacy": {
            "format": "legado",
            "search_url": search_url,
            "rule_search": search_rule,
            "raw": item,
        },
    }
    return BookSourceImport.model_validate(payload)


def build_private_site_source_import(site: PrivateSiteSourceRequest) -> BookSourceImport:
    if not site.name.strip():
        raise ValueError("私有站点名称不能为空")
    if not site.base_url.strip():
        raise ValueError("站点首页地址不能为空")
    if not site.search_url.strip():
        raise ValueError("搜索地址不能为空")
    if not site.search_list.strip():
        raise ValueError("搜索结果列表规则不能为空")
    if not site.search_title.strip():
        raise ValueError("书名规则不能为空")
    if any(value.strip() for value in (site.toc_list, site.toc_title, site.toc_url)) and not all(
        value.strip() for value in (site.toc_list, site.toc_title, site.toc_url)
    ):
        raise ValueError("如果要接入阅读能力，请把目录列表、章节标题和章节链接规则一起填完整")

    description = site.description.strip() or f"私有站点接入 · {site.base_url.strip()}"
    rule_search = {
        "bookList": site.search_list.strip(),
        "name": site.search_title.strip(),
    }
    optional_search_fields = {
        "author": site.search_author,
        "coverUrl": site.search_cover,
        "intro": site.search_intro,
        "bookUrl": site.search_detail_url,
        "lastChapter": site.search_latest_chapter,
    }
    for field, value in optional_search_fields.items():
        if value.strip():
            rule_search[field] = value.strip()

    raw_config: dict[str, Any] = {
        "bookSourceUrl": site.base_url.strip(),
        "header": site.headers,
        "ruleSearch": rule_search,
    }

    if any(
        value.strip()
        for value in (
            site.detail_title,
            site.detail_author,
            site.detail_cover,
            site.detail_intro,
            site.detail_status,
        )
    ):
        rule_book_info = {}
        detail_field_map = {
            "name": site.detail_title,
            "author": site.detail_author,
            "coverUrl": site.detail_cover,
            "intro": site.detail_intro,
            "kind": site.detail_status,
        }
        for field, value in detail_field_map.items():
            if value.strip():
                rule_book_info[field] = value.strip()
        raw_config["ruleBookInfo"] = rule_book_info

    if site.toc_list.strip() and site.toc_title.strip() and site.toc_url.strip():
        raw_config["ruleToc"] = {
            "chapterList": site.toc_list.strip(),
            "chapterName": site.toc_title.strip(),
            "chapterUrl": site.toc_url.strip(),
        }
        if site.toc_next_url.strip():
            raw_config["ruleToc"]["nextTocUrl"] = site.toc_next_url.strip()

    if site.content_body.strip():
        raw_config["ruleContent"] = {
            "content": site.content_body.strip(),
        }
        if site.content_next_url.strip():
            raw_config["ruleContent"]["nextContentUrl"] = site.content_next_url.strip()

    payload = {
        "name": site.name.strip(),
        "description": description,
        "enabled": site.enabled,
        "search": {
            "method": "GET",
            "url": "legacy://search",
            "headers": {},
            "params": {},
            "body": {},
            "result_path": "",
            "fields": {"title": "title"},
            "transforms": {},
            "timeout_seconds": 10.0,
        },
        "legacy": {
            "format": "private_site",
            "search_url": site.search_url.strip(),
            "rule_search": rule_search,
            "raw": raw_config,
        },
        "private_site": site.model_dump(),
    }
    return BookSourceImport.model_validate(payload)


def extract_expression_from_soup(soup: BeautifulSoup, expression: str) -> str:
    selector, attr = split_legacy_attr_expression(expression)
    selector = selector.strip()
    if not selector:
      return ""
    target = soup.select_one(selector)
    if not isinstance(target, Tag):
        return ""
    if attr == "text":
        return target.get_text(" ", strip=True)
    if attr == "html":
        return "".join(str(child) for child in target.contents).strip()
    return str(target.get(attr, "")).strip()


def choose_first_expression(soup: BeautifulSoup, expressions: list[str], *, min_length: int = 1) -> str:
    for expression in expressions:
        value = extract_expression_from_soup(soup, expression)
        if len(value.strip()) >= min_length:
            return expression
    return ""


def choose_best_toc_rule(soup: BeautifulSoup) -> tuple[str, str, str]:
    candidates = [
        (".chapter-list li", "a@text", "a@href"),
        ("#list dd", "a@text", "a@href"),
        (".listmain dd", "a@text", "a@href"),
        (".catalog li", "a@text", "a@href"),
        (".dirlist li", "a@text", "a@href"),
        (".chapterlist li", "a@text", "a@href"),
        ("dl dd", "a@text", "a@href"),
        (".booklist li", "a@text", "a@href"),
        (".chapter-list a", "@text", "@href"),
        ("#chapterlist a", "@text", "@href"),
    ]
    best: tuple[str, str, str] = ("", "", "")
    best_score = 0
    for list_rule, title_rule, url_rule in candidates:
        items = [item for item in soup.select(list_rule) if isinstance(item, Tag)]
        if len(items) < 3:
            continue
        score = 0
        for item in items[:30]:
            title = extract_css_field(item, title_rule).strip()
            href = extract_css_field(item, url_rule).strip()
            if href:
                score += 1
            if title and (CHAPTER_TEXT_PATTERN.search(title) or 2 <= len(title) <= 40):
                score += 2
        if score > best_score:
            best = (list_rule, title_rule, url_rule)
            best_score = score
    return best


def choose_best_content_expression(soup: BeautifulSoup) -> str:
    candidates = [
        "#content@html",
        "#nr1@html",
        "#nr@html",
        ".read-content@html",
        ".chapter-content@html",
        ".article-content@html",
        ".txtnav@html",
        ".txt@html",
        ".content@html",
        ".contentbox@html",
        ".yd_text2@html",
        "#chaptercontent@html",
        "article@html",
    ]
    best_expr = ""
    best_length = 0
    for expression in candidates:
        value = extract_expression_from_soup(soup, expression)
        normalized = normalize_legacy_content_text(
            value,
            from_html=expression_prefers_html(expression),
        )
        if len(normalized) > best_length:
            best_expr = expression
            best_length = len(normalized)
    return best_expr if best_length >= 120 else ""


def choose_next_page_expression(soup: BeautifulSoup) -> str:
    candidates = [
        "a[rel='next']@href",
        ".next@href",
        ".next-page@href",
        ".page-next@href",
        ".pagination .next@href",
        ".pager .next@href",
        "a:contains('下一页')@href",
    ]
    for expression in candidates[:-1]:
        if extract_expression_from_soup(soup, expression).strip():
            return expression
    for link in soup.select("a[href]"):
        text = link.get_text(" ", strip=True)
        href = str(link.get("href", "")).strip()
        if not href:
            continue
        if any(token in text for token in ("下一页", "下页", "后页", "next")):
            classes = ".".join(cls for cls in link.get("class", [])[:2] if cls)
            if classes:
                return f"a.{classes}@href"
            return "a@href"
    return ""


def autodetect_search_url(soup: BeautifulSoup, current_url: str, base_url: str) -> tuple[str, list[str]]:
    notes: list[str] = []
    query_hint = re.compile(r"(search|keyword|key|q|wd|query)", re.I)
    for form in soup.select("form"):
        inputs = [node for node in form.select("input[name], textarea[name]") if isinstance(node, Tag)]
        target_input = None
        for node in inputs:
            input_type = str(node.get("type", "text")).lower()
            if input_type in {"hidden", "submit", "button", "password"}:
                continue
            if query_hint.search(str(node.get("name", ""))):
                target_input = node
                break
        if not target_input:
            continue
        method = str(form.get("method", "GET")).upper()
        action = urljoin(current_url, str(form.get("action", "")).strip() or current_url)
        field_name = str(target_input.get("name", "keyword")).strip() or "keyword"
        hidden_pairs = {
            str(node.get("name", "")).strip(): str(node.get("value", "")).strip()
            for node in inputs
            if str(node.get("type", "")).lower() == "hidden" and str(node.get("name", "")).strip()
        }
        if method == "GET":
            parsed = urlparse(action)
            query = parse_qs(parsed.query, keep_blank_values=True)
            query[field_name] = ["{keyword}"]
            for key, value in hidden_pairs.items():
                if key and key not in query:
                    query[key] = [value]
            search_url = urlunparse(parsed._replace(query=urlencode(query, doseq=True)))
            notes.append("已从页面搜索表单自动识别搜索地址。")
            return search_url, notes

        body = {**hidden_pairs, field_name: "{keyword}"}
        options = json.dumps({"method": method, "body": body}, ensure_ascii=False)
        notes.append("已从页面搜索表单自动识别 POST 搜索请求。")
        return f"{action},{options}", notes

    guessed = f"{base_url.rstrip('/')}/search?keyword={{keyword}}"
    notes.append("未直接识别到搜索表单，已按常见站点结构预填搜索地址，请测试后确认。")
    return guessed, notes


def choose_private_site_preset(current_url: str, content_type: str) -> str:
    parsed = urlparse(current_url)
    host = parsed.netloc.lower()
    if "json" in content_type.lower() or host.startswith("api."):
        return "json_api"
    if host.startswith("m."):
        return "mobile_paged"
    return "html_pc"


async def autodetect_private_site(url: str) -> PrivateSiteAutodetectResponse:
    target_url = str(url or "").strip()
    if not target_url.startswith(("http://", "https://")):
        raise ValueError("请填写完整的小说网址，需包含 http:// 或 https://")

    async with httpx.AsyncClient(
        timeout=15.0,
        follow_redirects=True,
        headers={"User-Agent": "ReaderHub AutoDetect/1.0"},
    ) as client:
        response = await client.get(target_url)
        response.raise_for_status()
        current_url = str(response.url)
        content_type = response.headers.get("content-type", "")
        if "html" not in content_type.lower():
            raise ValueError("当前网址返回的不是标准 HTML 页面，暂时只支持常见网页小说站自动识别。")
        html_text = response.text

    soup = BeautifulSoup(html_text, "lxml")
    parsed = urlparse(current_url)
    base_url = f"{parsed.scheme}://{parsed.netloc}"
    preset = choose_private_site_preset(current_url, content_type)
    preset_values = {
        "html_pc": {
            "search_list": ".search-list .book-item",
            "search_title": ".book-title@text",
            "search_author": ".book-author@text",
            "search_cover": "img@src",
            "search_intro": ".book-intro@text",
            "search_detail_url": ".book-title@href",
            "search_latest_chapter": ".book-latest@text",
        },
        "mobile_paged": {
            "search_list": ".search-item",
            "search_title": ".book-title@text",
            "search_author": ".book-author@text",
            "search_cover": ".book-cover img@src",
            "search_intro": ".book-desc@text",
            "search_detail_url": "a@href",
            "search_latest_chapter": ".book-update@text",
        },
        "json_api": {
            "search_list": "data.list",
            "search_title": "title",
            "search_author": "author",
            "search_cover": "cover",
            "search_intro": "intro",
            "search_detail_url": "detailUrl",
            "search_latest_chapter": "latestChapter",
        },
    }[preset]

    notes = [f"已按 `{preset}` 模板预填常见搜索规则。"]
    search_url, search_notes = autodetect_search_url(soup, current_url, base_url)
    notes.extend(search_notes)
    detail_title = choose_first_expression(
        soup,
        [
            ".book-header h1@text",
            ".book-info h1@text",
            ".info h1@text",
            "#info h1@text",
            ".novel_info h1@text",
            "h1@text",
            "meta[property='og:novel:book_name']@content",
            "meta[property='og:title']@content",
        ],
        min_length=2,
    )
    detail_author = choose_first_expression(
        soup,
        [
            ".book-meta .author@text",
            ".book-author@text",
            ".author@text",
            "meta[property='og:novel:author']@content",
        ],
        min_length=1,
    )
    detail_cover = choose_first_expression(
        soup,
        [
            ".book-cover img@src",
            ".cover img@src",
            ".pic img@src",
            "meta[property='og:image']@content",
        ],
    )
    detail_intro = choose_first_expression(
        soup,
        [
            "#bookIntro@text",
            "#intro@text",
            ".book-intro@text",
            ".intro@text",
            "meta[property='og:description']@content",
        ],
        min_length=20,
    )
    detail_status = choose_first_expression(
        soup,
        [
            ".book-status@text",
            ".status@text",
            ".book-meta .status@text",
        ],
    )
    toc_list, toc_title, toc_url = choose_best_toc_rule(soup)
    toc_next_url = choose_next_page_expression(soup) if toc_list else ""
    content_body = choose_best_content_expression(soup)
    content_next_url = choose_next_page_expression(soup) if content_body else ""

    if detail_title:
        notes.append("已识别详情页书名规则。")
    if toc_list:
        notes.append("已识别目录列表规则。")
    if content_body:
        notes.append("已识别正文区域规则。")
    if toc_next_url:
        notes.append("已识别目录下一页规则。")
    if content_next_url:
        notes.append("已识别正文下一页规则。")

    host_name = parsed.netloc.replace("www.", "")
    site = PrivateSiteSourceRequest(
        name=f"{host_name} 自动接入",
        description=f"自动识别自 {current_url}",
        enabled=True,
        base_url=base_url,
        headers={"User-Agent": "ReaderHub AutoDetect/1.0"},
        search_url=search_url,
        search_list=preset_values["search_list"],
        search_title=preset_values["search_title"],
        search_author=preset_values["search_author"],
        search_cover=preset_values["search_cover"],
        search_intro=preset_values["search_intro"],
        search_detail_url=preset_values["search_detail_url"],
        search_latest_chapter=preset_values["search_latest_chapter"],
        detail_title=detail_title,
        detail_author=detail_author,
        detail_cover=detail_cover,
        detail_intro=detail_intro,
        detail_status=detail_status,
        toc_list=toc_list,
        toc_title=toc_title,
        toc_url=toc_url,
        toc_next_url=toc_next_url,
        content_body=content_body,
        content_next_url=content_next_url,
    )
    return PrivateSiteAutodetectResponse(site=site, detected_preset=preset, notes=notes)


async def perform_legacy_request(
    search_url: str,
    context: dict[str, str],
    *,
    base_url: str = "",
    extra_headers: dict[str, str] | None = None,
) -> tuple[str, Any, str]:
    request_meta = normalize_legacy_url_template(search_url)
    url = absolutize_legacy_url(render_template(request_meta["url"], context), base_url)
    if url.startswith("demo://"):
        return "json", perform_demo_request(url), url

    headers = render_template(request_meta.get("headers", {}), context)
    if extra_headers:
        headers = {**extra_headers, **headers}
    params = render_template(request_meta.get("params", {}), context)
    body = render_template(request_meta.get("body", {}), context)

    async with httpx.AsyncClient(timeout=10.0, follow_redirects=True) as client:
        response = await client.request(
            method=request_meta["method"],
            url=url,
            headers=headers,
            params=params,
            data=body if request_meta["method"] != "GET" and body else None,
        )
        response.raise_for_status()
        final_url = str(response.url)
        content_type = response.headers.get("content-type", "").lower()
        if "json" in content_type:
            return "json", response.json(), final_url
        try:
            return "json", response.json(), final_url
        except (ValueError, json.JSONDecodeError):
            return "html", response.text, final_url


def detect_legacy_rule_mode(book_list_rule: str, response_mode: str) -> str:
    rule = (book_list_rule or "").strip()
    if response_mode == "json":
        return "json"
    if rule.startswith("/") or rule.startswith("./") or rule.startswith(".//"):
        return "xpath"
    return "css"


def split_legacy_attr_expression(expression: str) -> tuple[str, str]:
    text = (expression or "").strip()
    if "@" not in text:
        return text, "text"
    selector, attr = text.rsplit("@", 1)
    return selector.strip(), attr.strip() or "text"


def normalize_css_selector(selector: str) -> str:
    return selector.replace("&&", " ").replace("||", ",").strip()


def resolve_css_chain(nodes: list[Tag], selector: str) -> list[Tag]:
    current = nodes
    for raw_part in selector.split("&&"):
        part = raw_part.strip()
        if not part:
            continue
        alt_parts = [candidate.strip() for candidate in part.split("||") if candidate.strip()]
        next_nodes: list[Tag] = []
        for current_node in current:
            selected: list[Tag] = []
            for candidate in alt_parts or [part]:
                index: int | None = None
                base = candidate
                match = re.fullmatch(r"(.+?)\.(\d+)$", candidate)
                if match and not any(token in candidate for token in ("#", "[", ":", ">", "+", "~")):
                    base = match.group(1).strip()
                    index = int(match.group(2))
                node_results = current_node.select(base) if base else [current_node]
                if index is not None:
                    node_results = node_results[index:index + 1]
                if node_results:
                    selected.extend([node for node in node_results if isinstance(node, Tag)])
                    break
            next_nodes.extend(selected)
        current = next_nodes
    return current


def extract_css_field(node: Tag, expression: str) -> str:
    selector, attr = split_legacy_attr_expression(expression)
    targets = [node] if not selector else resolve_css_chain([node], selector)
    if not targets:
        return ""
    target = targets[0]
    if attr == "text":
        return target.get_text(" ", strip=True)
    if attr == "html":
        return "".join(str(child) for child in target.contents).strip()
    return str(target.get(attr, "")).strip()


def extract_xpath_field(node: Any, expression: str) -> str:
    selector, attr = split_legacy_attr_expression(expression)
    xpath_expr = selector or "."
    if xpath_expr.startswith("//"):
        xpath_expr = f".{xpath_expr}"
    results = node.xpath(xpath_expr)
    if not results:
        return ""
    target = results[0]
    if attr == "text":
        if isinstance(target, str):
            return target.strip()
        return " ".join(part.strip() for part in target.itertext() if part.strip())
    if attr == "html":
        if isinstance(target, str):
            return target.strip()
        return lxml_html.tostring(target, encoding="unicode").strip()
    if isinstance(target, str):
        return target.strip()
    return str(target.get(attr, "")).strip()


def extract_legacy_value(raw_item: Any, expression: str, mode: str, field_name: str) -> str:
    text = (expression or "").strip()
    if not text:
        return ""
    if any(token in text for token in ("@js:", "<js>", "@json:", "{{", "##")):
        raise_unsupported_legacy_rule(field_name, text)
    if mode == "json":
        path = normalize_legacy_rule_path(text, field_name=field_name, allow_empty=True)
        value = extract_path(raw_item, path)
        return "" if value is None else str(value)
    if mode == "css":
        return extract_css_field(raw_item, text)
    if mode == "xpath":
        return extract_xpath_field(raw_item, text)
    return ""


def extract_legacy_items(payload: Any, book_list_rule: str, mode: str) -> list[Any]:
    if mode == "json":
        path = normalize_legacy_rule_path(book_list_rule, field_name="ruleSearch.bookList")
        return ensure_list(extract_path(payload, path))
    if mode == "css":
        soup = BeautifulSoup(str(payload), "lxml")
        selector = normalize_css_selector(book_list_rule)
        return [item for item in soup.select(selector) if isinstance(item, Tag)]
    document = lxml_html.fromstring(str(payload))
    return ensure_list(document.xpath(book_list_rule))


def build_legacy_root(payload: Any, mode: str) -> Any:
    if mode == "json":
        return payload
    if mode == "css":
        return BeautifulSoup(str(payload), "lxml")
    return lxml_html.fromstring(str(payload))


def detect_legacy_expression_mode(expression: str, response_mode: str) -> str:
    text = (expression or "").strip()
    if response_mode == "json":
        return "json"
    if text.startswith("/") or text.startswith("./") or text.startswith(".//") or text.startswith("//"):
        return "xpath"
    return "css"


def expression_prefers_html(expression: str) -> bool:
    return expression.strip().endswith("@html")


def apply_legacy_replace_regex(content: str, replace_regex: str) -> str:
    text = content
    raw = (replace_regex or "").strip()
    if not raw:
        return text
    patterns = raw[2:] if raw.startswith("##") else raw
    for pattern in [item for item in patterns.split("||") if item]:
        text = re.sub(pattern, "", text, flags=re.MULTILINE)
    return text


def normalize_legacy_content_text(content: str, *, from_html: bool, replace_regex: str = "") -> str:
    text = content or ""
    if from_html:
        html_content = text.replace("<br>", "\n").replace("<br/>", "\n").replace("<br />", "\n")
        soup = BeautifulSoup(html_content, "lxml")
        text = soup.get_text("\n", strip=True)
    text = unescape(text)
    text = apply_legacy_replace_regex(text, replace_regex)
    text = text.replace("\r\n", "\n").replace("\r", "\n")
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def extract_legacy_root_value(payload: Any, response_mode: str, expression: str, field_name: str) -> str:
    mode = detect_legacy_expression_mode(expression, response_mode)
    root = build_legacy_root(payload, mode)
    return extract_legacy_value(root, expression, mode, field_name)


def merge_legacy_book_details(
    book: dict[str, Any],
    *,
    payload: Any,
    response_mode: str,
    page_url: str,
    legacy_config: dict[str, Any],
) -> dict[str, Any]:
    raw_config = get_legacy_raw_config(legacy_config)
    rule_book_info = get_legacy_rule(raw_config, "ruleBookInfo")
    if not rule_book_info:
        return book

    merged = dict(book)
    field_map = {
        "title": "name",
        "author": "author",
        "cover": "coverUrl",
        "intro": "intro",
        "latest_chapter": "lastChapter",
        "status": "status",
    }
    for output_field, legacy_field in field_map.items():
        expression = str(rule_book_info.get(legacy_field, "")).strip()
        if not expression:
            continue
        value = extract_legacy_root_value(payload, response_mode, expression, f"ruleBookInfo.{legacy_field}")
        if output_field == "cover":
            value = absolutize_legacy_url(value, page_url or resolve_legacy_base_url(legacy_config))
        if value:
            merged[output_field] = value
    return merged


async def open_legacy_book(source_id: int, source_name: str, legacy_config: dict[str, Any], book: dict[str, Any]) -> dict[str, Any]:
    raw_config = get_legacy_raw_config(legacy_config)
    rule_toc = get_legacy_rule(raw_config, "ruleToc")
    if not rule_toc.get("chapterList"):
        raise ValueError("当前旧格式书源未配置目录规则")

    detail_url = (
        str(book.get("detail_url", "")).strip()
        or str(book.get("book_id", "")).strip()
    )
    if not detail_url:
        raise ValueError("当前书籍缺少详情地址，无法获取目录")

    base_url = resolve_legacy_base_url(legacy_config)
    context = build_context(book, book.get("raw", {}))
    headers = parse_legacy_headers(legacy_config)
    response_mode, payload, page_url = await perform_legacy_request(
        detail_url,
        context,
        base_url=base_url,
        extra_headers=headers,
    )
    merged_book = merge_legacy_book_details(
        book,
        payload=payload,
        response_mode=response_mode,
        page_url=page_url,
        legacy_config=legacy_config,
    )

    chapters: list[dict[str, Any]] = []
    seen: set[str] = set()
    current_payload = payload
    current_mode = response_mode
    current_page_url = page_url
    next_expr = str(rule_toc.get("nextTocUrl", "")).strip()

    for _ in range(8):
        item_mode = detect_legacy_rule_mode(str(rule_toc.get("chapterList", "")), current_mode)
        raw_items = extract_legacy_items(current_payload, str(rule_toc.get("chapterList", "")), item_mode)
        for raw_item in raw_items:
            title = extract_legacy_value(raw_item, str(rule_toc.get("chapterName", "text")), item_mode, "ruleToc.chapterName").strip()
            chapter_url = extract_legacy_value(raw_item, str(rule_toc.get("chapterUrl", "")), item_mode, "ruleToc.chapterUrl").strip()
            chapter_url = absolutize_legacy_url(chapter_url, current_page_url or base_url)
            chapter_id = chapter_url or title
            if not title:
                continue
            identity = chapter_url or chapter_id or title
            if identity in seen:
                continue
            seen.add(identity)
            chapters.append(
                {
                    "title": title,
                    "chapter_id": chapter_id,
                    "chapter_url": chapter_url,
                    "raw": raw_item if isinstance(raw_item, dict) else {"value": str(raw_item)},
                }
            )

        if not next_expr:
            break
        next_url = extract_legacy_root_value(current_payload, current_mode, next_expr, "ruleToc.nextTocUrl")
        next_url = absolutize_legacy_url(next_url, current_page_url or base_url)
        if not next_url or next_url == current_page_url:
            break
        current_mode, current_payload, current_page_url = await perform_legacy_request(
            next_url,
            context,
            base_url=base_url,
            extra_headers=headers,
        )

    return {"book": merged_book, "chapters": chapters}


async def read_legacy_chapter_content(
    legacy_config: dict[str, Any],
    *,
    book: dict[str, Any],
    chapter: dict[str, Any],
) -> dict[str, str]:
    raw_config = get_legacy_raw_config(legacy_config)
    rule_content = get_legacy_rule(raw_config, "ruleContent")
    content_expr = str(rule_content.get("content", "")).strip()
    if not content_expr:
        raise ValueError("当前旧格式书源未配置正文规则")

    chapter_url = (
        str(chapter.get("chapter_url", "")).strip()
        or str(chapter.get("chapter_id", "")).strip()
    )
    if not chapter_url:
        raise ValueError("当前章节缺少正文地址")

    base_url = resolve_legacy_base_url(legacy_config)
    headers = parse_legacy_headers(legacy_config)
    context = build_context(book, book.get("raw", {}), chapter, chapter.get("raw", {}))

    parts: list[str] = []
    current_url = chapter_url
    visited: set[str] = set()
    next_expr = str(rule_content.get("nextContentUrl", "")).strip()
    replace_regex = str(rule_content.get("replaceRegex", "")).strip()

    for _ in range(8):
        target_url = absolutize_legacy_url(current_url, base_url)
        if not target_url or target_url in visited:
            break
        visited.add(target_url)

        response_mode, payload, page_url = await perform_legacy_request(
            target_url,
            context,
            base_url=base_url,
            extra_headers=headers,
        )
        content_mode = detect_legacy_expression_mode(content_expr, response_mode)
        root = build_legacy_root(payload, content_mode)
        segment = extract_legacy_value(root, content_expr, content_mode, "ruleContent.content")
        text = normalize_legacy_content_text(
            segment,
            from_html=expression_prefers_html(content_expr),
            replace_regex=replace_regex,
        )
        if text:
            parts.append(text)

        if not next_expr:
            break
        next_url = extract_legacy_root_value(payload, response_mode, next_expr, "ruleContent.nextContentUrl")
        next_url = absolutize_legacy_url(next_url, page_url or base_url)
        if not next_url or next_url in visited:
            break
        current_url = next_url

    content = "\n\n".join(part for part in parts if part).strip()
    if not content:
        raise ValueError("当前章节正文为空")
    return {"title": chapter.get("title", ""), "content": content}


async def search_source_legacy(
    source_id: int,
    source_name: str,
    legacy_config: dict[str, Any],
    keyword: str,
    limit_per_source: int,
) -> dict[str, Any]:
    extra_headers = parse_legacy_headers(legacy_config)
    response_mode, payload, resolved_url = await perform_legacy_request(
        str(legacy_config.get("search_url", "")),
        {"keyword": keyword},
        base_url=resolve_legacy_base_url(legacy_config),
        extra_headers=extra_headers,
    )
    rule_search = legacy_config.get("rule_search", {}) if isinstance(legacy_config, dict) else {}
    if not isinstance(rule_search, dict):
        raise ValueError("旧格式书源缺少 `ruleSearch` 配置")

    mode = detect_legacy_rule_mode(str(rule_search.get("bookList", "")), response_mode)
    raw_items = extract_legacy_items(payload, str(rule_search.get("bookList", "")), mode)[:limit_per_source]

    field_candidates = {
        "title": rule_search.get("name"),
        "author": rule_search.get("author"),
        "cover": rule_search.get("coverUrl") or rule_search.get("cover"),
        "intro": rule_search.get("intro") or rule_search.get("introHtml"),
        "detail_url": rule_search.get("bookUrl") or rule_search.get("url"),
        "book_id": rule_search.get("bookUrl") or rule_search.get("bookId"),
        "latest_chapter": rule_search.get("lastChapter") or rule_search.get("latestChapter"),
    }

    normalized_items: list[dict[str, Any]] = []
    for raw_item in raw_items:
        mapped = {
            "source_id": source_id,
            "source_name": source_name,
            "title": extract_legacy_value(raw_item, str(field_candidates.get("title", "")), mode, "ruleSearch.name"),
            "author": extract_legacy_value(raw_item, str(field_candidates.get("author", "")), mode, "ruleSearch.author"),
            "cover": extract_legacy_value(raw_item, str(field_candidates.get("cover", "")), mode, "ruleSearch.cover"),
            "intro": extract_legacy_value(raw_item, str(field_candidates.get("intro", "")), mode, "ruleSearch.intro"),
            "detail_url": extract_legacy_value(raw_item, str(field_candidates.get("detail_url", "")), mode, "ruleSearch.bookUrl"),
            "book_id": extract_legacy_value(raw_item, str(field_candidates.get("book_id", "")), mode, "ruleSearch.bookId"),
            "latest_chapter": extract_legacy_value(raw_item, str(field_candidates.get("latest_chapter", "")), mode, "ruleSearch.lastChapter"),
            "raw": {},
        }
        if isinstance(raw_item, dict):
            mapped["raw"] = raw_item
        elif isinstance(raw_item, Tag):
            mapped["raw"] = {"html": str(raw_item)}
        else:
            mapped["raw"] = {"value": str(raw_item)}
        mapped["cover"] = absolutize_legacy_url(
            mapped.get("cover", ""),
            resolved_url or resolve_legacy_base_url(legacy_config),
        )
        mapped["detail_url"] = absolutize_legacy_url(
            mapped.get("detail_url", ""),
            resolved_url or resolve_legacy_base_url(legacy_config),
        )
        mapped["book_id"] = absolutize_legacy_url(
            mapped.get("book_id", ""),
            resolved_url or resolve_legacy_base_url(legacy_config),
        )
        if mapped["title"]:
            normalized_items.append(mapped)

    return {
        "source_id": source_id,
        "source_name": source_name,
        "success": True,
        "count": len(normalized_items),
        "items": normalized_items,
    }


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
    if url.startswith("uploaded://"):
        return perform_uploaded_request(url)

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
    legacy_config = source_config.get("legacy")
    if isinstance(legacy_config, dict):
        return await search_source_legacy(
            source_id,
            source_name,
            legacy_config,
            keyword,
            limit_per_source,
        )

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
