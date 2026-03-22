# DocPilot 设计文档

DocPilot 是一个面向 `.docx` 的 AI 文档工作台，当前同时覆盖两条主能力链路：

- 文档编辑：浏览器中直接打开、编辑、自动保存 Word 文档，并通过右侧 Agent 对话驱动结构化修改
- 招标分析：对招标文件做阶段化提取，生成可修订的固定驾驶舱，并支持证据回看与原文定位

## 文档索引

| 文档 | 说明 |
|------|------|
| [architecture/overview.md](architecture/overview.md) | 当前整体架构、核心数据流、产品能力边界 |
| [frontend/design.md](frontend/design.md) | 当前前端布局、交互、招标驾驶舱与证据联动 |
| [frontend/technical.md](frontend/technical.md) | 前端实现细节、状态管理、WebSocket 事件与编辑器生命周期 |
| [backend/design.md](backend/design.md) | FastAPI 路由、Agent runtime、招标分析服务与存储约定 |
| [collab-server/design.md](collab-server/design.md) | collab-server 的 Yjs 能力、SuperDoc headless executor 与 MinIO 访问 |
| [ai-agent/design.md](ai-agent/design.md) | Agent tool 架构、Plan Mode、附件插图与错误恢复策略 |
| [architecture/project-structure.md](architecture/project-structure.md) | 项目目录、环境变量、开发命令与依赖说明 |

## 当前技术栈

| 层 | 技术 |
|----|------|
| 前端 | React 19 + Vite + TypeScript + SuperDoc + Zustand + Tailwind CSS 4 |
| 后端 | FastAPI + LiteLLM + CrewAI + boto3 + httpx |
| 文档执行层 | Fastify + SuperDoc Headless Editor + `@superdoc-dev/superdoc-yjs-collaboration` |
| 存储 | MinIO（S3 兼容） |
| 可选 Generative UI | `@tambo-ai/react` |

## 当前文档覆盖重点

- 编辑器主链路已经切换为“下载 docx 到浏览器挂载 + 导出回写”，不是旧方案里的前端直接通过 Yjs Provider 挂编辑器
- AI 文档工具执行通过 `collab-server` 的 `/agent/tools` 和 `/agent/dispatch` 完成，FastAPI 侧是 executor client，不是 Python SuperDoc SDK 直连
- 聊天面板支持 Plan Mode、内部 todo / scratchpad / subtask 运行时、图片附件与插图锚点澄清
- 招标分析由 backend 内嵌 CrewAI 阶段链路驱动，前端同时展示步骤流和固定驾驶舱
- 驾驶舱支持字段修订、时间线修订、待办生成、证据抽屉和左侧原文定位

## 说明

- `docs/plans/` 下的文件保留为阶段性规划记录，不代表当前已实现状态
- 本目录其它主文档已按当前代码实现反向补全
