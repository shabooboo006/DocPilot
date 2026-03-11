# 后端架构与 API 设计

## 服务结构

```
backend/
  app/
    main.py                  # FastAPI 入口，WebSocket 端点
    config.py                # 配置管理（MinIO、LiteLLM 等）
    routers/
      documents.py           # 文档管理 REST API
      chat.py                # Chat WebSocket 端点
    services/
      document_service.py    # 文档 CRUD，与 MinIO 交互
      agent_service.py       # AI Agent 编排，agentic loop
      superdoc_service.py    # Python SDK 封装，连接 Yjs 协作会话
    models/
      schemas.py             # Pydantic 请求/响应模型
```

## REST API 端点

```
POST   /api/documents/upload      # 上传 .docx → MinIO，返回 document_id
POST   /api/documents/create      # 新建空白文档 → MinIO，返回 document_id
GET    /api/documents/{id}/info   # 获取文档元信息
GET    /api/documents/{id}/download  # 从 MinIO 下载 .docx
DELETE /api/documents/{id}        # 删除文档
```

## WebSocket 端点

```
WS /ws/chat/{document_id}
```

### 消息协议（JSON）

```jsonc
// 用户 → 后端：发送消息
{ "type": "user_message", "content": "把标题改成加粗" }

// 后端 → 前端：AI 文本回复（流式）
{ "type": "ai_message", "content": "好的，正在修改...", "streaming": true }

// 后端 → 前端：AI 工具调用状态
{ "type": "tool_call", "tool": "apply_mutations", "status": "executing", "description": "正在修改标题格式" }

// 后端 → 前端：AI 工具调用完成
{ "type": "tool_result", "tool": "apply_mutations", "status": "success", "result": {...} }

// 后端 → 前端：AI 回复完成
{ "type": "ai_message", "content": "已将标题改为加粗。", "streaming": false }

// 后端 → 前端：错误
{ "type": "error", "message": "LLM 调用失败，请重试" }
```

## MinIO 交互

```python
# document_service.py
# 使用 boto3 S3 兼容 API
bucket = "docpilot-documents"

async def upload_document(file) -> str:
    document_id = generate_id()
    key = f"documents/{document_id}/original.docx"
    s3_client.upload_fileobj(file, bucket, key)
    return document_id

async def download_document(document_id: str) -> bytes:
    key = f"documents/{document_id}/current.docx"
    return s3_client.get_object(bucket, key)["Body"].read()
```

## 依赖

```toml
# pyproject.toml
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
