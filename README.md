# Reader Hub

一个可 Docker 部署的轻量读书软件，支持：

- 导入自定义 JSON 书源
- 启用、停用、删除书源
- 按关键词并发搜索多个书源
- 书架收藏与继续阅读
- 阅读进度自动保存
- 阅读主题、字号、版心宽度、行距持久化
- 章节自动缓存与整本离线缓存
- 搜索结果按来源、可阅读状态、书架状态筛选
- 首次启动自动写入内置演示书源
- 首页统计总览与 favicon
- 查看书籍章节目录
- 在线阅读章节正文
- SQLite 本地持久化
- Docker / Docker Compose 一键启动

## 1. 项目结构

```text
.
├── app
│   ├── main.py
│   ├── database.py
│   ├── models.py
│   ├── schemas.py
│   ├── services
│   │   ├── demo_library.py
│   │   └── source_executor.py
│   └── static
│       ├── app.js
│       ├── index.html
│       ├── sample_sources.json
│       └── styles.css
├── data
├── docker-compose.yml
├── Dockerfile
└── requirements.txt
```

## 2. 启动方式

### Docker Compose

```bash
docker compose up --build
```

启动后访问：

[http://localhost:8000](http://localhost:8000)

### 本地 Python 运行

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload
```

## 3. 快速体验

1. 打开页面后点击“填入示例”
2. 导入示例书源
3. 搜索 `月`、`便利店` 或 `林见川`
4. 在“内置演示书源”的结果上点击“加入书架”或“阅读”
5. 选择章节后即可直接查看正文
6. 点击“缓存本书”可提前缓存全部章节，之后重复打开会优先命中本地缓存
7. 返回页面后可在“我的书架”中继续阅读，并保留你的阅读设置

示例内已包含一个本地演示书源，不依赖第三方站点即可试读完整流程。
现在首次启动时也会自动写入“内置演示书源”，不必手动导入才能开始体验。

## 4. 书源 JSON 格式

支持导入单个对象或对象数组。

```json
[
  {
    "name": "演示书源",
    "description": "支持搜索、目录和正文",
    "enabled": true,
    "search": {
      "method": "GET",
      "url": "demo://search?keyword={keyword}",
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
        "latest_chapter": "latest_chapter"
      },
      "transforms": {},
      "timeout_seconds": 10
    },
    "detail": {
      "method": "GET",
      "url": "demo://books/{book_id}",
      "result_path": "book",
      "fields": {
        "title": "title",
        "author": "author",
        "cover": "cover",
        "intro": "intro",
        "detail_url": "detail_url",
        "book_id": "id",
        "latest_chapter": "latest_chapter",
        "status": "status"
      },
      "transforms": {},
      "timeout_seconds": 10
    },
    "chapters": {
      "method": "GET",
      "url": "demo://books/{book_id}/chapters",
      "result_path": "chapters",
      "fields": {
        "title": "title",
        "chapter_id": "id",
        "chapter_url": "url"
      },
      "transforms": {},
      "timeout_seconds": 10
    },
    "content": {
      "method": "GET",
      "url": "demo://books/{book_id}/chapters/{chapter_id}",
      "result_path": "chapter",
      "fields": {
        "title": "title",
        "content": "content"
      },
      "transforms": {},
      "timeout_seconds": 10
    }
  }
]
```

## 5. 模板变量

请求配置中的 `url`、`headers`、`params`、`body` 都支持模板变量，例如：

- `{keyword}`
- `{book_id}`
- `{detail_url}`
- `{chapter_id}`
- `{raw.id}`

其中变量来自搜索结果、详情结果、章节结果及其原始字段。

内置演示书源额外支持 `demo://` 协议，方便在无外部依赖时演示完整阅读流程。

## 6. 字段说明

### `search.fields` 常用字段

- `title`
- `author`
- `cover`
- `intro`
- `detail_url`
- `book_id`
- `latest_chapter`

其中 `title` 是必需字段。

### `detail.fields` 常用字段

- `title`
- `author`
- `cover`
- `intro`
- `detail_url`
- `book_id`
- `latest_chapter`
- `status`

