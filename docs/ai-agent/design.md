# AI Agent 与 SuperDoc 集成

## 当前集成方式

当前仓库里的 Agent 并不是通过 Python SuperDoc SDK 直接打开协作会话，而是：

- backend `agent_service.py` 负责 LiteLLM agentic loop
- backend `superdoc_service.py` 只负责调用 executor HTTP API
- `collab-server` 的 `executor.ts` 维护当前文档工具 catalog，并用 SuperDoc headless editor 真正执行读写

也就是说，FastAPI 这层是“Agent 调度器”，文档能力在 executor。

## Agent 工具来源

工具由：

```text
GET http://localhost:6350/agent/tools?mode=suggesting|editing&provider=openai
```

返回 OpenAI function calling 兼容格式。

当前 executor 已暴露的工具覆盖：

### 读取与定位

- `get_document_text`
- `get_document_markdown`
- `get_document_outline`
- `list_style_inventory`
- `inspect_segment_formatting`
- `get_formatting_capabilities`
- `find_text_context`
- `query_match`
- `preview_mutations`
- `find_insertion_anchor`
- `list_caption_conventions`
- `get_table_details`
- `list_comments`
- `list_tracked_changes`
- `list_hyperlinks`

### 文档修改

- `set_document_title`
- `replace_text`
- `replace_section_content`
- `insert_paragraph_relative`
- `insert_heading_relative`
- `insert_section_relative`
- `append_paragraph`
- `apply_mutations`

### 图片与表格

- `insert_image_at_anchor`
- `create_table_relative`
- `create_table_at_anchor`
- `set_table_cell_text`
- `update_table_cells`

### 批注、修订、链接、格式

- `add_comment_on_text`
- `reply_to_comment`
- `resolve_comment`
- `decide_tracked_change`
- `wrap_text_with_link`
- `apply_formatting`
- `normalize_heading_hierarchy`

## Agent 内部工具

除了 executor tools，backend 还额外向模型暴露四个 runtime-only 工具：

- `agent_update_todo`
- `agent_write_scratchpad`
- `agent_spawn_subtask`
- `agent_finish_plan`

这些工具不改文档，主要用来支撑复杂任务管理。

## System Prompt 的当前重点

当前 system prompt 已围绕 Word 结构化文档和工具恢复策略重写，核心约束包括：

- 涉及正文修改前，先读文档或大纲
- 精确改写前，先用 `find_text_context`
- 工具失败后先看 `error_code` / `model_guidance` / `next_step_guidance`
- 只在真实歧义时追问用户
- 图片附件不默认插入文档，先判断是素材图还是参考图
- Plan Mode 下必须以 `agent_finish_plan` 收尾

## 当前 Agentic Loop

```text
用户消息
  ↓
FastAPI 组装 system prompt + chat history + 附件多模态内容
  ↓
从 collab-server 读取 executor tools
  ↓
附加内部 tools
  ↓
LiteLLM acompletion(...)
  ↓
若无 tool call:
  - 普通模式：直接回复
  - Plan Mode：把文本包装成待确认计划
  ↓
若有 tool call:
  - 向前端发送 tool_call 事件
  - 内部工具由 backend 直接执行
  - 文档工具经 superdoc_service 转发到 collab-server
  - 结果整理后回写 messages
  - 必要时触发重试、停止或用户澄清
```

## Plan Mode

### 入口

- 用户显式请求“先出方案”
- 或前端勾选 `Plan Mode`

### 约束

- 严禁调用写入类文档工具
- 只允许读取文档、拆解步骤、形成计划
- 最终必须调用 `agent_finish_plan`

### 用户确认流

1. Agent 产出计划
2. 前端展示计划卡片
3. 用户：
   - 选 `yes`：进入已确认执行态
   - 选 `no`：进入收集补充反馈态
4. Agent 根据补充信息重新生成计划或开始执行

## 子任务机制

`agent_spawn_subtask` 会启动一个只读分析子代理。

子代理特征：

- 只能使用 plan/read-only 白名单工具
- 最多执行有限轮数
- 返回简洁摘要给主代理
- 不直接修改文档

适用场景：

- 长文档结构梳理
- 多章节信息对比
- 表格 / 时间线 / 样式的只读分析

## 图片附件与插图流程

当前多模态流程是 Agent 的新重点。

### 附件进入模型的方法

1. 前端上传图片到 backend
2. backend 把预览图读成 data URL
3. 组装为 OpenAI 多模态消息：
   - 一段文字说明
   - 一张或多张 `image_url`

### 插图执行策略

- 若用户只是在“参考这张图的样式”，不应直接插入
- 若要插图，Agent 应先：
  - 查正文结构
  - 定位插图锚点
  - 必要时了解 caption 约定
  - 再调用 `insert_image_at_anchor`

### 锚点歧义

若 `find_insertion_anchor` 返回多个候选位置：

- backend 会把候选位置回传前端
- AI 立即停止写入并生成澄清消息
- 用户回复“第一个 / 第二个 / 某章节附近文字”
- `chat.py` 会把这次回复改写为带 `anchor_id` 的 continuation prompt

## 建议模式 / 直接编辑

FastAPI 侧只维护会话模式：

```text
suggest=True  -> mode=suggesting
suggest=False -> mode=editing
```

真正的写入语义由 collab-server executor 按模式执行。

在前端：

- 建议模式显示修订按钮
- 直接编辑模式隐藏修订操作
- 招标分析只读模式下禁止切换

## 错误恢复策略

当前恢复逻辑比旧文档更细：

### 结构化错误

executor 会返回结构化错误码，例如：

- `ambiguous_match`
- `title_not_unique`
- `target_not_found`
- `invalid_target_state`
- `missing_target_text_for_inline_formatting`
- `segment_has_single_text_candidate`
- `single_candidate_context_mismatch`

backend 会根据这些信息决定：

- 继续让模型自修
- 构造重试工具调用
- 或直接要求用户澄清

### 重试与停止保护

- 同一工具签名失败过多会被阻断
- 完全重复的工具调用达到阈值会停止
- Plan Mode / analysis read-only 下写入工具会被直接拒绝

## 招标分析只读模式

当用户进入招标分析模式时，Agent 的 system prompt 会改成只读语义：

- 允许：总结、解释、定位原文、回答问题
- 禁止：改正文、插图、改表、批注、写入 tracked changes

这保证驾驶舱问答不会误伤原始文档。
