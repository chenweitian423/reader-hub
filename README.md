# Reader Hub

当前版本：`1.15.1`

一个可 Docker 部署的轻量读书软件，支持：

- 导入自定义 JSON 书源
- 启用、停用、删除书源
- 按关键词并发搜索多个书源
- 数据备份、恢复与迁移
- 书架收藏与继续阅读
- 书架分类、标签与书架内搜索
- 阅读进度自动保存
- 阅读主题、字号、版心宽度、行距持久化
- 章节自动缓存与整本离线缓存
- 后台缓存任务与缓存进度展示
- 搜索结果按来源、可阅读状态、书架状态筛选
- 首次启动自动写入内置演示书源
- 首页统计总览与 favicon
- 最近搜索、最近更新与相关推荐分区
- 阅读器章节进度条与沉浸模式
- 独立阅读页与可折叠阅读侧栏
- 目录抽屉、底部翻页条与自动收起工具栏
- 旧格式书源兼容导入、搜索与清晰错误提示
- 本地 TXT / MD / EPUB 书籍导入
- 同网络设备直传书籍到书架
- 查看书籍章节目录
- 在线阅读章节正文
- SQLite 本地持久化
- Docker / Docker Compose 一键启动
- Docker 健康检查与环境变量配置
- 版本文件、更新日志和 Docker 版本镜像标签

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
├── CHANGELOG.md
├── VERSION
├── docker-compose.yml
├── Dockerfile
└── requirements.txt
```

## 2. 启动方式

### Docker Compose

```bash
docker compose up --build
```

当前仓库内的 [`docker-compose.yml`](/Users/sky/Documents/test/docker-compose.yml) 已改为直接使用已发布镜像：

```text
chenxiaotian423/reader-hub:${READER_HUB_IMAGE_TAG:-latest}
```

因此在部署机器上通常直接运行即可：

```bash
docker compose up -d
```

如果你希望固定到某个发布版本，可以先复制 [`.env.example`](/Users/sky/Documents/test/.env.example) 为 `.env`，然后把：

```text
READER_HUB_IMAGE_TAG=1.13.0
```

改成你要部署的镜像版本。

Compose 默认包含这些环境变量：

- `READER_HUB_IMAGE_TAG=latest`
- `READER_HUB_DATABASE_URL=sqlite:///./data/app.db`
- `READER_HUB_APP_TITLE=Reader Hub`
- `READER_HUB_AUTO_SEED_DEMO_SOURCE=true`
- `READER_HUB_ADMIN_USERNAME=admin`
- `READER_HUB_ADMIN_PASSWORD=admin123`
- `READER_HUB_DEFAULT_USER_USERNAME=reader`
- `READER_HUB_DEFAULT_USER_PASSWORD=reader123`
- `READER_HUB_SESSION_DAYS=14`
- `READER_HUB_CORS_ORIGINS=*`

镜像使用说明文档已整理在 [DOCKERHUB.md](/Users/sky/Documents/test/DOCKERHUB.md)，便于后续同步到 Docker Hub 仓库说明。
版本更新说明记录在 [CHANGELOG.md](/Users/sky/Documents/test/CHANGELOG.md)。

启动后访问：