### `chapters.fields` 常用字段

- `title`
- `chapter_id`
- `chapter_url`

### `content.fields` 常用字段

- `title`
- `content`

## 7. API 简介

### 获取书源

```http
GET /api/sources
```

### 导入书源

```http
POST /api/sources/import
Content-Type: application/json
```

### 更新书源启用状态

```http
PATCH /api/sources/{source_id}
```

```json
{
  "enabled": false
}
```

### 删除书源

```http
DELETE /api/sources/{source_id}
```

### 搜索图书

```http
POST /api/search
```

```json
{
  "keyword": "三体",
  "limit_per_source": 10
}
```

搜索结果会返回稳定的 `book_key`，用于书架和进度持久化。

### 打开书籍并读取章节目录

```http
POST /api/books/open
```

```json
{
  "source_id": 1,
  "book": {
    "title": "示例书籍",
    "book_id": "demo-book"
  }
}
```

### 获取章节正文

```http
POST /api/books/content
```

```json
{
  "source_id": 1,
  "book": {
    "book_id": "demo-book"
  },
  "chapter": {
    "chapter_id": "chapter-1",
    "title": "第一章"
  }
}
```

接口返回中的 `cached` 字段表示本次正文是否直接来自本地缓存。

### 获取书架列表

```http
GET /api/library/books
```

### 加入书架

```http
POST /api/library/books
```

```json
{
  "source_id": 1,
  "book": {
    "book_key": "xxx",
    "title": "示例书籍",
    "book_id": "demo-book"
  }
}
```

### 移出书架

```http
DELETE /api/library/books/{book_key}
```

### 保存阅读进度

```http
POST /api/library/books/{book_key}/progress
```

```json
{
  "source_id": 1,
  "book": {
    "book_key": "xxx",
    "book_id": "demo-book"
  },
  "chapter": {
    "chapter_id": "chapter-1",
    "title": "第一章"
  },
  "chapter_index": 0
}
```

### 获取已缓存章节列表

```http
GET /api/library/books/{book_key}/cached-chapters
```

### 缓存整本章节

```http
POST /api/library/books/{book_key}/prefetch
```

```json
{
  "source_id": 1,
  "book": {
    "book_key": "xxx",
    "book_id": "demo-book"
  },
  "chapters": [
    {
      "chapter_key": "yyy",
      "chapter_id": "chapter-1",
      "title": "第一章"
    }
  ]
}
```

### 清空本书缓存

```http
DELETE /api/library/books/{book_key}/cached-chapters
```

### 获取阅读设置

```http
GET /api/reader/preferences
```

### 更新阅读设置

```http
PUT /api/reader/preferences
```

```json
{
  "theme": "night",
  "font_size": 20,
  "content_width": 900,
  "line_height": 2.2
}
```

## 8. 默认示例

页面中的“填入示例”会加载三个示例书源：

- 内置演示书源
- Open Library
- Gutendex

其中只有“内置演示书源”默认配置了章节和正文阅读流程，另外两个主要用于公共搜索演示。

## 9. 推送 Git 与自动发布 Docker Hub

当前仓库已经包含 GitHub Actions 工作流：

- [`.github/workflows/docker-publish.yml`](/Users/sky/Documents/test/.github/workflows/docker-publish.yml)

它会在 `main` 分支有新提交时自动构建镜像并推送到 Docker Hub。

### 本地推送代码

```bash
git init
git branch -M main
git add .
git commit -m "feat: initialize reader hub"
git remote add origin <你的 Git 仓库地址>
git push -u origin main
```

### GitHub 仓库需要配置的项

在仓库设置中补这三个值：

- `Actions secrets` 里的 `DOCKERHUB_USERNAME`
- `Actions secrets` 里的 `DOCKERHUB_TOKEN`
- `Actions variables` 里的 `DOCKERHUB_REPOSITORY`

其中 `DOCKERHUB_REPOSITORY` 的格式是：

```text
你的 DockerHub 用户名/镜像名
```

例如：

```text
sky/reader-hub
```

配置完成后，只要你把代码推到 `main`，GitHub 就会自动把镜像推到 Docker Hub。
