# Yjs 协作服务与 Executor 设计

## 服务结构

```text
collab-server/
├── src/
│   ├── index.ts        # Fastify 入口，同时暴露 WS 和 HTTP executor
│   ├── executor.ts     # SuperDoc headless editor 工具执行层
│   ├── storage.ts      # MinIO 文档/附件读取
│   └── config.ts       # .env 配置解析
└── package.json
```

## 当前职责

`collab-server` 现在同时承担两类职责：

### 1. Yjs 协作入口

- 暴露 `GET /doc/:documentId` WebSocket
- 基于 `@superdoc-dev/superdoc-yjs-collaboration`
- 能从 MinIO 加载文档状态，并在自动保存时回写

### 2. SuperDoc executor

- 暴露 `GET /agent/tools`
- 暴露 `POST /agent/dispatch`
- 用 headless `superdoc/super-editor` 读取或修改 Word 文档
- 作为 FastAPI Agent 的文档能力执行层

## 当前公开接口

```text
GET  /health
GET  /agent/tools
POST /agent/dispatch
WS   /doc/:documentId
```

## `index.ts` 的当前流程

### Yjs 部分

```ts
const collaboration = new CollaborationBuilder()
  .withName('DocPilot Collaboration')
  .withDebounce(2000)
  .onLoad(async ({ documentId }) => {
    const buffer = await loadDocument(documentId);
    return buffer ? new Uint8Array(buffer) : null;
  })
  .onAutoSave(async ({ documentId, document }) => {
    const state = encodeStateAsUpdate(document);
    await saveDocument(documentId, Buffer.from(state));
  })
  .build();
```

### executor 部分

- `/agent/tools` 会根据 `mode=editing|suggesting` 返回工具 catalog
- `/agent/dispatch` 校验 `documentId`、`mode`、`toolCall.function.name`
- 执行成功后返回：
  - `result`
  - `documentMutated`
  - `reloadRequired`
  - `trackedChangesSummary`
  - 可选的错误 / 候选 / 锚点信息

## executor 的当前实现

`executor.ts` 是现在最关键的文件，职责包括：

- 维护完整的 OpenAI tool definition 列表
- 打开只读编辑器或可写编辑器
- 解析 Word 结构化快照
- 根据工具参数完成精确替换、格式调整、表格修改、图片插入
- 在 suggesting 模式下返回 tracked changes 摘要

### 编辑器打开模式

- `openReadEditor(source)`：只读分析
- `openMutationEditor(source, mode)`：执行写入

### 当前工具能力分类

- 文档读取：text / markdown / outline / style inventory / hyperlinks / comments / tracked changes
- 精确定位：`find_text_context`、`query_match`
- 结构性变更：`apply_mutations`、段落/标题/章节插入与替换
- 表格：创建表格、改单元格、批量更新单元格
- 图片：锚点搜索、标题约定读取、插图
- 格式：字符级、段落级、列表级格式能力与实际应用
- 批注与修订：添加批注、回复、解决、接受/拒绝修订

## MinIO 存储

`storage.ts` 当前不仅服务 Yjs 文档，也服务图片插图能力。

### 文档

- `loadDocument(documentId)` -> `documents/{documentId}/current.docx`
- `saveDocument(documentId, data)` -> `documents/{documentId}/current.docx`

### 聊天附件

- `loadChatAsset(documentId, assetId, variant)`
- `loadChatAssetMeta(documentId, assetId)`

executor 插图时会读取：

- 附件原图
- 附件元数据
- 可选预览图

## 当前文档修改链路

```text
FastAPI agent_service
  ↓ POST /agent/dispatch
collab-server executor
  ↓ 读取 current.docx
  ↓ SuperDoc headless 执行工具
  ↓ 如果文档被修改则重新导出
  ↓ 覆盖写回 current.docx
  ↓ 返回 reloadRequired/documentMutated/trackedChangesSummary
FastAPI
  ↓ WebSocket 发给前端
前端重新拉取文档并重挂编辑器
```

## 当前与前端主链路的关系

需要明确一点：

- `collab-server` 仍然保留 Yjs `/doc/:documentId` 入口
- 但前端当前主编辑器没有直接用 y-websocket provider 挂载
- 当前产品的主要写入同步机制是“工具执行后刷新编辑器”与“浏览器导出回写 backend”

因此，`collab-server` 现在的现实角色更接近：

- 文档执行引擎
- 未来协作能力保留层

而不是当前浏览器编辑主通道。

## 配置

| 配置项 | 当前默认值 |
|--------|------------|
| 端口 | `6350` |
| bucket | `docpilot-documents` |
| Yjs auto-save debounce | `2000ms` |
| MinIO | 从 `.env` 读取 |

## 依赖

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
