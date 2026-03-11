# DocPilot 设计文档

DocPilot —— AI 驱动的 Vibe Writing 平台。像 Vibe Coding 写代码一样，用自然语言对话编辑 .docx 文档。

## 文档索引

| 文档 | 说明 |
|------|------|
| [architecture/overview.md](architecture/overview.md) | 整体架构与需求总结 |
| [frontend/design.md](frontend/design.md) | 前端 UI 布局与组件设计 |
| [frontend/technical.md](frontend/technical.md) | 前端技术细节与状态管理 |
| [backend/design.md](backend/design.md) | 后端架构与 API 设计 |
| [collab-server/design.md](collab-server/design.md) | Yjs 协作服务设计 |
| [ai-agent/design.md](ai-agent/design.md) | AI Agent 与 SuperDoc 集成 |
| [architecture/project-structure.md](architecture/project-structure.md) | 项目结构与开发流程 |

## 技术栈

| 层 | 技术 |
|----|------|
| 前端 | React 18 + Vite + TypeScript + SuperDoc + Tailwind CSS |
| 后端 | FastAPI + Python + LiteLLM + SuperDoc Python SDK |
| 协作 | Yjs + @superdoc-dev/superdoc-yjs-collaboration + Fastify |
| 存储 | MinIO (S3 兼容) |
| 文档引擎 | [superdoc](https://github.com/superdoc-dev/superdoc) |
