import json
import logging
import litellm
from fastapi import WebSocket
from app.config import settings
from app.services.superdoc_service import superdoc_service

logger = logging.getLogger(__name__)

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

MAX_TOOL_ROUNDS = 10


async def run_agent_loop(
    document_id: str,
    user_message: str,
    chat_history: list[dict],
    ws: WebSocket,
    suggest: bool = True,
) -> None:
    session = await superdoc_service.get_session(document_id, suggest=suggest)
    tools = superdoc_service.get_tools(session)

    messages: list[dict] = [{"role": "system", "content": SYSTEM_PROMPT}]
    messages.extend(chat_history)
    messages.append({"role": "user", "content": user_message})

    litellm_kwargs: dict = {
        "model": settings.litellm_model,
        "messages": messages,
        "api_key": settings.litellm_api_key or None,
    }
    if settings.litellm_api_base:
        litellm_kwargs["api_base"] = settings.litellm_api_base
    if tools:
        litellm_kwargs["tools"] = tools

    for _ in range(MAX_TOOL_ROUNDS):
        try:
            response = await litellm.acompletion(**litellm_kwargs)
        except Exception as e:
            logger.error(f"LiteLLM error: {e}")
            await ws.send_json({"type": "error", "message": f"LLM 调用失败: {str(e)}"})
            return

        choice = response.choices[0]
        tool_calls = getattr(choice.message, "tool_calls", None)

        if not tool_calls:
            content = choice.message.content or ""
            await ws.send_json({
                "type": "ai_message",
                "content": content,
                "streaming": False,
            })
            return

        # Append assistant message with tool calls
        messages.append(choice.message.model_dump(exclude_none=True))
        litellm_kwargs["messages"] = messages

        for tool_call in tool_calls:
            tool_name = tool_call.function.name

            await ws.send_json({
                "type": "tool_call",
                "tool": tool_name,
                "status": "executing",
                "description": f"正在执行 {tool_name}...",
            })

            try:
                result = superdoc_service.dispatch_tool(session, tool_call)
                result_str = json.dumps(result) if isinstance(result, (dict, list)) else str(result)
                await ws.send_json({
                    "type": "tool_result",
                    "tool": tool_name,
                    "status": "success",
                    "result": result if isinstance(result, (dict, list)) else {"value": result_str},
                })
            except Exception as e:
                result_str = f"Error: {str(e)}"
                await ws.send_json({
                    "type": "tool_result",
                    "tool": tool_name,
                    "status": "error",
                    "result": {"error": str(e)},
                })

            messages.append({
                "role": "tool",
                "tool_call_id": tool_call.id,
                "content": result_str,
            })

    await ws.send_json({
        "type": "ai_message",
        "content": "操作步骤过多，已停止。请尝试更简单的指令。",
        "streaming": False,
    })
