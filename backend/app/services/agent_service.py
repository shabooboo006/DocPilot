import asyncio
import json
import logging
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Optional

import litellm
from fastapi import WebSocket

from app.config import settings
from app.services import document_service
from app.services.superdoc_service import superdoc_service

logger = logging.getLogger(__name__)

PLAN_ONLY_ALLOWED_TOOLS = {
    "get_document_text",
    "get_document_markdown",
    "get_document_outline",
    "list_style_inventory",
    "inspect_segment_formatting",
    "get_formatting_capabilities",
    "find_text_context",
    "query_match",
    "preview_mutations",
    "find_insertion_anchor",
    "list_caption_conventions",
    "get_table_details",
    "list_comments",
    "list_tracked_changes",
    "list_hyperlinks",
}
MUTATION_TOOL_NAMES = {
    "set_document_title",
    "insert_image_at_anchor",
    "replace_text",
    "replace_section_content",
    "insert_paragraph_relative",
    "insert_heading_relative",
    "insert_section_relative",
    "append_paragraph",
    "create_table_relative",
    "create_table_at_anchor",
    "set_table_cell_text",
    "update_table_cells",
    "apply_mutations",
    "add_comment_on_text",
    "reply_to_comment",
    "resolve_comment",
    "decide_tracked_change",
    "wrap_text_with_link",
    "apply_formatting",
    "normalize_heading_hierarchy",
}
STRUCTURED_STOP_ERROR_CODES = {"ambiguous_match", "title_not_unique", "target_not_found"}
STRUCTURED_RECOVERABLE_ERROR_CODES = {
    "invalid_target_state",
    "tool_forbidden_in_plan_mode",
    "missing_target_text_for_inline_formatting",
    "segment_has_single_text_candidate",
    "single_candidate_context_mismatch",
}
STRUCTURED_ERROR_CODES = STRUCTURED_STOP_ERROR_CODES | STRUCTURED_RECOVERABLE_ERROR_CODES
RETRYABLE_TOOL_ERROR_KINDS = {"rate_limited", "engine_overloaded", "transport_error"}
MAX_TOOL_ROUNDS = 24
DUPLICATE_TOOL_CALL_LIMIT = 3
MAX_TOOL_FAILURES_PER_SIGNATURE = 2
MAX_SUBTASKS_PER_TURN = 3


@dataclass
class TodoItem:
    title: str
    status: str


@dataclass
class AgentTaskRecord:
    task_id: str
    title: str
    status: str = "pending"
    summary: str = ""
    parent_task_id: Optional[str] = None
    agent_id: str = "main"


@dataclass
class PendingPlan:
    title: str
    summary: str
    content: str
    source_user_message: str
    attachments: list[dict[str, Any]] = field(default_factory=list)
    suggest: bool = True
    waiting_for_feedback: bool = False


@dataclass
class AgentRuntimeState:
    phase: str = "idle"
    todo_list: list[TodoItem] = field(default_factory=list)
    scratchpad: str = ""
    task_tree: dict[str, AgentTaskRecord] = field(default_factory=dict)
    pending_plan: Optional[PendingPlan] = None
    tool_error_history: dict[str, int] = field(default_factory=dict)
    tool_error_kinds: dict[str, int] = field(default_factory=dict)
    attachment_intents: dict[str, str] = field(default_factory=dict)
    plan_mode_state: str = "idle"
    execution_strategy: str = "normal_execution"


@dataclass
class AgentLoopResult:
    content: Optional[str]
    pending_anchor_candidates: list[dict[str, Any]] = field(default_factory=list)
    pending_user_message: Optional[str] = None
    pending_attachments: list[dict[str, Any]] = field(default_factory=list)
    plan_generated: bool = False


BASE_SYSTEM_PROMPT = """你是 DocPilot AI 文档助手。用户会要求你阅读和修改当前打开的 Word `.docx` 文档。

这是 Word `.docx` 文档，不是普通富文本。请始终把文档看成带有标题层级、表格、图片、批注、修订、超链接和格式语义的结构化文档。

全局规则：
- 只要涉及正文修改，先调用 get_document_text 或 get_document_outline 了解当前内容
- 精确正文修改前，必须先调用 find_text_context，确认 segment_id、前后文和位置
- 工具失败后先阅读 error_code、model_guidance、next_best_action，并优先自修参数或切换工具
- 只有真实多候选歧义、目标不存在或定位互相冲突时，才停止修改并向用户追问“具体是哪一处”
- 完成后简要说明你读取到了什么、修改了什么
- 不要重复调用完全相同的工具和参数
- 不要在修改成功后反复用 get_document_text 做验证
- 附件图片既可能是待插入素材，也可能是语义参考图或格式参考图，不要默认把每张图都插入文档

能力提示：
- 长文档或复杂任务时，优先用 agent_update_todo 维护任务清单
- 需要暂存分析结论时，使用 agent_write_scratchpad
- 需要把大任务拆成只读分析子任务时，使用 agent_spawn_subtask
- 如果用户要求先给方案或本轮开启 Plan Mode，必须用 agent_finish_plan 结束计划阶段
"""


