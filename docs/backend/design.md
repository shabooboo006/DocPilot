# 后端架构与 API 设计

## 服务结构

```text
backend/
└── app/
    ├── main.py                     # FastAPI 入口、CORS、lifespan
    ├── config.py                   # Settings
    ├── models/
    │   └── schemas.py              # REST / WS 相关 schema
    ├── routers/
    │   ├── documents.py            # 文档与聊天附件 REST API
    │   ├── chat.py                 # Chat WebSocket
    │   └── tender_analysis.py      # 招标分析 REST API
    └── services/
        ├── agent_service.py        # LiteLLM runtime + Plan Mode
        ├── document_service.py     # MinIO 文档/附件/分析快照
        ├── realtime_service.py     # document 维度 WS 广播
        ├── superdoc_service.py     # collab-server executor HTTP client
        ├── tender_analysis_service.py
        └── tender_analysis_crew.py
```

## FastAPI 启动职责

`main.py` 当前负责：

- 在 lifespan 中确保 MinIO bucket 存在
- 配置 CORS，默认允许 `http://localhost:6173`
- 注册 `documents`、`chat`、`tender_analysis` 三组 router
- 暴露 `/health`

## REST API

### 文档与附件

```text
POST   /api/documents/upload
POST   /api/documents/create
GET    /api/documents/{document_id}/info
GET    /api/documents/{document_id}/download
PUT    /api/documents/{document_id}/content
POST   /api/documents/{document_id}/chat-assets
DELETE /api/documents/{document_id}/chat-assets/{asset_id}
DELETE /api/documents/{document_id}
```

说明：

- `document_id` 由 backend 生成，格式为 12 位 hex
- 上传附件只接受 `png/jpeg/webp/gif`
- 聊天附件会生成原图和 JPEG 预览图，供 LLM 多模态输入使用

### 招标分析

```text
POST   /api/documents/{document_id}/tender-analysis/extract
GET    /api/documents/{document_id}/tender-analysis
GET    /api/documents/{document_id}/tender-analysis/status
PATCH  /api/documents/{document_id}/tender-analysis/fields
PATCH  /api/documents/{document_id}/tender-analysis/snapshot
PATCH  /api/documents/{document_id}/tender-analysis/timeline/{node_id}
POST   /api/documents/{document_id}/tender-analysis/timeline/{node_id}/confirm
GET    /api/documents/{document_id}/tender-analysis/evidence
GET    /api/documents/{document_id}/tender-analysis/timeline/conflicts
POST   /api/documents/{document_id}/tender-analysis/timeline/{node_id}/todos
```

这些接口的职责分为两类：

- 任务型：启动提取、查询 run 状态
- 快照型：修订字段、修订时间线、查看证据、生成 deadline todo

## Chat WebSocket

```text
WS /ws/chat/{document_id}
```

### 前端发给后端的消息

```jsonc
{ "type": "user_message", "content": "把标题改正式一点", "suggest": true }
{ "type": "user_message", "content": "把这张图插到技术方案部分后面", "attachments": [...] }
{ "type": "user_message", "content": "先给我一个执行计划", "plan_mode": true }
{ "type": "agent_plan_decision", "decision": "yes" }
{ "type": "agent_plan_feedback", "content": "保留原有一级标题，不要重排结构" }
{ "type": "set_suggest_mode", "suggest": false }
```

### 后端广播给前端的主要事件

```jsonc
{ "type": "tool_call", "tool": "replace_text", "status": "executing" }
{ "type": "tool_result", "tool": "replace_text", "status": "success", "reload_required": true }
{ "type": "agent_phase", "phase": "inspect" }
{ "type": "agent_plan", "title": "执行计划", "status": "awaiting_decision" }
{ "type": "agent_plan_decision_required", "title": "执行计划" }
{ "type": "agent_task", "task_id": "task-1", "title": "分析表格结构" }
{ "type": "agent_summary", "summary": "已完成结构调整并补充说明" }
{ "type": "ai_message", "content": "已修改完成", "streaming": false }
{ "type": "tender_analysis_run", "run": {...} }
{ "type": "tender_analysis_step_event", "run_id": "...", "step_id": "...", "event": {...} }
{ "type": "tender_analysis_run_complete", "run": {...} }
{ "type": "error", "message": "LLM 调用失败" }
```

