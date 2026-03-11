# AI Agent 与 SuperDoc 集成

## Python SDK 连接协作会话

```python
from superdoc import SuperDoc

class SuperDocService:
    def __init__(self):
        self.sessions = {}  # document_id → SDK session

    async def get_session(self, document_id: str, suggest: bool = True):
        if document_id not in self.sessions:
            sd = SuperDoc()
            await sd.doc.open(
                collabUrl="ws://localhost:3050",
                collabDocumentId=document_id,
                defaultChangeMode="tracked" if suggest else "default",
                user={"name": "DocPilot AI", "email": "ai@docpilot.local"}
            )
            self.sessions[document_id] = sd
        return self.sessions[document_id]

    async def close_session(self, document_id: str):
        if document_id in self.sessions:
            await self.sessions[document_id].doc.close()
            del self.sessions[document_id]
```

## LLM Tool Definitions 获取

Python SDK 提供 tool catalog，直接适配 OpenAI 格式：

```python
async def get_tool_definitions(self, session, mode="essential"):
    # essential 模式：5 个核心工具 + discover_tools 元工具
    # 让 LLM 按需发现更多工具组
    tools = session.choose_tools(
        provider="openai",
        mode=mode  # "essential" | "all"
    )
    return tools
```

## Agentic Loop 详细流程

```python
async def run_agent_loop(document_id: str, user_message: str, ws: WebSocket):
    # 1. 获取 superdoc 会话（Python SDK 连接到 Yjs 协作）
    doc_session = superdoc_service.get_session(document_id)

    # 2. 构建 tool definitions（从 Python SDK 获取）
    tools = doc_session.choose_tools(provider="openai")

    # 3. 构建消息上下文
    messages = build_messages(user_message, chat_history)

    # 4. Agentic loop
    while True:
        # 调用 LiteLLM
        response = await litellm.acompletion(
            model=config.model,
            messages=messages,
            tools=tools
        )

        # 如果是纯文本回复，流式推送并结束
        if no_tool_calls(response):
            await ws.send_json({"type": "ai_message", ...})
            break

        # 如果有 tool calls，逐个执行
        for tool_call in response.tool_calls:
            await ws.send_json({"type": "tool_call", "status": "executing", ...})
            result = doc_session.dispatch_tool(tool_call)
            await ws.send_json({"type": "tool_result", ...})
            messages.append(tool_result_message(result))

        # 结果回传 LLM 继续推理
```

## 示例：AI 执行多步操作

```
用户消息: "添加一个三行两列的表格，第一行是表头"
    │
    ▼
┌─────────────────────────────────────────────┐
│ Round 1: LLM 分析意图                         │
│ → tool_call: discover_tools(group="tables")  │
│ → 结果: 返回 tables 组全部工具定义               │
├─────────────────────────────────────────────┤
│ Round 2: LLM 执行操作                         │
│ → tool_call: create_table(rows=3, cols=2)    │
│ → 结果: 表格已创建，返回 nodeId                 │
├─────────────────────────────────────────────┤
│ Round 3: LLM 填充内容                         │
│ → tool_call: apply_mutations(...)            │
│   填入表头文字                                 │
│ → 结果: 成功                                  │
├─────────────────────────────────────────────┤
│ Round 4: LLM 判断任务完成                      │
│ → 纯文本回复: "已创建表格并填入表头"              │
│ → 结束 loop                                  │
└─────────────────────────────────────────────┘
```

## 建议模式 / 直接生效切换

```python
# 用户通过 WebSocket 切换模式
# { "type": "set_suggest_mode", "suggest": true/false }

async def handle_mode_switch(self, document_id: str, suggest: bool):
    session = self.sessions.get(document_id)
    if session:
        # 关闭旧会话，以新模式重新连接
        await self.close_session(document_id)
        await self.get_session(document_id, suggest=suggest)
```

## 错误处理策略

```
Tool 执行失败（如 MATCH_NOT_FOUND）
    │
    ▼
将错误信息回传 LLM → LLM 自行修正（superdoc 设计如此）
    │
    ▼
最多重试 3 轮，仍失败则通知用户
    │
    ▼
LLM 调用超时/网络错误 → 直接通知用户，不重试
```

## System Prompt

```python
SYSTEM_PROMPT = """你是 DocPilot AI 文档助手。用户会要求你编辑当前打开的 .docx 文档。

你的能力：
- 查找和修改文档内容（文字、格式、结构）
- 创建表格、列表、标题、分节等结构元素
- 插入图片、链接、目录
- 管理批注和修订标记
- 调整页面布局、页眉页脚

工作原则：
- 先用 get_document_text 了解文档当前内容，再执行修改
- 批量修改时合并到单次 apply_mutations 调用（减少 tool call 次数）
- 修改完成后简要告知用户做了什么
- 如果用户意图不明确，先询问而不是猜测
"""
```