def build_system_prompt(*, suggest: bool, plan_mode: bool) -> str:
    mode_prompt = (
        "当前文档处于建议模式，文档写入会生成 tracked changes / 修订。"
        if suggest
        else "当前文档处于直接编辑模式，文档写入会直接生效。"
    )
    if plan_mode:
        return f"""{BASE_SYSTEM_PROMPT}

{mode_prompt}

当前处于 Agent Plan Mode。你现在的任务是理解需求、读取文档、拆解步骤、整理 todo、必要时派生只读子任务，并生成一份可执行计划。

Plan Mode 约束：
- 严禁执行任何会修改文档的工具
- 只允许读取文档、分析结构、整理计划、输出任务拆解
- 计划完成后必须调用 agent_finish_plan，不能直接开始执行
- 计划必须包含：目标、主要步骤、风险或待确认点、必要时的子任务摘要
"""

    return f"""{BASE_SYSTEM_PROMPT}

{mode_prompt}

当前处于正常执行模式。你可以先分析再执行，也可以在必要时维护 todo 和 scratchpad。

执行规则：
- 普通正文改写优先走 find_text_context + replace_text
- 大块结构性编辑优先使用 get_document_outline / preview_mutations / apply_mutations
- 标题体系修正优先使用 normalize_heading_hierarchy 或 insert_heading_relative / apply_formatting
- 表格创建优先使用 create_table_at_anchor 或 create_table_relative
- 批量改单元格优先使用 update_table_cells
- 用户要处理批注、修订、链接时，使用对应的专用工具，不要退化成普通文本替换
- apply_formatting 做字符级格式调整时，必须提供 target_text；如果任务本质是整段/整节格式整理，优先使用 apply_to_entire_segment=true 或段落级格式操作
- 如果已确认计划正在执行，除非出现真实歧义，不要再次要求用户确认计划内步骤，优先自恢复继续执行
"""


def _is_kimi_k25_model() -> bool:
    model = settings.litellm_model.lower()
    api_base = settings.litellm_api_base.lower()
    return model.startswith("kimi-k2.5") or "moonshot.cn" in api_base


def _extract_message_content(message: Any) -> str:
    content = getattr(message, "content", None)
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        text_parts: list[str] = []
        for item in content:
            if isinstance(item, dict) and item.get("type") == "text":
                text_parts.append(str(item.get("text") or ""))
        return "\n".join(part for part in text_parts if part)
    return ""


def _executor_tool_allowed(tool_name: str, plan_mode: bool) -> bool:
    if not plan_mode:
        return True
    return tool_name in PLAN_ONLY_ALLOWED_TOOLS


def _filter_executor_tools(tools: list[dict[str, Any]], plan_mode: bool) -> list[dict[str, Any]]:
    if not plan_mode:
        return tools
    filtered: list[dict[str, Any]] = []
    for tool in tools:
        function = tool.get("function") or {}
        if function.get("name") in PLAN_ONLY_ALLOWED_TOOLS:
            filtered.append(tool)
    return filtered


def _internal_tools() -> list[dict[str, Any]]:
    return [
        {
            "type": "function",
            "function": {
                "name": "agent_update_todo",
                "description": "更新当前任务 todo 列表。适合复杂任务中的阶段跟踪。",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "todos": {
                            "type": "array",
                            "items": {
                                "type": "object",
                                "properties": {
                                    "title": {"type": "string"},
                                    "status": {"type": "string", "enum": ["pending", "in_progress", "done"]},
                                },
                                "required": ["title", "status"],
                            },
                        },
                    },
                    "required": ["todos"],
                },
            },
        },
        {
            "type": "function",
            "function": {
                "name": "agent_write_scratchpad",
                "description": "写入当前运行时 scratchpad，用于保存关键分析结论、约束或风险。",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "notes": {"type": "string"},
                    },
                    "required": ["notes"],
                },
            },
        },
        {
            "type": "function",
            "function": {
                "name": "agent_spawn_subtask",
                "description": "派生一个只读分析子任务。子任务只能读取文档并返回摘要，不会修改文档。",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "task_id": {"type": "string"},
                        "title": {"type": "string"},
                        "prompt": {"type": "string"},
                        "parent_task_id": {"type": "string"},
                    },
                    "required": ["task_id", "title", "prompt"],
                },
            },
        },
        {
            "type": "function",
            "function": {
                "name": "agent_finish_plan",
                "description": "在 Plan Mode 中提交最终计划并结束计划阶段。提交后等待用户确认是否执行。",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "title": {"type": "string"},
                        "summary": {"type": "string"},
                        "content": {"type": "string"},
                    },
                    "required": ["title", "summary", "content"],
                },
            },
        },
    ]


async def _send_phase(ws: WebSocket, phase: str) -> None:
    await ws.send_json({"type": "agent_phase", "phase": phase})


async def _send_task_event(ws: WebSocket, task: AgentTaskRecord) -> None:
    await ws.send_json(
        {
            "type": "agent_task",
            "task_id": task.task_id,
            "title": task.title,
            "status": task.status,
            "summary": task.summary,
            "parent_task_id": task.parent_task_id,
            "agent_id": task.agent_id,
        }
    )


async def _send_plan_events(ws: WebSocket, pending_plan: PendingPlan) -> None:
    await ws.send_json(
        {
            "type": "agent_plan",
            "title": pending_plan.title,
            "summary": pending_plan.summary,
            "content": pending_plan.content,
            "status": "awaiting_decision" if not pending_plan.waiting_for_feedback else "collecting_feedback",
        }
    )
    await ws.send_json(
        {
            "type": "agent_plan_decision_required",
            "title": pending_plan.title,
            "summary": pending_plan.summary,
            "content": pending_plan.content,
        }
    )


def _normalize_error_kind(message: str) -> tuple[str, bool]:
    lowered = message.lower()
    if "429" in lowered or "rate limit" in lowered:
        return "rate_limited", True
    if "overloaded" in lowered:
        return "engine_overloaded", True
    if "timeout" in lowered or "timed out" in lowered:
        return "transport_error", True
    return "tool_runtime_error", False


def _structured_tool_error_result(
    *,
    kind: str,
    message: str,
    retryable: bool,
    user_action_required: bool,
    same_call_retry_forbidden: bool,
    model_guidance: str,
) -> dict[str, Any]:
    return {
        "kind": kind,
        "message": message,
        "retryable": retryable,
        "user_action_required": user_action_required,
        "same_call_retry_forbidden": same_call_retry_forbidden,
        "model_guidance": model_guidance,
    }


def _is_approved_plan_execution(runtime: AgentRuntimeState) -> bool:
    return runtime.execution_strategy == "approved_plan_execution"