## `document_service.py`

当前 backend 存储职责不只文档 CRUD，还包括：

- 创建和读取 `documents/{document_id}/original.docx`
- 维护 `documents/{document_id}/current.docx`
- 保存 `documents/{document_id}/meta.json`
- 保存聊天图片附件：
  - `documents/{document_id}/chat-assets/{asset_id}/original.xxx`
  - `documents/{document_id}/chat-assets/{asset_id}/preview.jpg`
  - `documents/{document_id}/chat-assets/{asset_id}/meta.json`
- 保存招标分析快照：
  - `documents/{document_id}/analysis/latest.json`
  - `documents/{document_id}/analysis/jobs/{job_id}.json`

### 附件处理逻辑

- 使用 Pillow 校验图片内容
- 自动生成最大边长 1440 的 JPEG 预览图
- 前端本地 `previewUrl` 仅用于 UI 预览
- 真正发给 LLM 的图片内容由 backend 把 MinIO 预览图转成 data URL 嵌入多模态消息

## `superdoc_service.py`

这里不是旧文档里说的 Python SDK 封装，而是一个 executor client：

- `get_tools()` 调用 `GET {SUPERDOC_EXECUTOR_URL}/agent/tools`
- `dispatch_tool()` 调用 `POST {SUPERDOC_EXECUTOR_URL}/agent/dispatch`
- 会根据当前会话的 `suggest` 状态映射 `editing / suggesting`
- 仅在内存中保存 `document_id -> DocumentSession`

## `agent_service.py`

这是当前 backend 最核心的运行时模块。

### executor 工具之外的内部工具

Agent 还可以调用四个内部 runtime 工具：

- `agent_update_todo`
- `agent_write_scratchpad`
- `agent_spawn_subtask`
- `agent_finish_plan`

### 运行特性

- Plan Mode：只允许读取类工具，必须以 `agent_finish_plan` 结束
- Approved plan execution：用户确认计划后进入执行态，减少重复确认
- Attachment-aware：把图片附件作为多模态消息发给模型，并在插图工具前解析真实 `asset_id`
- Duplicate guard：重复相同工具调用达到阈值会停止，避免死循环
- Structured recovery：根据 `error_code`、`error_details` 和 `next_step_guidance` 让模型自修参数
- Anchor resolution：插图锚点候选超过一个时，暂停并要求用户明确选择
- Read-only enforcement：招标分析模式下禁止任何文档写入工具

### 错误恢复

Agent runtime 当前区分：

- 可恢复错误：继续读文档、补参数、重试其它工具
- 强停止错误：多候选歧义、唯一标题冲突、目标不存在
- 相同签名失败过多：阻止继续重试

## `tender_analysis_service.py`

招标分析服务会：

1. 先通过 executor 读取 `get_document_outline` 和 `get_document_markdown`
2. 创建 `AnalysisRunState`
3. 顺序执行五个阶段：
   - `inventory`
   - `core_facts`
   - `timeline`
   - `requirements`
   - `risk_review`
4. 每个阶段更新 `AnalysisStepState`
5. 通过 `realtime_service.broadcast()` 把 run / step / event 推送给当前文档的所有 WS 连接
6. 合并阶段结果为 snapshot，并构建 `evidence_index`
7. 持久化最新快照与 job 文件

### snapshot 数据重点

当前 snapshot 至少覆盖：

- `project_overview`
- `lots`
- `timeline.nodes`
- `contacts`
- `commercial_terms`
- `qualification_requirements`
- `technical_scope`
- `submission_requirements`
- `evaluation_criteria`
- `compliance_flags`
- `risk_register`
- `open_questions`
- `deadline_todos`
- `evidence_index`

### 用户修订能力

后端允许对提取结果做二次修订：

- `patch_field()`：适合 `TenderField` 包装字段，状态会变成 `user_edited`
- `patch_snapshot_value()`：直接覆盖任意 snapshot path
- `patch_timeline_node()`：修订时间节点
- `confirm_timeline_node()`：把节点状态设为 `confirmed`
- `create_deadline_todo()`：从时间节点派生待办

## 依赖

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