[http://localhost:8000](http://localhost:8000)

### 本地 Python 运行

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload
```

## 3. Docker 环境变量

### `READER_HUB_IMAGE_TAG`

- 默认值：`latest`
- 用途：指定 `docker-compose.yml` 拉取的镜像版本
- 示例：`1.13.0`

### `READER_HUB_DATABASE_URL`

- 默认值：`sqlite:///./data/app.db`
- 用途：配置数据库连接字符串

### `READER_HUB_APP_TITLE`

- 默认值：`Reader Hub`
- 用途：配置后端服务标题

### `READER_HUB_AUTO_SEED_DEMO_SOURCE`

- 默认值：`true`
- 用途：控制首次启动时是否自动导入内置演示书源

### `READER_HUB_CORS_ORIGINS`

- 默认值：`*`
- 用途：配置局域网上传接口等前端调用允许的跨域来源
- 示例：`http://192.168.123.10:3000,https://reader.example.com`

### `READER_HUB_ADMIN_USERNAME`

- 默认值：`admin`
- 用途：设置默认管理员用户名

### `READER_HUB_ADMIN_PASSWORD`

- 默认值：`admin123`
- 用途：设置默认管理员初始密码

### `READER_HUB_DEFAULT_USER_USERNAME`

- 默认值：`reader`
- 用途：设置默认普通用户名

### `READER_HUB_DEFAULT_USER_PASSWORD`

- 默认值：`reader123`
- 用途：设置默认普通用户初始密码

### `READER_HUB_SESSION_DAYS`

- 默认值：`14`
- 用途：设置登录会话保留天数

## 4. 快速体验

1. 打开页面后点击“填入示例”
2. 导入示例书源
3. 搜索 `月`、`便利店` 或 `林见川`
4. 在“内置演示书源”的结果上点击“加入书架”或“阅读”
5. 选择章节后即可直接查看正文
6. 点击“缓存本书”可提前缓存全部章节，之后重复打开会优先命中本地缓存
7. 返回页面后可在“我的书架”中继续阅读，并保留你的阅读设置
8. 也可以用侧边栏“数据备份”导出当前书源、书架、缓存和阅读设置
9. 搜索后首页会自动记录最近搜索词，并在“最近更新”“相关推荐”里补充更像书城的发现内容
10. 打开书籍后会进入独立阅读页，正文区域更大，也可以手动收起侧栏进一步放大阅读区
11. 阅读页现在支持目录抽屉、底部翻页条，以及随滚动自动收起的顶部工具栏
12. 导入书源时会兼容一类常见旧格式书源，包括常见 JSON、HTML/CSS、XPath 搜索规则；更复杂规则现在也可先导入，若暂不支持会在搜索阶段单独提示
13. 你也可以在“我的书架”里直接导入 TXT、MD、EPUB，本地书会自动进入“本地导入书库”并可直接阅读
14. 书架页现在支持点击选择整个目录，或者把文件、文件夹直接拖进上传面板，再统一导入到书架
15. “当前设备导入”和“局域网设备上传”现在是两个独立入口，并会保存不同的导入来源标记

## 4.1 本地书籍导入

书架页支持直接导入：

- `.txt`
- `.md`
- `.epub`

现在也支持这些交互方式：

- 点击“选择书籍文件”批量挑选文件
- 点击“选择整个目录”一次导入整个文件夹
- 直接把文件或文件夹拖进上传面板
- 支持桌面浏览器原生目录选择器，兼容浏览器会直接弹出目录授权窗口
- 上传时会显示进度条，方便判断是否仍在传输中

导入后会自动：

- 加入书架
- 归入内置来源“本地导入书库”
- 支持目录、正文阅读和进度保存

## 4.2 局域网上传接口

如果另一台设备和 Reader Hub 在同一网络，可以直接调用：

```text
POST /api/library/uploads
```

如果你直接把这个地址复制进浏览器，现在会打开“局域网设备上传”专用页面，不再只显示接口说明 JSON。

请求格式为 `multipart/form-data`，字段：

- `files`：一个或多个书籍文件
- `category`：可选，默认分类
- `tags`：可选，逗号分隔的默认标签

示例：

```bash
curl -X POST "http://你的服务器地址:8000/api/library/uploads" \
  -F "files=@/path/to/book.epub" \
  -F "files=@/path/to/notes.txt" \
  -F "category=本地导入" \
  -F "tags=上传,局域网"
```

示例内已包含一个本地演示书源，不依赖第三方站点即可试读完整流程。
现在首次启动时也会自动写入“内置演示书源”，不必手动导入才能开始体验。

## 5. 书源 JSON 格式

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

## 6. 模板变量

请求配置中的 `url`、`headers`、`params`、`body` 都支持模板变量，例如：

- `{keyword}`
- `{book_id}`
- `{detail_url}`
- `{chapter_id}`
- `{raw.id}`

其中变量来自搜索结果、详情结果、章节结果及其原始字段。

内置演示书源额外支持 `demo://` 协议，方便在无外部依赖时演示完整阅读流程。

## 7. 字段说明

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

## 8. API 简介

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

返回结果中包含：

- `category`
- `tags`

### 导出备份

```http
GET /api/library/backup
```

### 恢复备份

```http
POST /api/library/restore
```

```json
{
  "mode": "merge",
  "data": {}
}
```

`mode` 支持：

- `merge`：合并导入
- `replace`：覆盖恢复

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

### 更新书架分类和标签

```http
PATCH /api/library/books/{book_key}
```

```json
{
  "category": "科幻",
  "tags": ["太空", "长篇"]
}
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

### 创建后台缓存任务

```http
POST /api/library/books/{book_key}/prefetch-jobs
```

### 获取最近一次后台缓存任务

```http
GET /api/library/books/{book_key}/prefetch-tasks/latest
```

### 查询后台缓存任务状态

```http
GET /api/prefetch-tasks/{task_id}
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

## 9. 默认示例

页面中的“填入示例”会加载三个示例书源：

- 内置演示书源
- Open Library
- Gutendex

其中只有“内置演示书源”默认配置了章节和正文阅读流程，另外两个主要用于公共搜索演示。

## 10. 推送 Git 与自动发布 Docker Hub

当前仓库已经包含 GitHub Actions 工作流：

- [`.github/workflows/docker-publish.yml`](/Users/sky/Documents/test/.github/workflows/docker-publish.yml)

它会在 `main` 分支有新提交时自动构建镜像并推送到 Docker Hub。
工作流会读取 [VERSION](/Users/sky/Documents/test/VERSION) 文件，并自动推送这些镜像 tag：

- `latest`
- `1.12.2`
- `1.12`
- `sha-<commit>`

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