def _is_hard_stop_error(error_code: str | None, error_details: dict[str, Any], runtime: AgentRuntimeState) -> bool:
    if not error_code:
        return False
    if error_code in STRUCTURED_STOP_ERROR_CODES:
        return True
    if error_code == "insufficient_context":
        return not bool(error_details.get("can_retry_without_user"))
    if error_code in STRUCTURED_RECOVERABLE_ERROR_CODES:
        return False
    return not _is_approved_plan_execution(runtime)


def _build_next_step_guidance(
    *,
    tool_name: str,
    result: dict[str, Any],
    runtime: AgentRuntimeState,
) -> Optional[str]:
    error_code = str(result.get("error_code") or "")
    error_details = result.get("error_details") if isinstance(result.get("error_details"), dict) else {}
    next_best_action = str(error_details.get("next_best_action") or "")

    if error_code in STRUCTURED_STOP_ERROR_CODES:
        return "Stop editing and ask the user to resolve the ambiguity or confirm the exact target."

    if error_code == "single_candidate_context_mismatch":
        return (
            "There is only one candidate in the confirmed segment. Retry without asking the user, and reuse the "
            "single candidate target_text or switch to a segment-wide operation if appropriate."
        )

    if error_code == "missing_target_text_for_inline_formatting":
        if next_best_action == "retry_same_tool_with_apply_to_entire_segment":
            return (
                "This is a recoverable formatting call. Retry apply_formatting on the same segment with "
                "apply_to_entire_segment=true instead of asking the user."
            )
        return "Retry apply_formatting with an explicit target_text or use a segment-wide formatting scope."

    if error_code == "invalid_target_state":
        return (
            "The segment was found, but the current operation does not fit the target state. Adjust the tool choice "
            "or operation and try again."
        )

    if error_code == "insufficient_context" and error_details.get("can_retry_without_user"):
        return "The tool returned a recoverable context issue. Retry automatically using the suggested recovery path."

    if tool_name == "replace_text" and result.get("replacements") == 0:
        return "The target text was not found. Do not repeat the same replace_text call."

    if tool_name == "get_document_text":
        return "Before any precise edit, locate the exact segment with find_text_context."

    if tool_name == "find_insertion_anchor":
        anchor_candidates = result.get("anchor_candidates") or []
        if len(anchor_candidates) > 1:
            return "Multiple plausible image anchors were found. Stop and ask the user to choose one candidate."

    if result.get("document_mutated"):
        return "The edit was applied successfully. Stop if the request is satisfied."

    if _is_approved_plan_execution(runtime):
        return "This plan has already been approved. Prefer automatic recovery or a different tool before asking the user."

    return None


def _build_error_tracking_key(tool_name: str, error_code: str | None, error_details: dict[str, Any]) -> str:
    next_best_action = str(error_details.get("next_best_action") or "")
    return f"{tool_name}:{error_code or 'unknown'}:{next_best_action}"


def _build_retry_tool_call(
    *,
    original_tool_call: dict[str, Any],
    error_code: str,
    error_details: dict[str, Any],
) -> Optional[tuple[dict[str, Any], str]]:
    function = original_tool_call.get("function") or {}
    tool_name = str(function.get("name") or "")
    try:
        args = json.loads(function.get("arguments") or "{}")
    except Exception:
        args = {}

    next_best_action = str(error_details.get("next_best_action") or "")
    retry_tool_name = tool_name
    description = ""

    if next_best_action == "retry_same_tool_with_apply_to_entire_segment" and tool_name == "apply_formatting":
        args["apply_to_entire_segment"] = True
        args.pop("target_text", None)
        args["context_before"] = ""
        args["context_after"] = ""
        description = "检测到字符级格式调整缺少 target_text，自动改为整段格式调整。"
    elif next_best_action == "retry_same_tool_with_target_text":
        inferred_target_text = str(
            error_details.get("inferred_target_text")
            or error_details.get("single_text_candidate")
            or ""
        ).strip()
        if not inferred_target_text:
            return None
        args["target_text"] = inferred_target_text
        args["target"] = inferred_target_text
        args["context_before"] = ""
        args["context_after"] = ""
        description = "检测到单候选目标，自动补全 target_text 后重试。"
    elif next_best_action == "switch_to_normalize_heading_hierarchy":
        retry_tool_name = "normalize_heading_hierarchy"
        args = {}
        description = "检测到标题层级整理更适合专用工具，自动切换到 normalize_heading_hierarchy。"
    else:
        return None

    return (
        {
            "id": f"{original_tool_call.get('id')}-auto-retry-{next_best_action}",
            "type": original_tool_call.get("type"),
            "function": {
                "name": retry_tool_name,
                "arguments": json.dumps(args, ensure_ascii=False),
            },
        },
        description,
    )

async def _build_completion_kwargs(
    *,
    messages: list[dict[str, Any]],
    tools: list[dict[str, Any]],
    phase: str,
) -> dict[str, Any]:
    kwargs: dict[str, Any] = {
        "model": settings.litellm_model,
        "messages": messages,
        "api_key": settings.litellm_api_key or None,
        "tools": tools or None,
        "drop_params": True,
    }
    if settings.litellm_api_base:
        kwargs["api_base"] = settings.litellm_api_base

    if _is_kimi_k25_model():
        kwargs["extra_body"] = {
            "thinking": {
                "type": "enabled" if phase in {"inspect", "plan"} else "disabled",
            }
        }
    return kwargs


