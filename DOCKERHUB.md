# Reader Hub Docker Image

`Reader Hub` 是一个可导入 JSON 书源的轻量读书软件，支持聚合搜索、书架管理、阅读进度保存、章节缓存和离线阅读。

Docker 镜像地址：

```text
chenxiaotian423/reader-hub:latest
```

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
    image: chenxiaotian423/reader-hub:latest
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

## 健康检查

镜像已内置健康检查，探测地址：

```text
/api/health
```

## 主要能力

- 导入和管理 JSON 书源
- 聚合搜索多个书源
- 书架收藏、继续阅读和阅读设置持久化
- 书架分类、标签与书架内搜索
- 章节缓存、整本后台缓存与进度展示
- Docker 部署与本地 SQLite 持久化
