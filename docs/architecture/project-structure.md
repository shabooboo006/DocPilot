# 项目结构与开发流程

## 整体项目结构

```text
DocPilot/
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── editor/          # SuperDoc 编辑器容器与 hook
│   │   │   ├── chat/            # Chat / Plan / Tool stream UI
│   │   │   ├── layout/          # Toolbar / MainLayout / StatusBar
│   │   │   └── analysis/        # 招标驾驶舱、步骤流、证据抽屉
│   │   ├── hooks/               # Zustand store + Chat WebSocket
│   │   ├── services/api.ts      # REST API 客户端
│   │   └── types/               # 前端共享类型
│   └── package.json
├── backend/
│   ├── app/
│   │   ├── routers/             # documents / chat / tender_analysis
│   │   ├── services/            # agent / document / realtime / tender
│   │   ├── models/              # Pydantic schema
│   │   ├── config.py
│   │   └── main.py
│   └── pyproject.toml
├── collab-server/
│   ├── src/
│   │   ├── index.ts             # Fastify 入口
│   │   ├── executor.ts          # SuperDoc headless tool executor
│   │   ├── storage.ts           # MinIO 访问
│   │   └── config.ts
│   └── package.json
├── docs/
├── .env.example
└── Makefile
```

## 关键目录说明

### `frontend/src/components/analysis`

这一层是当前仓库新增最多的功能区，主要包含：

- `ExtractionRunStream` / `ExtractionRunCard`：在聊天流中展示招标分析运行过程
- `TenderDashboard`：固定驾驶舱入口
- `TenderOverviewBoard`、`TenderTimelineBoard`、`LotAndBudgetTable`
- `TenderChecklistBoard`、`EvaluationMatrix`、`RiskRegisterBoard`
- `OpenQuestionsPanel`、`EvidenceDrawer`
- `TamboAppProvider`：可选接入 Tambo 保存交互状态

### `backend/app/services`

- `agent_service.py`：LiteLLM agentic loop、Plan Mode、subtask、图片附件处理、工具错误恢复
- `document_service.py`：文档存储、聊天图片附件、分析快照落盘
- `superdoc_service.py`：collab-server executor 的 HTTP client
- `realtime_service.py`：按 `document_id` 广播 WebSocket 事件
- `tender_analysis_service.py`：招标分析 run / step / snapshot 生命周期
- `tender_analysis_crew.py`：内嵌 CrewAI 五阶段提取团队

### `collab-server/src`

- `index.ts`：同时提供 `/doc/:documentId`、`/agent/tools`、`/agent/dispatch`
- `executor.ts`：当前文档工具 catalog 与真正的读取/写入执行逻辑
- `storage.ts`：读取文档、聊天附件原图/预览图

## 环境变量

项目从根目录 `.env` 读取配置。当前代码使用的核心变量如下：

```env
# MinIO
MINIO_ENDPOINT=localhost:9000
MINIO_ACCESS_KEY=minioadmin
MINIO_SECRET_KEY=minioadmin
MINIO_BUCKET=docpilot-documents
MINIO_USE_SSL=false

# LiteLLM / CrewAI
LITELLM_MODEL=gpt-4o
LITELLM_API_KEY=sk-xxx
LITELLM_API_BASE=
CREWAI_VERBOSE=false

# 服务端口与 executor
FRONTEND_PORT=6173
COLLAB_SERVER_PORT=6350
BACKEND_PORT=6800
SUPERDOC_EXECUTOR_URL=http://localhost:6350

# 可选：招标驾驶舱 Generative UI
VITE_TAMBO_API_KEY=
```

补充说明：

- backend 默认允许的前端来源是 `http://localhost:6173`
- `superdoc_executor_url` 默认也是 `http://localhost:6350`
- `collab_server_url` 目前在 backend config 中保留，但主链路使用的是 executor HTTP 地址

## 开发命令

当前 `Makefile`：

```makefile
.PHONY: install dev-collab dev-backend dev-frontend dev

install:
	cd collab-server && npm install
	cd frontend && npm install
	cd backend && uv venv && uv sync

dev-collab:
	cd collab-server && npm run dev

dev-backend:
	cd backend && uv run uvicorn app.main:app --reload --port 6800

dev-frontend:
	cd frontend && npm run dev

dev:
	@echo "请在三个终端分别运行:"
	@echo "  make dev-collab"
	@echo "  make dev-backend"
	@echo "  make dev-frontend"
```

## 依赖清单

### frontend

当前前端关键依赖：

```json
{
  "dependencies": {
    "@tambo-ai/react": "^1.2.3",
    "react": "^19.2.0",
    "react-dom": "^19.2.0",
    "superdoc": "^1.21.0",
    "y-websocket": "^3.0.0",
    "yjs": "13.6.19",
    "zod": "^4.1.12",
    "zustand": "^5.0.11"
  }
}
```

说明：

- `yjs` / `y-websocket` 仍在依赖中，但当前前端主编辑链路并未直接启用 provider
- `@tambo-ai/react` 是可选增强，不配置 API key 时会自动降级为普通 React 组件

### backend

```toml
[project]
dependencies = [
    "fastapi>=0.115",
    "uvicorn[standard]>=0.34",
    "websockets>=14",
    "litellm>=1.60",
    "boto3>=1.35",
    "httpx>=0.28",
    "python-docx>=1.1",
    "pillow>=11",
    "python-multipart>=0.0.18",
    "pydantic-settings>=2.7",
    "python-dotenv>=1.0",
    "crewai>=1.11.0",
]
```

### collab-server

```json
{
  "dependencies": {
    "@fastify/websocket": "^11",
    "@superdoc-dev/superdoc-yjs-collaboration": "^1.0.2",
    "dotenv": "^16",
    "fastify": "^5",
    "minio": "^8",
    "superdoc": "^1.21.0",
    "yjs": "13.6.19"
  }
}
```