async def _run_subagent(
    *,
    document_id: str,
    prompt: str,
    attachments: list[dict[str, Any]],
    suggest: bool,
) -> str:
    session = await superdoc_service.get_session(document_id, suggest=suggest)
    tools = _filter_executor_tools(await superdoc_service.get_tools(session), plan_mode=True)
    messages: list[dict[str, Any]] = [
        {
            "role": "system",
            "content": (
                "你是 DocPilot 的只读分析子代理。你只能读取当前 Word 文档并返回摘要，"
                "不能执行任何写入文档的操作。请给主代理返回简洁、可执行的分析结论。"
            ),
        },
        {"role": "user", "content": _build_user_content(prompt, document_id, attachments)},
    ]
    kwargs = await _build_completion_kwargs(messages=messages, tools=tools, phase="inspect")

    for _ in range(8):
        response = await litellm.acompletion(**kwargs)
        choice = response.choices[0]
        tool_calls = getattr(choice.message, "tool_calls", None)
        if not tool_calls:
            return _extract_message_content(choice.message) or "子任务完成，但没有返回额外摘要。"

        messages.append(choice.message.model_dump(exclude_none=True))
        for tool_call in tool_calls[:4]:
            normalized_tool_call = _normalize_tool_call(tool_call, attachments)
            tool_name = normalized_tool_call["function"]["name"]
            if tool_name not in PLAN_ONLY_ALLOWED_TOOLS:
                tool_result = _structured_tool_error_result(
                    kind="tool_forbidden_in_plan_mode",
                    message=f"只读子任务禁止调用 {tool_name}",
                    retryable=False,
                    user_action_required=False,
                    same_call_retry_forbidden=True,
                    model_guidance="Read-only subtasks may only inspect the document and summarize findings.",
                )
            else:
                try:
                    tool_response = await superdoc_service.dispatch_tool(session, normalized_tool_call)
                    tool_result = tool_response.get("result", tool_response)
                except Exception as exc:  # pragma: no cover - network/runtime fallback
                    kind, retryable = _normalize_error_kind(str(exc))
                    tool_result = _structured_tool_error_result(
                        kind=kind,
                        message=str(exc),
                        retryable=retryable,
                        user_action_required=False,
                        same_call_retry_forbidden=False,
                        model_guidance="Adjust the read-only inspection strategy or summarize the limitation.",
                    )

            messages.append(
                {
                    "role": "tool",
                    "tool_call_id": tool_call.id,
                    "content": json.dumps(tool_result, ensure_ascii=False),
                }
            )
        kwargs["messages"] = messages

    return "子任务达到最大步骤数，请主代理直接继续。"


def _register_task(runtime: AgentRuntimeState, task_id: str, title: str, parent_task_id: str | None, agent_id: str) -> AgentTaskRecord:
    task = runtime.task_tree.get(task_id)
    if task is None:
        task = AgentTaskRecord(task_id=task_id, title=title, parent_task_id=parent_task_id, agent_id=agent_id)
        runtime.task_tree[task_id] = task
    else:
        task.title = title
        task.parent_task_id = parent_task_id
        task.agent_id = agent_id
    return task


async def _handle_internal_tool(
    *,
    tool_name: str,
    args: dict[str, Any],
    runtime: AgentRuntimeState,
    ws: WebSocket,
    document_id: str,
    attachments: list[dict[str, Any]],
    suggest: bool,
    user_message: str,
) -> tuple[dict[str, Any], bool]:
    if tool_name == "agent_update_todo":
        runtime.todo_list = [
            TodoItem(title=str(item.get("title") or "").strip(), status=str(item.get("status") or "pending"))
            for item in list(args.get("todos") or [])
            if str(item.get("title") or "").strip()
        ]
        return {"todos": [item.__dict__ for item in runtime.todo_list]}, False

    if tool_name == "agent_write_scratchpad":
        runtime.scratchpad = str(args.get("notes") or "").strip()
        return {"scratchpad": runtime.scratchpad}, False

    if tool_name == "agent_spawn_subtask":
        task_id = str(args.get("task_id") or "").strip() or f"task-{len(runtime.task_tree) + 1}"
        title = str(args.get("title") or "").strip() or "未命名子任务"
        prompt = str(args.get("prompt") or "").strip()
        parent_task_id = str(args.get("parent_task_id") or "").strip() or None
        task = _register_task(runtime, task_id, title, parent_task_id, "subagent")
        task.status = "running"
        await _send_task_event(ws, task)
        summary = await _run_subagent(
            document_id=document_id,
            prompt=prompt or user_message,
            attachments=attachments,
            suggest=suggest,
        )
        task.status = "completed"
        task.summary = summary
        await _send_task_event(ws, task)
        return {"task_id": task.task_id, "title": task.title, "summary": summary}, False

    if tool_name == "agent_finish_plan":
        pending_plan = PendingPlan(
            title=str(args.get("title") or "执行计划").strip() or "执行计划",
            summary=str(args.get("summary") or "").strip() or "已生成执行计划。",
            content=str(args.get("content") or "").strip(),
            source_user_message=user_message,
            attachments=attachments,
            suggest=suggest,
        )
        runtime.pending_plan = pending_plan
        runtime.plan_mode_state = "awaiting_decision"
        await _send_plan_events(ws, pending_plan)
        return {
            "title": pending_plan.title,
            "summary": pending_plan.summary,
            "content": pending_plan.content,
        }, True

    raise ValueError(f"Unknown internal tool: {tool_name}")


