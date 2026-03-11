# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目概述

DocPilot 是 AI 驱动的 Web 文档编辑平台。用户在浏览器中编辑 `.docx` 文档，通过右侧 Chat 面板用自然语言与 AI 对话，AI Agent 基于 SuperDoc 的文档能力读取和修改文档。

## SuperDoc 参考资料

- 官方仓库：<https://github.com/superdoc-dev/superdoc>
- 入门文档：<https://docs.superdoc.dev/getting-started/introduction>
- AI Agents 总览：<https://docs.superdoc.dev/getting-started/ai-agents>
- Document Engine Overview：<https://docs.superdoc.dev/document-engine/overview>
- Document API Overview：<https://docs.superdoc.dev/document-api/overview>
- SDKs：<https://docs.superdoc.dev/document-engine/sdks>
- CLI：<https://docs.superdoc.dev/document-engine/cli>
- LLM Tools：<https://docs.superdoc.dev/document-engine/ai-agents/llm-tools>

### SuperDoc 核心认知

- SuperDoc 处理的是真实 `.docx`，不是“类 Word 富文本编辑器”。它支持 tracked changes、复杂表格、页眉页脚、section breaks 等 Word 原生能力。
- SuperDoc 同时覆盖浏览器编辑和无头后端处理。官方文档明确把 AI agent、批处理、自动化归到 headless / Document Engine 能力里。
- Document Engine 目前官方标注为 alpha，接口、工具名、schema 都可能变化。仓库集成时不要把它当成完全稳定协议。

### SuperDoc 与 AI Agent 的官方建议

- `getting-started/ai-agents` 页面说明：低层方案是直接在 Node.js 中用 headless `Editor` 操作文档；但生产级 AI agent 工作流，官方更推荐 Document Engine 的 AI tools。
- `document-engine/overview` 页面说明：同一套文档操作能力有 4 个入口，分别是浏览器内 `Document API`、后端 `SDKs`、终端 `CLI`、以及面向 agent 的 MCP Server；它们共享同一套 operation set。
- `document-engine/ai-agents/llm-tools` 页面说明：官方 SDK 已提供 provider-ready tool definitions 和 dispatch 能力，可直接接 OpenAI / Anthropic / Vercel AI / custom LLM integration。
- `document-api/overview` 页面说明：Document API 是稳定、与编辑器内部实现解耦的文档访问层；跨 session 定位块节点时，应优先依赖 `query.match()` / `nodeId`，不要直接依赖易变的运行时 ID。
- `getting-started/ai-agents` 页面说明：若要让 AI 改动以修订模式呈现，应使用 `suggesting` mode。

### 对本仓库的落地含义

- 前端浏览器侧：优先把 SuperDoc 当作真实 `.docx` 编辑器使用，不要退化成 HTML 富文本思维。
- 后端 Agent 侧：优先对齐官方的 Document Engine SDK / LLM Tools 设计，而不是自定义一套不可迁移的 tool schema。
- 工具抽象层：如果要扩展 AI 文档能力，优先围绕“读取、定位、变更、保存、tracked changes、comments”这些官方 operation 设计。
- 标识稳定性：跨多轮 agent 或多次打开文档的引用，优先使用 Document API 暴露的稳定 block/node addressing；不要依赖前端临时生成的节点 ID。
- Track Changes：凡是“建议模式”相关实现，都应优先映射到 SuperDoc 官方的 `suggesting` / tracked change 语义，而不是仅做 UI 状态切换。

## 常用命令

### 安装依赖
```bash
make install
# 等价于：
cd collab-server && npm install
cd frontend && npm install
cd backend && uv venv && uv sync
```

### 启动开发服务（需三个终端）
```bash
make dev-collab     # 协同服务，端口 6350
make dev-backend    # FastAPI 后端，端口 6800
make dev-frontend   # React 前端，端口 6173
```

### 运行测试
```bash
# 后端所有测试
cd backend && uv run pytest

# 单个测试文件
cd backend && uv run pytest tests/test_agent_service.py

# 单个测试函数
cd backend && uv run pytest tests/test_agent_service.py::test_run_agent_loop_text_only_response
```

### 前端 Lint
```bash
cd frontend && npm run lint
```

### 前端构建
```bash
cd frontend && npm run build
```

## 架构概览

系统由 3 个服务组成：

```
浏览器
  ├─ HTTP ──→ FastAPI (6800)       # 文档 CRUD、AI Agent WebSocket
  │               └─ LiteLLM ──→ LLM API
  └─ WebSocket ──→ Fastify (6350)  # Yjs 实时协同
                      └─ MinIO     # .docx 文档持久化
```

### 核心 AI 数据流

1. 用户在 Chat 面板发送消息 → Frontend WebSocket → `POST /ws/chat/{document_id}`
2. `chat.py` 路由调用 `agent_service.run_agent_loop()`
3. Agent loop 调用 LiteLLM，LLM 返回 tool calls
4. `superdoc_service.dispatch_tool()` 执行文档工具（当前为本地 docx fallback；目标形态应对齐 SuperDoc Document Engine SDK / LLM Tools）
5. 当前实现将修改后的 `.docx` 保存到 MinIO，前端在工具成功后刷新编辑器内容
6. 工具结果返回 LLM，继续 agentic loop（最多 `MAX_TOOL_ROUNDS=10` 轮）
7. 最终回复通过 WebSocket 推送到 Chat 面板

### 后端 (`backend/`)

