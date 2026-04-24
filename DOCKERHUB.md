# Reader Hub Docker Image

`Reader Hub` 是一个可导入 JSON 书源的轻量读书软件，支持聚合搜索、书架管理、阅读进度保存、章节缓存和离线阅读。

Docker 镜像地址：

```text
chenxiaotian423/reader-hub:latest
```

当前发布版本：

```text
1.15.0
```

每次迭代发布后，镜像会同时生成这些标签：

- `latest`
- `1.15.0`
- `1.15`
- `sha-<commit>`

## 快速启动

### docker run

```bash
docker run -d \
  --name reader-hub \
  -p 8000:8000 \
  -e READER_HUB_DATABASE_URL=sqlite:///./data/app.db \
  -e READER_HUB_APP_TITLE="Reader Hub" \
  -e READER_HUB_AUTO_SEED_DEMO_SOURCE=true \
  -v $(pwd)/data:/app/data \
  chenxiaotian423/reader-hub:latest
```

### docker compose

```yaml
services:
  reader-hub:
    image: chenxiaotian423/reader-hub:${READER_HUB_IMAGE_TAG:-latest}
    ports:
      - "8000:8000"
    environment:
      READER_HUB_DATABASE_URL: sqlite:///./data/app.db
      READER_HUB_APP_TITLE: Reader Hub
      READER_HUB_AUTO_SEED_DEMO_SOURCE: "true"
    volumes:
      - ./data:/app/data
    restart: unless-stopped
```

启动后访问：

```text
http://localhost:8000
```

## 环境变量

### `READER_HUB_IMAGE_TAG`

- 默认值：`latest`
- 作用：指定要部署的 Docker 镜像版本
- 例子：`1.13.0`

### `READER_HUB_DATABASE_URL`

- 默认值：`sqlite:///./data/app.db`
- 作用：设置应用数据库连接字符串
- Docker 常用建议：SQLite 情况下继续挂载 `/app/data`

### `READER_HUB_APP_TITLE`

- 默认值：`Reader Hub`
- 作用：设置后端服务标题，便于多实例区分

### `READER_HUB_AUTO_SEED_DEMO_SOURCE`

- 默认值：`true`
- 可选值：`true` / `false`
- 作用：首次启动时是否自动写入“内置演示书源”

### `READER_HUB_CORS_ORIGINS`

- 默认值：`*`
- 作用：配置局域网上传接口等前端调用允许的跨域来源
- 例子：`http://192.168.123.10:3000,https://reader.example.com`

## 健康检查

镜像已内置健康检查，探测地址：

```text
/api/health
```

## 主要能力

- 应用版本号、更新日志与 Docker 版本镜像标签
- 导入和管理 JSON 书源
- 数据备份、恢复和跨环境迁移
- 聚合搜索多个书源
- 书架收藏、继续阅读和阅读设置持久化
- 书架分类、标签与书架内搜索
- 章节缓存、整本后台缓存与进度展示
- 最近搜索、最近更新、相关推荐与更像书城首页的发现分区
- 阅读器章节进度条与沉浸模式
- 独立阅读页、更大的正文区域与可折叠侧栏
- 目录抽屉、底部翻页条与自动收起的阅读工具栏
- 旧格式书源兼容导入与搜索支持，覆盖常见 JSON、HTML/CSS、XPath 搜索规则
- 放宽旧格式导入校验，更复杂规则也可先导入，搜索阶段再按来源单独提示
- 本地 TXT / MD / EPUB 书籍导入
- 书架页点击选择整个目录、拖动文件或文件夹后统一上传
- 兼容浏览器优先使用原生文件/目录选择器，并保留传统 input 回退
- “当前设备导入”和“局域网设备上传”拆成两个独立入口，并保留不同导入来源标记
- 当前设备导入和局域网上传页都支持上传进度展示
- 同网络设备通过 `/api/library/uploads` 直接上传书籍到书架

## 局域网上传接口

服务启动后，同一网络下的设备可以直接向下面这个接口上传书籍：

```text
POST /api/library/uploads
```

直接在浏览器里访问这个地址时，镜像现在会返回一个可直接上传文件的网页；程序调用时仍可继续使用同一个 POST 接口。

请求格式：

- `multipart/form-data`
- 字段 `files`：一个或多个书籍文件
- 可选字段 `category`：导入后默认分类
- 可选字段 `tags`：逗号分隔的默认标签

支持格式：

- `txt`
- `md`
- `epub`
- Docker 部署与本地 SQLite 持久化