async def run_agent_loop(
    document_id: str,
    user_message: str,
    chat_history: list[dict[str, Any]],
    attachments: list[dict[str, Any]],
    ws: WebSocket,
    suggest: bool = True,
    plan_mode: bool = False,
    approved_plan_execution: bool = False,
    runtime: Optional[AgentRuntimeState] = None,
) -> AgentLoopResult:
    runtime = runtime or AgentRuntimeState()
    runtime.phase = "plan" if plan_mode else "inspect"
    runtime.plan_mode_state = "planning" if plan_mode else "idle"
    runtime.execution_strategy = "approved_plan_execution" if approved_plan_execution else "normal_execution"
    await _send_phase(ws, runtime.phase)

    try:
        session = await superdoc_service.get_session(document_id, suggest=suggest)
        executor_tools = _filter_executor_tools(await superdoc_service.get_tools(session), plan_mode)
    except Exception as e:
        logger.error(f"Executor bootstrap error: {e}")
        await ws.send_json({"type": "error", "message": str(e)})
        return AgentLoopResult(content=None)

    tools = executor_tools + _internal_tools()
    messages: list[dict[str, Any]] = [{"role": "system", "content": build_system_prompt(suggest=suggest, plan_mode=plan_mode)}]
    messages.extend(chat_history)
    messages.append({"role": "user", "content": _build_user_content(user_message, document_id, attachments)})

    litellm_kwargs = await _build_completion_kwargs(messages=messages, tools=tools, phase=runtime.phase)
    last_tool_signature: Optional[str] = None
    duplicate_tool_call_count = 0
    pending_anchor_candidates: list[dict[str, Any]] = []

    for _ in range(MAX_TOOL_ROUNDS):
        try:
            response = await litellm.acompletion(**litellm_kwargs)
        except Exception as e:
            logger.error(f"LiteLLM error: {e}")
            message = (
                f"当前模型无法处理图片输入或多模态消息格式：{str(e)}"
                if attachments
                else f"LLM 调用失败: {str(e)}"
            )
            await ws.send_json({"type": "error", "message": message})
            return AgentLoopResult(content=None)

        choice = response.choices[0]
        tool_calls = getattr(choice.message, "tool_calls", None)

        if not tool_calls:
            content = _extract_message_content(choice.message)
            if plan_mode:
                pending_plan = PendingPlan(
                    title="执行计划",
                    summary=content.splitlines()[0] if content else "已生成执行计划。",
                    content=content or "未返回详细计划内容。",
                    source_user_message=user_message,
                    attachments=attachments,
                    suggest=suggest,
                )
                runtime.pending_plan = pending_plan
                runtime.plan_mode_state = "awaiting_decision"
                await _send_plan_events(ws, pending_plan)
                return AgentLoopResult(
                    content="已生成计划，请确认是否执行。",
                    pending_anchor_candidates=pending_anchor_candidates,
                    pending_user_message=user_message if pending_anchor_candidates else None,
                    pending_attachments=attachments if pending_anchor_candidates else [],
                    plan_generated=True,
                )

            await ws.send_json({"type": "ai_message", "content": content, "streaming": False})
            await ws.send_json({"type": "agent_summary", "summary": content})
            return AgentLoopResult(
                content=content,
                pending_anchor_candidates=pending_anchor_candidates,
                pending_user_message=user_message if pending_anchor_candidates else None,
                pending_attachments=attachments if pending_anchor_candidates else [],
            )

        assistant_dump = choice.message.model_dump(exclude_none=True)
        messages.append(assistant_dump)
        litellm_kwargs["messages"] = messages

        subtask_calls = [
            tool_call for tool_call in tool_calls
            if getattr(tool_call.function, "name", None) == "agent_spawn_subtask"
        ]
        if len(subtask_calls) > MAX_SUBTASKS_PER_TURN:
            tool_calls = tool_calls[:MAX_SUBTASKS_PER_TURN]

        for tool_call in tool_calls:
            normalized_tool_call = _normalize_tool_call(tool_call, attachments)
            tool_name = normalized_tool_call["function"]["name"]
            tool_signature = _build_tool_signature(normalized_tool_call)

            if tool_signature == last_tool_signature:
                duplicate_tool_call_count += 1
            else:
                last_tool_signature = tool_signature
                duplicate_tool_call_count = 1

            if duplicate_tool_call_count >= DUPLICATE_TOOL_CALL_LIMIT:
                content = (
                    "检测到 AI 正在重复执行相同的文档操作，已自动停止以避免无效循环。"
                    " 当前已应用的修改会保留；请先查看文档中的最新结果。"
                )
                await ws.send_json({"type": "ai_message", "content": content, "streaming": False})
                return AgentLoopResult(content=content)

            await ws.send_json(
                {
                    "type": "tool_call",
                    "tool": tool_name,
                    "status": "executing",
                    "description": f"正在执行 {tool_name}...",
                    "phase": runtime.phase,
                    "agent_id": "main",
                }
            )

            if tool_name == "agent_spawn_subtask":
                raw_args = json.loads(normalized_tool_call["function"]["arguments"])
                task_id = str(raw_args.get("task_id") or f"task-{len(runtime.task_tree) + 1}")
                _register_task(runtime, task_id, str(raw_args.get("title") or "未命名子任务"), str(raw_args.get("parent_task_id") or "") or None, "subagent")

            try:
                raw_args = json.loads(normalized_tool_call["function"]["arguments"] or "{}")
            except Exception:
                raw_args = {}

            if tool_name.startswith("agent_"):
                internal_result, stop_now = await _handle_internal_tool(
                    tool_name=tool_name,
                    args=raw_args,
                    runtime=runtime,
                    ws=ws,
                    document_id=document_id,
                    attachments=attachments,
                    suggest=suggest,
                    user_message=user_message,
                )
                await ws.send_json(
                    {
                        "type": "tool_result",
                        "tool": tool_name,
                        "status": "success",
                        "result": internal_result,
                        "phase": runtime.phase,
                        "agent_id": "main",
                    }
                )
                messages.append(
                    {
                        "role": "tool",
                        "tool_call_id": tool_call.id,
                        "content": json.dumps(internal_result, ensure_ascii=False),
                    }
                )
                litellm_kwargs["messages"] = messages
                if stop_now:
                    return AgentLoopResult(content="已生成计划，请确认是否执行。", plan_generated=True)
                continue

            if plan_mode and tool_name in MUTATION_TOOL_NAMES:
                error_result = _structured_tool_error_result(
                    kind="tool_forbidden_in_plan_mode",
                    message=f"Plan Mode 禁止执行 {tool_name} 这类文档写入工具。",
                    retryable=False,
                    user_action_required=False,
                    same_call_retry_forbidden=True,
                    model_guidance="Stay in planning mode. Read the document, refine the plan, and finish with agent_finish_plan.",
                )
                await ws.send_json(
                    {
                        "type": "tool_result",
                        "tool": tool_name,
                        "status": "error",
                        "result": error_result,
                        "error_code": "tool_forbidden_in_plan_mode",
                        "phase": runtime.phase,
                        "agent_id": "main",
                    }
                )
                messages.append(
                    {
                        "role": "tool",
                        "tool_call_id": tool_call.id,
                        "content": json.dumps(error_result, ensure_ascii=False),
                    }
                )
                litellm_kwargs["messages"] = messages
                continue

            failure_count = runtime.tool_error_history.get(tool_signature, 0)
            if failure_count >= MAX_TOOL_FAILURES_PER_SIGNATURE:
                error_result = _structured_tool_error_result(
                    kind="same_call_retry_blocked",
                    message="相同工具调用已经失败多次，已阻止继续重试。",
                    retryable=False,
                    user_action_required=False,
                    same_call_retry_forbidden=True,
                    model_guidance="Change the tool choice, reduce scope, or ask the user for more precise context.",
                )
                await ws.send_json(
                    {
                        "type": "tool_result",
                        "tool": tool_name,
                        "status": "error",
                        "result": error_result,
                        "phase": runtime.phase,
                        "agent_id": "main",
                    }
                )
                messages.append(
                    {
                        "role": "tool",
                        "tool_call_id": tool_call.id,
                        "content": json.dumps(error_result, ensure_ascii=False),
                    }
                )
                litellm_kwargs["messages"] = messages
                continue

            try:
                tool_response = await superdoc_service.dispatch_tool(session, normalized_tool_call)
                result = tool_response.get("result", tool_response)
                enriched_result = result if isinstance(result, dict) else {"value": str(result)}
                model_result = dict(enriched_result)
                for source_key, target_key in (
                    ("documentMutated", "document_mutated"),
                    ("reloadRequired", "reload_required"),
                    ("trackedChangesSummary", "tracked_changes_summary"),
                    ("errorCode", "error_code"),
                    ("errorDetails", "error_details"),
                    ("assetId", "asset_id"),
                    ("captionAdded", "caption_added"),
                    ("captionText", "caption_text"),
                    ("finalSize", "final_size"),
                ):
                    if source_key in tool_response and tool_response[source_key] is not None:
                        enriched_result[target_key] = tool_response[source_key]
                        model_result[target_key] = tool_response[source_key]
                if "candidates" in tool_response and tool_response["candidates"] is not None:
                    enriched_result["candidates"] = tool_response["candidates"]
                    model_result["candidates"] = tool_response["candidates"]
                if "anchorCandidates" in tool_response and tool_response["anchorCandidates"] is not None:
                    enriched_result["anchor_candidates"] = tool_response["anchorCandidates"]
                    model_result["anchor_candidates"] = tool_response["anchorCandidates"]
                if "selectedAnchor" in tool_response and tool_response["selectedAnchor"] is not None:
                    enriched_result["selected_anchor"] = tool_response["selectedAnchor"]
                    model_result["selected_anchor"] = tool_response["selectedAnchor"]
                error_code = str(enriched_result.get("error_code") or "")
                error_details = enriched_result.get("error_details") if isinstance(enriched_result.get("error_details"), dict) else {}
                next_step_guidance = _build_next_step_guidance(
                    tool_name=tool_name,
                    result=enriched_result,
                    runtime=runtime,
                )
                if next_step_guidance:
                    model_result["next_step_guidance"] = next_step_guidance

                if tool_name == "find_insertion_anchor":
                    anchor_candidates = enriched_result.get("anchor_candidates") or []
                    if len(anchor_candidates) > 1:
                        pending_anchor_candidates = anchor_candidates
                    else:
                        pending_anchor_candidates = []

                result_str = json.dumps(model_result, ensure_ascii=False)
                is_structured_error = error_code in STRUCTURED_ERROR_CODES or bool(error_code)
                requires_user_resolution = _is_hard_stop_error(error_code, error_details, runtime)
                if is_structured_error:
                    runtime.tool_error_history[tool_signature] = failure_count + 1
                    runtime.tool_error_kinds[_build_error_tracking_key(tool_name, error_code, error_details)] = (
                        runtime.tool_error_kinds.get(_build_error_tracking_key(tool_name, error_code, error_details), 0) + 1
                    )
                await ws.send_json(
                    {
                        "type": "tool_result",
                        "tool": tool_name,
                        "status": "error" if is_structured_error else "success",
                        "result": enriched_result,
                        "document_mutated": bool(tool_response.get("documentMutated", False)),
                        "reload_required": bool(tool_response.get("reloadRequired", False)),
                        "tracked_changes_summary": tool_response.get("trackedChangesSummary"),
                        "error_code": tool_response.get("errorCode"),
                        "error_details": tool_response.get("errorDetails"),
                        "candidates": tool_response.get("candidates"),
                        "anchor_candidates": tool_response.get("anchorCandidates"),
                        "selected_anchor": tool_response.get("selectedAnchor"),
                        "asset_id": tool_response.get("assetId"),
                        "caption_added": tool_response.get("captionAdded"),
                        "caption_text": tool_response.get("captionText"),
                        "final_size": tool_response.get("finalSize"),
                        "phase": runtime.phase,
                        "agent_id": "main",
                    }
                )

                if is_structured_error:
                    retry_instruction = _build_retry_tool_call(
                        original_tool_call=normalized_tool_call,
                        error_code=error_code,
                        error_details=error_details,
                    )
                    if retry_instruction and runtime.tool_error_kinds.get(
                        _build_error_tracking_key(tool_name, error_code, error_details),
                        0,
                    ) <= MAX_TOOL_FAILURES_PER_SIGNATURE:
                        retry_tool_call, retry_description = retry_instruction
                        retry_tool_name = retry_tool_call["function"]["name"]
                        await ws.send_json(
                            {
                                "type": "tool_call",
                                "tool": retry_tool_name,
                                "status": "executing",
                                "description": retry_description,
                                "phase": runtime.phase,
                                "agent_id": "main",
                            }
                        )
                        retry_response = await superdoc_service.dispatch_tool(session, retry_tool_call)
                        retry_result = retry_response.get("result", retry_response)
                        retry_enriched_result = retry_result if isinstance(retry_result, dict) else {"value": str(retry_result)}
                        for source_key, target_key in (
                            ("documentMutated", "document_mutated"),
                            ("reloadRequired", "reload_required"),
                            ("trackedChangesSummary", "tracked_changes_summary"),
                            ("errorCode", "error_code"),
                            ("errorDetails", "error_details"),
                        ):
                            if source_key in retry_response and retry_response[source_key] is not None:
                                retry_enriched_result[target_key] = retry_response[source_key]

                        retry_error_code = str(retry_enriched_result.get("error_code") or "")
                        retry_error_details = retry_enriched_result.get("error_details") if isinstance(retry_enriched_result.get("error_details"), dict) else {}
                        retry_is_structured_error = retry_error_code in STRUCTURED_ERROR_CODES or bool(retry_error_code)
                        retry_requires_user_resolution = _is_hard_stop_error(retry_error_code, retry_error_details, runtime)
                        retry_model_result = dict(retry_enriched_result)
                        retry_guidance = _build_next_step_guidance(
                            tool_name=retry_tool_name,
                            result=retry_enriched_result,
                            runtime=runtime,
                        )
                        if retry_guidance:
                            retry_model_result["next_step_guidance"] = retry_guidance

                        await ws.send_json(
                            {
                                "type": "tool_result",
                                "tool": retry_tool_name,
                                "status": "error" if retry_is_structured_error else "success",
                                "result": retry_enriched_result,
                                "document_mutated": bool(retry_response.get("documentMutated", False)),
                                "reload_required": bool(retry_response.get("reloadRequired", False)),
                                "tracked_changes_summary": retry_response.get("trackedChangesSummary"),
                                "error_code": retry_response.get("errorCode"),
                                "error_details": retry_response.get("errorDetails"),
                                "phase": runtime.phase,
                                "agent_id": "main",
                            }
                        )

                        messages.append(
                            {
                                "role": "tool",
                                "tool_call_id": tool_call.id,
                                "content": json.dumps(retry_model_result, ensure_ascii=False),
                            }
                        )
                        litellm_kwargs["messages"] = messages
                        if retry_requires_user_resolution:
                            content = _build_context_resolution_message(retry_tool_name, retry_enriched_result)
                            await ws.send_json({"type": "ai_message", "content": content, "streaming": False})
                            return AgentLoopResult(content=content)
                        continue

                if tool_name == "find_insertion_anchor" and len(pending_anchor_candidates) > 1:
                    content = _build_anchor_resolution_message(pending_anchor_candidates)
                    await ws.send_json({"type": "ai_message", "content": content, "streaming": False})
                    return AgentLoopResult(
                        content=content,
                        pending_anchor_candidates=pending_anchor_candidates,
                        pending_user_message=user_message,
                        pending_attachments=attachments,
                    )

                messages.append({"role": "tool", "tool_call_id": tool_call.id, "content": result_str})
                litellm_kwargs["messages"] = messages
                if requires_user_resolution:
                    content = _build_context_resolution_message(tool_name, enriched_result)
                    await ws.send_json({"type": "ai_message", "content": content, "streaming": False})
                    return AgentLoopResult(content=content)
            except Exception as e:
                kind, retryable = _normalize_error_kind(str(e))
                error_result = _structured_tool_error_result(
                    kind=kind,
                    message=str(e),
                    retryable=retryable,
                    user_action_required=False,
                    same_call_retry_forbidden=False,
                    model_guidance=(
                        "Retry with a narrower scope or a different tool."
                        if retryable
                        else "Adjust the tool choice or ask the user for more precise context."
                    ),
                )
                runtime.tool_error_history[tool_signature] = failure_count + 1
                await ws.send_json(
                    {
                        "type": "tool_result",
                        "tool": tool_name,
                        "status": "error",
                        "result": error_result,
                        "phase": runtime.phase,
                        "agent_id": "main",
                    }
                )
                messages.append(
                    {
                        "role": "tool",
                        "tool_call_id": tool_call.id,
                        "content": json.dumps(error_result, ensure_ascii=False),
                    }
                )
                litellm_kwargs["messages"] = messages

        runtime.phase = "respond" if plan_mode else "verify"
        litellm_kwargs["extra_body"] = {
            "thinking": {
                "type": "enabled" if runtime.phase in {"inspect", "plan"} else "disabled",
            }
        } if _is_kimi_k25_model() else litellm_kwargs.get("extra_body")

    await ws.send_json({"type": "ai_message", "content": "操作步骤过多，已停止。请尝试更简单的指令。", "streaming": False})
    return AgentLoopResult(content=None)


