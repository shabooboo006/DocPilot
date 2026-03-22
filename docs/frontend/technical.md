# 前端技术细节

## 技术栈

| 技术 | 用途 |
|------|------|
| React 19 | UI 框架 |
| Vite 7 | 开发与构建 |
| TypeScript 5 | 类型安全 |
| SuperDoc | `.docx` 编辑器 / 查看器 |
| Zustand 5 | 本地状态管理 |
| `@tambo-ai/react` | 可选的驾驶舱交互状态持久化 |
| Zod 4 | Tambo props/state schema |
| Tailwind CSS 4 | 样式 |

## 目录结构

```text
frontend/src/
├── App.tsx
├── main.tsx
├── components/
│   ├── layout/
│   ├── editor/
│   ├── chat/
│   └── analysis/
├── hooks/
│   ├── useDocumentStore.ts
│   ├── useChatStore.ts
│   ├── useAnalysisStore.ts
│   └── useWebSocket.ts
├── services/api.ts
└── types/index.ts
```

## 编辑器生命周期

当前编辑器不是旧文档里的 `y-websocket provider + ydoc` 挂载模式，而是：

1. 前端通过 `fetchDocumentBlob(documentId)` 下载 `current.docx`
2. 构造浏览器 `File`
3. 动态 `import('superdoc')`
4. 用本地文件初始化 SuperDoc
5. 监听 `onEditorUpdate`
6. 防抖导出 `docx`
7. 调用 `saveDocumentBlob(documentId, exportedBlob)`

`connectionStatus` 会在这个过程中经历：

- `loading`
- `ready`
- `saving`
- `error`

### `useSuperdoc` 当前负责的事

- 根据 `documentId` 挂载或销毁编辑器
- 切换 `editing / suggesting / viewing`
- 自动根据容器宽度调整 zoom
- 在 `analysisReadOnly` 下禁用写入保存
- 在工具执行后根据 `editorRefreshKey` 重新挂载
- 提供“采纳全部修订 / 拒绝全部修订”
- 处理证据定位请求，搜索、滚动并高亮目标段落

## 文档状态管理

### `useDocumentStore`

当前状态比旧版本多了分析和定位相关字段：

```ts
interface DocumentState {
  documentId: string | null;
  documentName: string;
  suggestMode: boolean;
  analysisReadOnly: boolean;
  connectionStatus: 'idle' | 'loading' | 'ready' | 'saving' | 'error';
  editorRefreshKey: number;
  pendingLocateRequest: EditorLocateRequest | null;
  locateStatus: 'idle' | 'locating' | 'found' | 'not_found';
  locateMessage: string;
}
```

关键动作：

- `setDocument()`：切换文档并触发编辑器重载
- `requestEditorRefresh()`：AI 修改后强制重新拉文档
- `requestEditorLocate()`：驾驶舱证据跳转到左侧原文
- `setAnalysisReadOnly()`：切到招标分析只读模式

### `useChatStore`

聊天状态当前也扩展为 agent runtime UI：

```ts
interface ChatState {
  messages: Message[];
  isAIThinking: boolean;
  planModeEnabled: boolean;
  currentPhase: AgentPhase;
  currentPlan: AgentPlan | null;
  activePlanMessageId: string | null;
  agentTasks: AgentTask[];
  agentSummary: string;
}
```

支持：

- 消息列表
- tool result 反向更新
- plan 卡片 upsert
- 子任务树状态同步
- 每轮运行时状态重置

### `useAnalysisStore`

独立管理招标分析视图：

```ts
interface AnalysisStoreState {
  activeTab: 'agent' | 'cockpit';
  analysisStatus: string;
  activeRunId: string | null;
  runsById: Record<string, AnalysisRun>;
  snapshot: TenderAnalysisSnapshot | null;
  timelineFilters: {...};
  timelineViewMode: 'timeline' | 'list' | 'calendar';
  autoScrollEnabled: boolean;
}
```

## Chat WebSocket

`useChatWebSocket(documentId)` 连接到：

```ts
const WS_BASE = 'ws://localhost:6800';
```

### 主要职责

- 发送用户消息、附件、模式状态
- 处理 `tool_call` / `tool_result`
- 处理 Plan Mode 事件
- 处理 Agent phase / task / summary
- 处理招标分析 run / step / event
- 在 `reload_required` 时刷新左侧编辑器

### 当前收到的事件类型

- `ai_message`
- `tool_call`
- `tool_result`
- `agent_phase`
- `agent_plan`
- `agent_plan_decision_required`
- `agent_task`
- `agent_summary`
- `tender_analysis_run`
- `tender_analysis_run_update`
- `tender_analysis_step`
- `tender_analysis_step_update`
- `tender_analysis_step_event`
- `tender_analysis_run_complete`
- `tender_analysis_run_failed`
- `error`

### 当前发送的控制消息

- 普通消息：`user_message`
- 切换模式：`set_suggest_mode`
- 计划确认：`agent_plan_decision`
- 计划反馈：`agent_plan_feedback`

## 图片附件链路

`ChatInput` 当前支持两种附件来源：

- 文件选择
- 剪贴板粘贴图片

处理流程：

1. 前端把图片传给 `uploadChatAsset(documentId, file)`
2. backend 返回 `asset_id / width / height / mime_type`
3. 前端把这些信息保存在消息附件中
4. 发送消息时只传元数据，不直接传二进制
5. backend 根据 `asset_id` 从 MinIO 取预览图，嵌入多模态消息

未发送前用户删除附件时，前端会 best-effort 调用 `deleteChatAsset`

## 招标驾驶舱实现

### `TenderDashboard`

当前 dashboard 不是静态展示，而是一个可回写 snapshot 的固定 UI。

加载逻辑：

1. 进入 cockpit 或切文档时调用 `getTenderAnalysis(documentId)`
2. 若已有 snapshot，则自动把左侧切到只读模式
3. 将 snapshot normalize 为各面板所需 view-model

回写逻辑：

- 字段类：`patchTenderField`
- 列表/表格类：`patchTenderSnapshotValue`
- 时间线节点：`patchTenderTimelineNode`
- 节点确认：`confirmTenderTimelineNode`
- 待办创建：`createTenderDeadlineTodo`

### 证据联动

`EvidenceDrawer -> requestEditorLocate -> useSuperdoc`

定位请求包含：

- `queryText`
- `fallbackText`
- `sectionPath`
- `evidenceTitle`

编辑器侧会尝试：

1. 搜索摘录文本
2. 回退到匹配文本
3. 再回退到章节路径
4. 找到后滚动、选区并加高亮

## Tambo 集成

`TamboAppProvider` 会在存在 `VITE_TAMBO_API_KEY` 时启用 `TamboProvider`，否则透明降级。

当前已有若干组件接入 `useTamboComponentState`：

- 时间线视图和筛选
- 风险严重度筛选
- 是否显示已解决问题
- 概况字段展开态
- 评分矩阵视图密度

## API 客户端

`services/api.ts` 当前封装三类接口：

- 文档与附件：上传、创建、下载、保存、图片附件上传/删除
- 招标分析任务：启动提取、获取状态
- 招标驾驶舱编辑：字段 patch、snapshot patch、时间线 patch、证据查询、todo 创建

常量默认值：

```ts
const API_BASE = 'http://localhost:6800';
const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
```

## 现状说明

- 前端依然安装了 `yjs` / `y-websocket`，但当前主编辑器实现没有直接接入 provider
- 编辑器刷新采用重新拉取 docx，而不是局部增量同步
- `getDocumentInfo()` 客户端封装目前未成为主链路依赖，实际编辑器主要依赖 `download` 接口
