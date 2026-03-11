# 整体架构与需求总结

## 产品定位

DocPilot 是一个 AI 驱动的 Web 文档编辑平台。用户在浏览器中查看和编辑 .docx 文档，通过右侧 Chat 面板用自然语言与 AI 对话，AI Agent 驱动文档修改。整体体验类似安装了 Claude Code 插件的 VSCode IDE，但操作对象是 .docx 文档而非代码。

## MVP 需求总结

| 维度 | 决定 |
|------|------|
| 用户模式 | 单用户 + AI，架构预留多人协作 |
| 文档管理 | 上传 + 新建，后续扩展完整管理 |
| AI 能力 | superdoc 全量 11 组 LLM tools |
| 编辑模式 | 可切换：建议模式（默认）/ 直接生效 |
| LLM 接入 | LiteLLM，OpenAI-compatible |
| 存储 | 已有 MinIO（自建，认证信息具备） |
| 部署 | 本地开发优先，不容器化 |
| 认证 | MVP 不需要 |

## MVP 功能边界

**包含：**

- 上传 .docx 文件并在编辑器中打开
- 新建空白文档
- 用户手动编辑文档
- Chat 面板与 AI 对话
- AI 通过 superdoc 全量 11 组工具编辑文档
- 建议模式 / 直接生效切换
- 下载编辑后的 .docx
- 自动保存到 MinIO

**不包含（后续迭代）：**

- 用户认证与多用户
- 多人实时协作
- 文档列表管理与版本历史
- 聊天记录持久化
- 模板系统
- Docker 容器化部署

## 整体架构

系统由 3 个服务 + 1 个外部存储组成：

```
┌─────────────────────────────────────────────────────────┐
│                    用户浏览器                              │
│  ┌──────────────────────────┐  ┌──────────────────────┐  │
│  │   SuperDoc 编辑器 (React)  │  │    Chat 面板          │  │
│  │   Yjs Provider ←─────────┼──┼──→ WebSocket         │  │
│  └──────────────────────────┘  └──────────────────────┘  │
└──────────────┬──────────────────────────┬────────────────┘
               │ WebSocket (Yjs sync)     │ WebSocket (chat)
               ▼                          ▼
┌──────────────────────────┐   ┌──────────────────────────┐
│  Yjs Collaboration Server │   │   FastAPI Backend        │
│  (Node.js)                │   │   (Python)               │
│                           │   │                          │
│  - 文档 Yjs 状态管理        │   │  - AI Agent 编排 (LiteLLM)│
│  - WebSocket 端点          │◄──┤  - Python SDK 接入协作会话  │
│  - 文档加载/保存到 MinIO     │   │  - 聊天记录管理            │
│                           │   │  - 文件上传/新建            │
└──────────────┬────────────┘   └──────────────┬───────────┘
               │                               │
               ▼                               ▼
         ┌──────────────────────────────────────────┐
         │              MinIO (已部署)                │
         │   - docpilot-documents bucket             │
         └──────────────────────────────────────────┘
```

## 三个服务的职责

| 服务 | 技术 | 端口 | 职责 |
|------|------|------|------|
| Frontend | React + Vite + SuperDoc | 5173 | 文档编辑器渲染、Chat UI、用户交互 |
| Yjs Server | Node.js + @superdoc-dev/superdoc-yjs-collaboration | 3050 | Yjs 文档状态管理、WebSocket 同步、MinIO 读写 |
| Backend | FastAPI + Python | 8000 | AI agent loop、LiteLLM 调用、Python SDK 文档操作、文件管理 API |

## 核心数据流：AI 编辑文档

1. 用户在 Chat 面板输入自然语言指令
2. Frontend 通过 WebSocket 发送消息到 FastAPI
3. FastAPI 调用 LiteLLM，携带 superdoc tool definitions
4. LLM 返回 tool calls（如 `query_match` + `apply_mutations`）
5. FastAPI 通过 Python SDK 连接到 Yjs 协作会话，执行 tool calls
6. Yjs CRDT 自动将变更同步到 Frontend 编辑器
7. 用户实时看到文档变化（tracked changes 或直接生效）
8. 工具执行结果回传 LLM，继续 agentic loop 直到完成
9. FastAPI 将最终回复通过 WebSocket 推送到 Chat 面板

## 架构决策记录

**为什么选择后端全驱动式（方案 B）：**

- Agentic loop 完全在后端闭环，逻辑集中，易于调试
- 前端关闭不影响 AI 操作执行
- 天然支持后续多人协作扩展（Yjs 已就位）
- 后端可做重型处理（长文档、复杂操作）

**文档引擎选择 superdoc 的原因：**

- 高保真 .docx 导入/导出，保留复杂格式
- 内置 AI Agent 支持（LLM tools、Python SDK）
- 原生 Yjs 实时协作
- 支持 tracked changes（建议模式）