def build_execution_prompt_from_plan(pending_plan: PendingPlan) -> str:
    return (
        "执行已确认计划。\n"
        f"原始需求：{pending_plan.source_user_message}\n\n"
        f"已确认计划标题：{pending_plan.title}\n"
        f"计划摘要：{pending_plan.summary}\n"
        f"计划正文：\n{pending_plan.content}\n\n"
        "该计划已经得到用户明确批准。请直接执行计划内步骤。\n"
        "除非出现真实多候选歧义、目标不存在或定位冲突，否则不要再次要求用户确认计划内步骤。\n"
        "优先通过读取文档、补参数、切换工具、自恢复继续执行。"
    )


def build_feedback_prompt_from_plan(pending_plan: PendingPlan, feedback: str) -> str:
    return (
        "继续补充和更新计划，不要执行。\n"
        f"原始需求：{pending_plan.source_user_message}\n\n"
        f"当前计划标题：{pending_plan.title}\n"
        f"当前计划摘要：{pending_plan.summary}\n"
        f"当前计划正文：\n{pending_plan.content}\n\n"
        f"用户补充信息：{feedback.strip()}\n\n"
        "请基于用户补充信息更新计划，然后用 agent_finish_plan 提交新计划。"
    )


def _build_user_content(
    user_message: str,
    document_id: str,
    attachments: list[dict[str, Any]],
) -> str | list[dict[str, Any]]:
    trimmed = user_message.strip() or "请处理我上传的图片。"
    if not attachments:
        return trimmed

    parts: list[dict[str, Any]] = [
        {
            "type": "text",
            "text": (
                f"{trimmed}\n\n"
                f"本轮共附带 {len(attachments)} 张图片。图片可能是待插入素材，也可能是语义参考图或格式参考图。"
                " 只有在用户明确要求插图或你已确认要插入时，才调用插图相关工具。"
            ),
        }
    ]

    for attachment in attachments:
        asset_id = str(attachment.get("asset_id", "")).strip()
        if not asset_id:
            continue
        preview_url = document_service.get_chat_asset_preview_data_url(document_id, asset_id)
        parts.append(
            {
                "type": "text",
                "text": (
                    f"图片附件：{attachment.get('filename') or asset_id} "
                    f"(真实 asset_id={asset_id}, {attachment.get('width')}x{attachment.get('height')})。"
                    " 如果后续要插图，insert_image_at_anchor 必须使用这个真实 asset_id。"
                ),
            }
        )
        parts.append({"type": "image_url", "image_url": {"url": preview_url}})

    return parts


