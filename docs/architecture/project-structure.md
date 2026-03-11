# 项目结构与开发流程

## 整体项目结构

```
DocPilot/
  frontend/                     # React 前端
    package.json
    vite.config.ts
    src/
      ...

  backend/                      # FastAPI 后端
    pyproject.toml
    app/
      ...

  collab-server/                # Yjs 协作服务
    package.json
    src/
      ...

  docs/                         # 设计文档（当前目录）
  .env.example                  # 环境变量模板
  Makefile                      # 开发命令快捷入口
```

## 环境变量

```bash
# .env

# MinIO
MINIO_ENDPOINT=your-minio-host:9000
MINIO_ACCESS_KEY=xxx
MINIO_SECRET_KEY=xxx
MINIO_BUCKET=docpilot-documents
MINIO_USE_SSL=false

# LiteLLM
LITELLM_MODEL=gpt-4o            # 或任意 OpenAI-compatible 模型
LITELLM_API_KEY=xxx
LITELLM_API_BASE=https://...     # 可选，自定义 endpoint

# 服务端口
FRONTEND_PORT=5173
COLLAB_SERVER_PORT=3050
BACKEND_PORT=8000
```

## 开发启动流程

```makefile
# Makefile

install:                         # 一键安装所有依赖
	cd frontend && npm install
	cd collab-server && npm install
	cd backend && uv sync

dev-collab:                      # 启动 Yjs 协作服务
	cd collab-server && npm run dev

dev-backend:                     # 启动 FastAPI
	cd backend && uvicorn app.main:app --reload --port 8000

dev-frontend:                    # 启动前端
	cd frontend && npm run dev

dev:                             # 三个终端分别启动（提示用户）
	@echo "请在三个终端分别运行:"
	@echo "  make dev-collab"
	@echo "  make dev-backend"
	@echo "  make dev-frontend"
```

## 依赖清单

### frontend/package.json

```json
{
  "dependencies": {
    "react": "^18",
    "react-dom": "^18",
    "superdoc": "latest",
    "yjs": "^13",
    "y-websocket": "^2",
    "zustand": "^4",
    "tailwindcss": "^4"
  }
}
```

### collab-server/package.json

```json
{
  "dependencies": {
    "@superdoc-dev/superdoc-yjs-collaboration": "latest",
    "fastify": "^5",
    "@fastify/websocket": "^11",
    "minio": "^8"
  }
}
```

### backend/pyproject.toml

```toml
[project]
dependencies = [
    "fastapi>=0.115",
    "uvicorn>=0.34",
    "websockets>=14",
    "litellm>=1.60",
    "superdoc-sdk",
    "boto3>=1.35",
    "python-multipart>=0.0.18",
]
```
