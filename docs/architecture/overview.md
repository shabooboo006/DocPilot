# 整体架构与需求总结

## 产品定位

DocPilot 是一个 AI 驱动的 Word `.docx` 工作台。左侧是可编辑或只读查看的文档区，右侧既能承载文档 Agent，也能承载招标驾驶舱。它不是 HTML 富文本系统，而是围绕真实 Word 文档、结构化工具调用和证据回溯构建。

## 当前能力面

| 维度 | 当前实现 |
|------|----------|
| 文档管理 | 上传 `.docx`、新建空白文档、下载当前文档、删除文档 |
| 编辑方式 | 手动编辑 + AI 修改 |
| AI 写入模式 | 建议模式（tracked changes）/ 直接编辑 |
| Agent 运行形态 | LiteLLM agentic loop + executor tools + 内部 runtime tools |
| 多模态输入 | 聊天支持上传或粘贴图片附件 |
| 计划能力 | Plan Mode、计划确认、补充反馈后重生成计划 |
| 招标分析 | CrewAI 五阶段提取 + 过程流 + 固定驾驶舱 |
| 原文回看 | 证据抽屉 + 左侧编辑器定位与高亮 |
| 存储 | MinIO 保存文档、聊天图片附件、分析快照 |

## 当前不包含

- 用户认证与权限系统
- 多人在线协同编辑的完整产品体验
- 聊天历史持久化
- 文档版本历史 / 回滚
- 完整文档列表与搜索中心
- Docker 化部署流程

## 当前整体架构

系统仍然由前端、FastAPI、collab-server 和 MinIO 组成，但主链路与旧设计相比已有明显变化：

```text
┌───────────────────────────────────────────────────────────────────┐
│                             浏览器                                 │
│  ┌──────────────────────────────┐  ┌────────────────────────────┐ │
│  │  SuperDoc Editor / Viewer    │  │ Agent + Tender Cockpit    │ │
│  │  - 通过 HTTP 拉取 docx         │  │ - Chat WebSocket          │ │
│  │  - 本地挂载 SuperDoc           │  │ - Plan/Task/Tool 流       │ │
│  │  - 导出 docx 后回写 backend     │  │ - Tender run/step 流       │ │
│  └──────────────┬───────────────┘  └──────────────┬─────────────┘ │
└─────────────────┼──────────────────────────────────┼──────────────┘
                  │ HTTP / REST                      │ WebSocket
                  ▼                                  ▼
         ┌───────────────────────┐        ┌────────────────────────┐
         │ FastAPI Backend       │        │ realtime_service       │
         │ - 文档 CRUD            │        │ - 每 document 广播 WS   │
         │ - Agent loop           │        └───────────┬────────────┘
         │ - Tender analysis      │                    │
         │ - executor client      │                    │
         └──────────┬────────────┘                    │
                    │ HTTP                            │
                    ▼                                 │
         ┌──────────────────────────────┐             │
         │ collab-server / executor     │◄────────────┘
         │ - /agent/tools               │
         │ - /agent/dispatch            │
         │ - /doc/:documentId           │
         │ - SuperDoc headless mutate   │
         └──────────┬───────────────────┘
                    │
                    ▼
         ┌──────────────────────────────┐
         │ MinIO                        │
         │ - current.docx              │
         │ - original.docx             │
         │ - meta.json                 │
         │ - chat-assets/*             │
         │ - analysis/latest.json      │
         └──────────────────────────────┘
```

## 三个运行服务

| 服务 | 端口 | 作用 |
|------|------|------|
| Frontend | 6173 | 文档工作台 UI、编辑器挂载、聊天与驾驶舱 |
| Backend | 6800 | REST API、Chat WebSocket、Agent runtime、Tender analysis |
| collab-server | 6350 | Yjs 协作入口、SuperDoc executor、MinIO 读写 |

## 核心数据流

### 1. 文档编辑主链路

1. 用户上传或新建文档
2. FastAPI 写入 `documents/{document_id}/original.docx`、`current.docx`、`meta.json`
3. 前端通过 `GET /download` 拉取当前 docx
4. 浏览器本地挂载 SuperDoc
5. 用户编辑时触发 `export(docx)`，前端以防抖方式 `PUT /content`
6. backend 把最新 docx 覆盖回 `current.docx`

说明：

- 当前主编辑链路不是前端直接接 Yjs Provider
- `collab-server` 仍然保留 `/doc/:documentId` 和 Yjs 基础设施，为 executor 与后续协同能力服务

### 2. AI 编辑文档链路

1. 用户在右侧发送消息，可附带图片
2. 前端通过 `ws://localhost:6800/ws/chat/{document_id}` 发起一轮 agent turn
3. FastAPI `agent_service` 获取 executor tools，并附加内部工具
4. LiteLLM 返回工具调用
5. FastAPI 把工具调用转发到 `collab-server` 的 `/agent/dispatch`
6. `collab-server` 使用 SuperDoc headless editor 读取或修改 `current.docx`
7. 若文档发生变化，tool result 会带上 `reload_required`
8. 前端收到后递增 `editorRefreshKey`，重新拉取最新 docx 并重挂编辑器
9. 最终 AI 回复、任务摘要、计划状态继续通过 WebSocket 返回

### 3. 招标分析链路

1. 用户点击工具栏“招标分析”
2. 前端切换为分析只读模式，并调用 `POST /tender-analysis/extract`
3. backend 从 executor 读取 `get_document_outline` 与 `get_document_markdown`
4. backend 内嵌的 CrewAI 团队顺序执行五个阶段：
   - `inventory`
   - `core_facts`
   - `timeline`
   - `requirements`
   - `risk_review`
5. 每个阶段的 run / step / event 通过同一个聊天 WebSocket 广播到前端
6. 结果汇总为 snapshot，持久化到 MinIO 的 `analysis/latest.json`
7. 前端自动切到“招标驾驶舱”，加载固定数据面板
8. 用户可修订字段、时间线、风险状态，并通过证据抽屉回看原文

## 当前关键设计决策

### 为什么引入 executor HTTP 层

- FastAPI 不直接操纵浏览器编辑器实例
- SuperDoc 文档工具集中在 `collab-server`，后端只负责调度和恢复逻辑
- 便于把工具 catalog 与真正文档变更逻辑放在同一处维护

### 为什么编辑器仍采用“下载-挂载-导出-回写”

- 当前链路更直接，前端实现成本低
- AI 修改完成后可以通过简单的重新加载看到最新结果
- 保留 Yjs / collaboration 基础设施，但不强依赖它作为浏览器主编辑通道

### 为什么招标分析单独进入只读模式

- 驾驶舱强调“阅读、提取、校对、证据回看”，不是正文写作
- analysis 模式下 Agent 被限制为只读工具，避免把分析问答误变成文档写入
- 证据定位需要稳定的原文查看体验

## 当前已知限制

- 聊天历史仍只存内存，断线或重启会丢失
- 文档编辑与 AI 修改之间采用“工具成功后刷新编辑器”而非实时增量合并
- 招标分析快照可修订，但这些修订不会自动反写回原始 `.docx`
- collab-server 虽有 `/doc/:documentId`，但前端当前没有直接启用该协作主链路