def _build_tool_signature(tool_call: dict[str, Any]) -> str:
    function = tool_call.get("function", {})
    tool_name = function.get("name", "")
    raw_arguments = function.get("arguments") or "{}"

    try:
        parsed_arguments = json.loads(raw_arguments)
        normalized_arguments = json.dumps(parsed_arguments, ensure_ascii=False, sort_keys=True)
    except Exception:
        normalized_arguments = raw_arguments

    return f"{tool_name}:{normalized_arguments}"


def _normalize_tool_call(tool_call: Any, attachments: list[dict[str, Any]]) -> dict[str, Any]:
    function = getattr(tool_call, "function", None)
    if function is None and isinstance(tool_call, dict):
        function = tool_call.get("function", {})
    if function is None:
        raise ValueError("Tool call is missing function metadata")

    tool_name = getattr(function, "name", None) if not isinstance(function, dict) else function.get("name")
    raw_arguments = getattr(function, "arguments", None) if not isinstance(function, dict) else function.get("arguments")
    raw_arguments = raw_arguments or "{}"

    try:
        arguments = json.loads(raw_arguments)
    except Exception:
        arguments = {}

    if tool_name == "insert_image_at_anchor":
        requested_asset_id = str(arguments.get("asset_id", "")).strip()
        resolved_asset_id = _resolve_attachment_asset_id(requested_asset_id, attachments)
        if resolved_asset_id:
            arguments["asset_id"] = resolved_asset_id

    return {
        "id": getattr(tool_call, "id", None) if not isinstance(tool_call, dict) else tool_call.get("id"),
        "type": getattr(tool_call, "type", None) if not isinstance(tool_call, dict) else tool_call.get("type"),
        "function": {
            "name": tool_name,
            "arguments": json.dumps(arguments, ensure_ascii=False),
        },
    }