- `app/main.py` — FastAPI 入口，挂载 CORS、路由、lifespan 钩子（确保 MinIO bucket）
- `app/config.py` — Pydantic Settings，从 `../.env` 读取配置（MinIO、LiteLLM、服务 URL）
- `app/routers/documents.py` — REST API：上传/新建/下载/删除文档，document_id 格式为 12 位 hex；包含 `PUT /api/documents/{document_id}/content` 保存当前 docx
- `app/routers/chat.py` — WebSocket `/ws/chat/{document_id}`，管理内存中的聊天历史（per document，重启丢失）
- `app/services/agent_service.py` — LiteLLM agentic loop，通过 WebSocket 实时推送 `tool_call`/`tool_result`/`ai_message` 事件
- `app/services/superdoc_service.py` — **当前为 docx fallback 实现**，提供 `get_document_text` / `set_document_title` / `replace_text` / `append_paragraph` 等基础工具；后续应迁移到官方 SuperDoc Document Engine SDK / LLM Tools
- `app/services/document_service.py` — MinIO 文档 CRUD（boto3），新建文档时会生成真实空白 `.docx`

### 协同服务 (`collab-server/`)

- `src/index.ts` — Fastify + `@fastify/websocket`，使用 `CollaborationBuilder` 创建 Yjs 协作服务
- `src/storage.ts` — MinIO 读写，文档存储路径为 `documents/{documentId}/current.docx`
- WebSocket 端点：`/doc/:documentId`

> 注意：当前主编辑链路已经切到“前端直接加载 docx + 自动保存回后端”。`collab-server/` 仍保留在仓库中，但目前不是前端编辑器初始化的主路径。

### 前端 (`frontend/`)

- `src/App.tsx` — 顶层布局：`Toolbar` + `MainLayout`（左：`EditorPanel`，右：`ChatPanel`）+ `StatusBar`
- `src/components/editor/useSuperdoc.ts` — 核心 hook，拉取当前 `.docx`，动态 import `superdoc` 挂载编辑器，并在本地编辑后自动导出/保存
- `src/hooks/useWebSocket.ts` (实为 `useChatWebSocket`) — 管理与后端 6800 的 Chat WebSocket，处理 `ai_message`/`tool_call`/`tool_result`/`error` 事件；文档工具成功后触发编辑器刷新
- `src/hooks/useDocumentStore.ts` — Zustand store，全局文档状态（documentId、documentName、suggestMode、connectionStatus、editorRefreshKey）
- `src/hooks/useChatStore.ts` — Zustand store，聊天消息列表

## 关键设计决策

**当前实现 vs 官方目标**：仓库目前已经能直接读取和修改 `.docx`，但后端 AI 工具层仍是本地 fallback，不是官方 Document Engine SDK。后续重构应优先迁移到官方 `superdoc-sdk` / LLM Tools，而不是继续扩展自定义 schema。

**建议模式 vs 直接编辑**：产品语义应对齐 SuperDoc 官方 `suggesting` / tracked changes 模式。当前前端会切换编辑器模式，后端 fallback 暂时仍是直接写入，不是真正的 tracked changes。

**聊天历史**：存储在内存字典 `_chat_histories[document_id]`，服务重启后丢失，MVP 不持久化。

**文档 ID**：12 位 hex 字符串，由后端 `document_service` 生成，在 MinIO 中作为路径前缀。

**Document API 寻址原则**：如果未来引入官方 Document API / SDK，多轮 agent 编辑、跨 session block 引用、精确 mutation 应基于稳定地址和 `query.match()` 结果，不要依赖运行时临时 ID。

## Agent 实现指引

在这个仓库里处理 “AI 修改文档” 相关任务时，优先遵循以下顺序：

1. 能用官方 SuperDoc Document Engine SDK / LLM Tools，就不要再新增自定义文档工具协议。
2. 如果必须保留 fallback，也要让工具命名和参数尽量贴近官方 operation 语义，降低未来迁移成本。
3. 涉及建议模式、批注、修订、接受/拒绝改动时，优先查官方文档确认 capability，再决定是否在仓库中实现。
4. 涉及跨会话精确定位的编辑，不要使用脆弱的“第几个段落”或前端临时节点 ID，优先使用稳定 block addressing 方案。
5. 如果需要给 LLM 补充上下文，优先使用官方 `llms.txt` / `llms-full.txt` 和上面的 SuperDoc 文档页面。

## 当前已知差距

- 当前后端还没有接入官方 `superdoc-sdk` 的 Node / Python Document Engine 客户端。
- 当前 `collab-server/` 存在，但主编辑链路还没有完整对齐官方协作 + headless agent 的统一模型。
- 当前建议模式在前端可见，但后端 fallback 不会产出真正的 Word tracked changes。
- 如果后续要做 production-grade AI agent，优先参考官方 LLM Tools 的 `chooseTools` / `dispatch` 模式重写 `agent_service.py` 与 `superdoc_service.py`。

## 环境变量

从项目根目录 `.env` 读取（backend 配置 `env_file="../.env"`，collab-server 从 `src/config.ts` 读取）：

| 变量 | 说明 |
|------|------|
| `MINIO_ENDPOINT` | MinIO 地址，默认 `localhost:9000` |
| `MINIO_ACCESS_KEY` / `MINIO_SECRET_KEY` | MinIO 认证 |
| `MINIO_BUCKET` | 存储桶名，默认 `docpilot-documents` |
| `LITELLM_MODEL` | LLM 模型，默认 `gpt-4o` |
| `LITELLM_API_KEY` | LLM API key |
| `LITELLM_API_BASE` | 自定义 LLM 接口地址（留空用 OpenAI 官方） |
