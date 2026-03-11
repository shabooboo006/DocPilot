# Yjs 协作服务设计

## 服务结构

```
collab-server/
  package.json
  src/
    index.ts                 # 入口，Fastify + WebSocket
    storage.ts               # MinIO 存储适配器
    config.ts                # 配置管理
```

## 核心实现

使用 `@superdoc-dev/superdoc-yjs-collaboration` 官方包：

```typescript
const collaboration = new CollaborationBuilder()
  .withName('DocPilot Collaboration')
  .withDebounce(2000)                    // 2秒防抖自动保存
  .onLoad(async ({ documentId }) => {
    // 从 MinIO 加载 .docx 二进制
    const docx = await minio.getObject('docpilot-documents',
      `documents/${documentId}/current.docx`);
    return docx;
  })
  .onAutoSave(async ({ documentId, document }) => {
    // 自动保存到 MinIO
    await minio.putObject('docpilot-documents',
      `documents/${documentId}/current.docx`, document);
  })
  .build();

// WebSocket 端点
fastify.register(async (app) => {
  app.get('/doc/:documentId', { websocket: true }, (socket, request) => {
    collaboration.welcome(socket, request);
  });
});
```

## 三方连接同一个 Yjs 房间

```
                    Yjs Collaboration Server
                    (ws://localhost:3050)
                         /doc/{id}
                        ╱         ╲
                       ╱           ╲
            WebSocket ╱             ╲ WebSocket (collabUrl)
                     ╱               ╲
        ┌───────────────┐    ┌──────────────────┐
        │  前端 SuperDoc   │    │  后端 Python SDK   │
        │  Yjs Provider   │    │  加入协作会话       │
        │  (浏览器)        │    │  (FastAPI)         │
        └───────────────┘    └──────────────────┘
```

- **前端**：SuperDoc 编辑器通过 y-websocket Provider 连接
- **后端**：Python SDK 通过 `collabUrl` + `collabDocumentId` 参数加入同一房间
- **效果**：后端 Python SDK 执行文档操作 → Yjs CRDT 自动同步 → 前端编辑器实时显示变化

## 文档生命周期

```
用户上传/新建文档
    │
    ▼
MinIO 存储 original.docx + current.docx
    │
    ▼
前端打开文档 → Yjs Server onLoad() 从 MinIO 加载
    │
    ▼
前端编辑 / AI 编辑 → Yjs 实时同步
    │
    ▼
Yjs Server onAutoSave() → 防抖写回 MinIO (current.docx)
    │
    ▼
用户点击下载 → FastAPI 从 MinIO 读取 current.docx 返回
```

## 配置

| 配置项 | 值 |
|--------|-----|
| WebSocket 端口 | 3050 |
| MinIO endpoint | 从环境变量读取 |
| 防抖间隔 | 2000ms |
| 文档 bucket | docpilot-documents |

## 依赖

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