def _resolve_attachment_asset_id(requested_asset_id: str, attachments: list[dict[str, Any]]) -> Optional[str]:
    if not attachments:
        return requested_asset_id or None

    if not requested_asset_id and len(attachments) == 1:
        return str(attachments[0].get("asset_id") or "")

    for attachment in attachments:
        asset_id = str(attachment.get("asset_id") or "")
        filename = str(attachment.get("filename") or "")
        stem = Path(filename).stem
        candidates = {asset_id, filename, stem, filename.lower(), stem.lower()}
        if requested_asset_id in candidates or requested_asset_id.lower() in candidates:
            return asset_id

    normalized_requested = requested_asset_id.lower()
    for attachment in attachments:
        asset_id = str(attachment.get("asset_id") or "")
        filename = str(attachment.get("filename") or "").lower()
        stem = Path(filename).stem.lower()
        if normalized_requested and (
            normalized_requested in filename
            or normalized_requested in stem
            or filename in normalized_requested
            or stem in normalized_requested
        ):
            return asset_id

    if len(attachments) == 1:
        return str(attachments[0].get("asset_id") or "")

    return requested_asset_id or None


def _build_context_resolution_message(tool_name: str, result: dict[str, Any]) -> str:
    error_code = result.get("error_code")
    message = result.get("message")
    candidates = result.get("candidates") or []

    if error_code == "title_not_unique":
        return (
            f"{message or '当前无法唯一确定标题位置。'}"
            " 请指出要修改的标题段落，或先描述标题附近的文字。"
        )

    if error_code in {"ambiguous_match", "insufficient_context"}:
        lines = [str(message or "当前无法安全定位要修改的 Word 片段。")]
        if candidates:
            lines.append("候选位置：")
            for index, candidate in enumerate(candidates[:3], start=1):
                location = candidate.get("location_label") or "未知位置"
                matched_text = candidate.get("matched_text") or candidate.get("segment_id") or "目标片段"
                before = candidate.get("context_before") or ""
                after = candidate.get("context_after") or ""
                context = f"{before}[{matched_text}]{after}".strip()
                lines.append(f"{index}. {location}: {context}")
        lines.append("请告诉我具体要改哪一处，再继续修改。")
        return "\n".join(lines)

    return f"{tool_name} 未能安全完成，请补充更精确的 Word 上下文后重试。"


def _build_anchor_resolution_message(candidates: list[dict[str, Any]]) -> str:
    lines = ["我找到了多个可能的插图位置，请告诉我具体选哪一个："]
    for index, candidate in enumerate(candidates[:3], start=1):
        location = candidate.get("location_label") or "未知位置"
        section_path = candidate.get("section_path") or "未识别章节"
        before = candidate.get("context_before") or ""
        after = candidate.get("context_after") or ""
        context = f"{before} … {after}".strip(" …")
        suffix = f"（{section_path}）" if section_path else ""
        if context:
            lines.append(f"{index}. {location}{suffix}: {context}")
        else:
            lines.append(f"{index}. {location}{suffix}")
    lines.append("回复例如“第二个”或直接说章节/附近文字即可。")
    return "\n".join(lines)
