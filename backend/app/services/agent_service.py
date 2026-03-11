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

STRUCTURED_STOP_ERROR_CODES = {"ambiguous_match", "insufficient_context", "title_not_unique"}
STRUCTURED_RECOVERABLE_ERROR_CODES = {"invalid_target_state"}
STRUCTURED_ERROR_CODES = STRUCTURED_STOP_ERROR_CODES | STRUCTURED_RECOVERABLE_ERROR_CODES


@dataclass
class AgentLoopResult:
    content: Optional[str]
    pending_anchor_candidates: list[dict[str, Any]] = field(default_factory=list)
    pending_user_message: Optional[str] = None
    pending_attachments: list[dict[str, Any]] = field(default_factory=list)

BASE_SYSTEM_PROMPT = """你是 DocPilot AI 文档助手。用户会要求你阅读和修改当前打开的 Word `.docx` 文档。

当前可用工具：
- get_document_text：读取当前 Word 文档的结构化上下文快照
- get_document_markdown：读取当前文档的 Markdown 视图，适合总结、导出或大段文本检查
- get_formatting_capabilities：读取当前 SuperDoc 版本支持的格式能力
- find_text_context：先定位目标文本，获取命中片段和前后文
- query_match：执行更通用的官方 selector 查询，可用于精确发现文本/节点
- preview_mutations：预演官方 mutation plan，不实际写入
- apply_mutations：原子执行官方 mutation plan，适合批量结构化修改
- find_insertion_anchor：根据自然语言意图定位图片应插入的正文锚点
- list_caption_conventions：读取当前文档已有图片标题样式
- insert_image_at_anchor：把图片插入正文锚点，并可自动补图片标题
- set_document_title：设置 Word 文档唯一主标题
- replace_text：只在已确认片段内做精确替换
- insert_paragraph_relative：在已确认片段前后插入新段落
- insert_heading_relative：在已确认片段前后插入新标题
- append_paragraph：在文档正文末尾追加段落
- create_table_relative：在已确认片段前后新建表格
- get_table_details：读取指定表格的结构、单元格与属性
- set_table_cell_text：按表格/行/列写入单元格文本
- list_comments：查看当前文档批注/评论线程
- add_comment_on_text：在已确认文本上新增批注
- reply_to_comment：回复现有批注线程
- resolve_comment：将批注标记为已解决
- list_tracked_changes：查看当前文档修订列表
- decide_tracked_change：接受或拒绝单条/全部修订
- list_hyperlinks：查看当前文档链接
- wrap_text_with_link：把已确认文本包装成超链接
- apply_formatting：在已确认片段内调整字符、段落或列表格式

工作原则：
- 只要涉及修改，先调用 get_document_text 了解当前内容
- 这是 Word `.docx` 文档，不是普通富文本；文档可能包含表格、单元格、审批字段、复选框、标题样式和修订
- 必须先确认具体要修改的段落、标题或原文片段，再执行修改；不要一上来对全文做大范围替换
- 所有正文修改都要先调用 find_text_context，确认 segment_id、所在结构、前后文，再执行最小必要改动
- 调整字符格式时，必须先确认 segment_id；如果只改片段中的某几个字，必须带上 target_text 与上下文；只有在明确要改整个片段时，才能使用 apply_to_entire_segment=true
- 调整段落或列表格式时，也必须先确认 segment_id；不要在未定位的情况下直接改样式、对齐、缩进、间距或列表层级
- 任何除 lists.create 之外的列表操作都只能用于“已经是列表项”的段落；如果当前是普通段落，必须先用 apply_formatting + operation=lists.create 创建列表，再做 lists.setType / lists.applyPreset / lists.setLevel 等细化
- 如果要使用较少见的格式属性、段落样式或列表预设，先调用 get_formatting_capabilities 确认当前 SuperDoc 版本支持的 operation 和字段
- 如果一次要做多处结构化修改，优先考虑 preview_mutations / apply_mutations；先预演，再正式应用
- 纯格式整理、排版收紧、标题样式统一、段落间距/缩进/列表样式调整这类任务，优先直接用 apply_formatting；如果 preview_mutations 已失败，不要重复几乎相同的预演，改用更小粒度的格式操作
- 需要更通用的节点/文本发现时，用 query_match；但普通正文改写仍优先走 find_text_context + replace_text
- 修改表格、金额、选项、审批字段时，必须结合所在单元格、相邻标签和前后文判断，不能只看裸文本
- 修改标题时优先使用 set_document_title
- 需要精确改写正文时使用 replace_text，target 必须是文档里真实存在的文本，并且必须带上定位到的上下文
- 新增正文或小节时，优先使用 insert_paragraph_relative / insert_heading_relative，而不是把整段内容拼接进 replace_text
- 新建表格时优先使用 create_table_relative；读取表格结构用 get_table_details；填写单元格优先使用 set_table_cell_text 或批量 apply_mutations
- 用户要批注文档时，先定位目标文本，再用 add_comment_on_text；查看历史批注用 list_comments；回复线程用 reply_to_comment；解决批注用 resolve_comment
- 用户要审阅修订时，使用 list_tracked_changes / decide_tracked_change，不要把“接受修订”理解成普通文本改写
- 用户要给现有文字加链接时，先定位真实文本，再用 wrap_text_with_link；查看已有链接用 list_hyperlinks
- 涉及插图时，先理解图片和用户意图，再调用 find_insertion_anchor；如果候选位置多于一个，不要插图，先向用户确认
- 插图默认是块级图片；除非图像明显属于 logo、头像、签名、印章、二维码，否则优先补一条简短 caption
- caption 先复用文档已有“图/Figure”风格；如果没有现成规范，默认使用“图 N：标题”
- 当前会话处于直接编辑模式，工具写入会直接保存到文档
- 如果某次修改工具已经成功完成目标，就直接停止 tool calls，改为向用户汇报结果
- 不要重复调用完全相同的工具和参数，也不要在修改成功后反复用 get_document_text 做验证
- 如果命中不唯一、上下文不足或结构不清晰，必须停止修改并向用户追问“具体是哪一处”
- 完成后简要说明你读取到了什么、修改了什么
- 如果用户意图不明确，先询问而不是猜测
"""

MAX_TOOL_ROUNDS = 20
DUPLICATE_TOOL_CALL_LIMIT = 3


def build_system_prompt(*, suggest: bool) -> str:
    if suggest:
        return """你是 DocPilot AI 文档助手。当前会话处于建议模式，正在处理 Word `.docx` 文档。

当前可用工具：
- get_document_text：读取当前 Word 文档的结构化上下文快照
- get_document_markdown：读取当前文档的 Markdown 视图，适合总结、导出或大段文本检查
- get_formatting_capabilities：读取当前 SuperDoc 版本支持的格式能力
- find_text_context：先定位目标文本，获取命中片段和前后文
- query_match：执行更通用的官方 selector 查询，可用于精确发现文本/节点
- preview_mutations：预演官方 mutation plan，不实际写入
- apply_mutations：原子执行官方 mutation plan，适合批量结构化修改
- find_insertion_anchor：根据自然语言意图定位图片应插入的正文锚点
- list_caption_conventions：读取当前文档已有图片标题样式
- insert_image_at_anchor：把图片插入正文锚点，并可自动补图片标题
- set_document_title：设置 Word 文档唯一主标题
- replace_text：只在已确认片段内做精确替换
- insert_paragraph_relative：在已确认片段前后插入新段落
- insert_heading_relative：在已确认片段前后插入新标题
- append_paragraph：在文档正文末尾追加段落
- create_table_relative：在已确认片段前后新建表格
- get_table_details：读取指定表格的结构、单元格与属性
- set_table_cell_text：按表格/行/列写入单元格文本
- list_comments：查看当前文档批注/评论线程
- add_comment_on_text：在已确认文本上新增批注
- reply_to_comment：回复现有批注线程
- resolve_comment：将批注标记为已解决
- list_tracked_changes：查看当前文档修订列表
- decide_tracked_change：接受或拒绝单条/全部修订
- list_hyperlinks：查看当前文档链接
- wrap_text_with_link：把已确认文本包装成超链接
- apply_formatting：在已确认片段内调整字符、段落或列表格式

工作方式：
- 先使用 get_document_text 读取当前文档
- 这是 Word `.docx` 文档，不是普通富文本；文档可能包含表格、单元格、审批字段、复选框、标题样式和修订
- 必须先确认具体要修改的段落、标题或原文片段，再执行修改；不要一上来对全文做大范围替换
- 所有正文修改都要先调用 find_text_context，确认 segment_id、所在结构、前后文，再执行最小必要改动
- 调整字符格式时，必须先确认 segment_id；如果只改片段中的某几个字，必须带上 target_text 与上下文；只有在明确要改整个片段时，才能使用 apply_to_entire_segment=true
- 调整段落或列表格式时，也必须先确认 segment_id；不要在未定位的情况下直接改样式、对齐、缩进、间距或列表层级
- 任何除 lists.create 之外的列表操作都只能用于“已经是列表项”的段落；如果当前是普通段落，必须先用 apply_formatting + operation=lists.create 创建列表，再做 lists.setType / lists.applyPreset / lists.setLevel 等细化
- 如果要使用较少见的格式属性、段落样式或列表预设，先调用 get_formatting_capabilities 确认当前 SuperDoc 版本支持的 operation 和字段
- 如果一次要做多处结构化修改，优先考虑 preview_mutations / apply_mutations；先预演，再正式应用
- 纯格式整理、排版收紧、标题样式统一、段落间距/缩进/列表样式调整这类任务，优先直接用 apply_formatting；如果 preview_mutations 已失败，不要重复几乎相同的预演，改用更小粒度的格式操作
- 需要更通用的节点/文本发现时，用 query_match；但普通正文改写仍优先走 find_text_context + replace_text
- 新增正文或小节时，优先使用 insert_paragraph_relative / insert_heading_relative，而不是把整段内容拼接进 replace_text
- 新建表格时优先使用 create_table_relative；读取表格结构用 get_table_details；填写单元格优先使用 set_table_cell_text 或批量 apply_mutations
- 用户要批注文档时，先定位目标文本，再用 add_comment_on_text；查看历史批注用 list_comments；回复线程用 reply_to_comment；解决批注用 resolve_comment
- 用户要审阅修订时，使用 list_tracked_changes / decide_tracked_change，不要把“接受修订”理解成普通文本改写
- 用户要给现有文字加链接时，先定位真实文本，再用 wrap_text_with_link；查看已有链接用 list_hyperlinks
- 涉及插图时，先理解图片内容和用户意图，再调用 find_insertion_anchor 选择正文锚点
- 如果 find_insertion_anchor 返回多个合理候选，不要继续插图，直接向用户确认具体位置
- 插图后优先补 caption；logo、头像、签名、印章、二维码这类图片可不加
- caption 优先复用文档中已有样式，没有时默认“图 N：标题”
- 修改表格、金额、选项、审批字段时，必须结合所在单元格、相邻标签和前后文判断，不能只看裸文本
- 如果用户要求修改，直接调用工具执行修改
- 所有工具写入都会通过后端 SuperDoc 执行，并保存为可审阅的 tracked changes / 修订
- 如果某次修改工具已经成功完成目标，就直接停止 tool calls，改为告诉用户“已生成修订”
- 不要重复调用完全相同的工具和参数，也不要在修改成功后反复用 get_document_text 做验证
- 如果命中不唯一、上下文不足或结构不清晰，必须停止修改并向用户追问“具体是哪一处”
- 完成后明确告诉用户：修改已经生成为修订，可在编辑器中接受或拒绝
- 如果用户只是让你总结、分析、解释，则正常完成
"""

    return BASE_SYSTEM_PROMPT


async def run_agent_loop(
    document_id: str,
    user_message: str,
    chat_history: list[dict],
    attachments: list[dict[str, Any]],
    ws: WebSocket,
    suggest: bool = True,
) -> AgentLoopResult:
    try:
        session = await superdoc_service.get_session(document_id, suggest=suggest)
        tools = await superdoc_service.get_tools(session)
    except Exception as e:
        logger.error(f"Executor bootstrap error: {e}")
        await ws.send_json({"type": "error", "message": str(e)})
        return AgentLoopResult(content=None)

    messages: list[dict] = [{"role": "system", "content": build_system_prompt(suggest=suggest)}]
    messages.extend(chat_history)
    messages.append({"role": "user", "content": _build_user_content(user_message, document_id, attachments)})

    litellm_kwargs: dict = {
        "model": settings.litellm_model,
        "messages": messages,
        "api_key": settings.litellm_api_key or None,
    }
    if settings.litellm_api_base:
        litellm_kwargs["api_base"] = settings.litellm_api_base
    if tools:
        litellm_kwargs["tools"] = tools

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
            content = choice.message.content or ""
            await ws.send_json({
                "type": "ai_message",
                "content": content,
                "streaming": False,
            })
            return AgentLoopResult(
                content=content,
                pending_anchor_candidates=pending_anchor_candidates,
                pending_user_message=user_message if pending_anchor_candidates else None,
                pending_attachments=attachments if pending_anchor_candidates else [],
            )

        # Append assistant message with tool calls
        messages.append(choice.message.model_dump(exclude_none=True))
        litellm_kwargs["messages"] = messages

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
                await ws.send_json({
                    "type": "ai_message",
                    "content": content,
                    "streaming": False,
                })
                return AgentLoopResult(content=content)

            await ws.send_json({
                "type": "tool_call",
                "tool": tool_name,
                "status": "executing",
                "description": f"正在执行 {tool_name}...",
            })

            result_str = ""
            try:
                tool_response = await superdoc_service.dispatch_tool(session, normalized_tool_call)
                result = tool_response.get("result", tool_response)
                enriched_result = result if isinstance(result, dict) else {"value": str(result)}
                model_result = dict(enriched_result)
                if "documentMutated" in tool_response:
                    document_mutated = bool(tool_response["documentMutated"])
                    enriched_result["document_mutated"] = document_mutated
                    model_result["document_mutated"] = document_mutated
                if "reloadRequired" in tool_response:
                    reload_required = bool(tool_response["reloadRequired"])
                    enriched_result["reload_required"] = reload_required
                    model_result["reload_required"] = reload_required
                if "trackedChangesSummary" in tool_response and tool_response["trackedChangesSummary"] is not None:
                    enriched_result["tracked_changes_summary"] = tool_response["trackedChangesSummary"]
                    model_result["tracked_changes_summary"] = tool_response["trackedChangesSummary"]
                if "errorCode" in tool_response and tool_response["errorCode"] is not None:
                    enriched_result["error_code"] = tool_response["errorCode"]
                    model_result["error_code"] = tool_response["errorCode"]
                if "errorDetails" in tool_response and tool_response["errorDetails"] is not None:
                    enriched_result["error_details"] = tool_response["errorDetails"]
                    model_result["error_details"] = tool_response["errorDetails"]
                if "candidates" in tool_response and tool_response["candidates"] is not None:
                    enriched_result["candidates"] = tool_response["candidates"]
                    model_result["candidates"] = tool_response["candidates"]
                if "anchorCandidates" in tool_response and tool_response["anchorCandidates"] is not None:
                    enriched_result["anchor_candidates"] = tool_response["anchorCandidates"]
                    model_result["anchor_candidates"] = tool_response["anchorCandidates"]
                if "selectedAnchor" in tool_response and tool_response["selectedAnchor"] is not None:
                    enriched_result["selected_anchor"] = tool_response["selectedAnchor"]
                    model_result["selected_anchor"] = tool_response["selectedAnchor"]
                if "assetId" in tool_response and tool_response["assetId"] is not None:
                    enriched_result["asset_id"] = tool_response["assetId"]
                    model_result["asset_id"] = tool_response["assetId"]
                if "captionAdded" in tool_response and tool_response["captionAdded"] is not None:
                    enriched_result["caption_added"] = tool_response["captionAdded"]
                    model_result["caption_added"] = tool_response["captionAdded"]
                if "captionText" in tool_response and tool_response["captionText"] is not None:
                    enriched_result["caption_text"] = tool_response["captionText"]
                    model_result["caption_text"] = tool_response["captionText"]
                if "finalSize" in tool_response and tool_response["finalSize"] is not None:
                    enriched_result["final_size"] = tool_response["finalSize"]
                    model_result["final_size"] = tool_response["finalSize"]

                if enriched_result.get("error_code") in STRUCTURED_STOP_ERROR_CODES:
                    model_result["next_step_guidance"] = (
                        "Stop editing. Ask the user to confirm the exact Word segment using the returned candidates."
                    )
                elif enriched_result.get("error_code") == "invalid_target_state":
                    error_details = enriched_result.get("error_details") or {}
                    suggested_operation = ""
                    if isinstance(error_details, dict):
                        suggested_operation = str(error_details.get("suggested_operation") or "").strip()
                    if tool_name == "apply_formatting" and suggested_operation == "lists.create":
                        model_result["next_step_guidance"] = (
                            "The segment was found, but this list operation only works on existing list items. "
                            "Call apply_formatting again on the same segment_id with operation='lists.create' first, "
                            "then apply any follow-up list formatting only if needed."
                        )
                    else:
                        model_result["next_step_guidance"] = (
                            "The segment was found, but this operation does not fit the current target state. "
                            "Adjust the tool choice or operation and try again without asking the user yet."
                        )
                elif tool_name == "replace_text" and enriched_result.get("replacements") == 0:
                    model_result["next_step_guidance"] = (
                        "The target text was not found. Do not repeat the same replace_text call."
                    )
                elif tool_name == "get_document_text":
                    model_result["next_step_guidance"] = (
                        "This is a structured Word .docx snapshot. Before any body edit, call find_text_context "
                        "to locate the exact segment_id and nearby context."
                    )
                elif tool_name == "get_document_markdown":
                    model_result["next_step_guidance"] = (
                        "Use this Markdown view for summarization or broad inspection. For precise edits, still rely on "
                        "get_document_text and find_text_context."
                    )
                elif tool_name == "get_formatting_capabilities":
                    model_result["next_step_guidance"] = (
                        "Pick one operation from operation_groups. Inline formatting should usually use "
                        "format.apply with args.inline, while paragraph and list formatting should target a confirmed segment_id."
                    )
                elif tool_name == "find_text_context":
                    model_result["next_step_guidance"] = (
                        "Use the returned segment_id plus context_before/context_after for the next mutation. "
                        "If there are multiple matches, ask the user which one to edit."
                    )
                elif tool_name == "query_match":
                    model_result["next_step_guidance"] = (
                        "This is the lower-level selector query layer. Reuse resolved addresses or segment-scoped queries for "
                        "precise structural edits and mutation plans."
                    )
                elif tool_name == "preview_mutations":
                    preview_output = enriched_result.get("result")
                    preview_valid = False
                    if isinstance(preview_output, dict):
                        preview_valid = bool(preview_output.get("valid"))
                    if preview_valid:
                        model_result["next_step_guidance"] = (
                            "Inspect valid/failures and resolved targets first. Only call apply_mutations after the preview shows "
                            "the intended steps and target resolution."
                        )
                    else:
                        model_result["next_step_guidance"] = (
                            "This preview failed. Do not repeat a nearly identical preview_mutations call. "
                            "For simple formatting or confirmed segment edits, switch to apply_formatting or a smaller targeted edit."
                        )
                elif tool_name == "get_table_details":
                    model_result["next_step_guidance"] = (
                        "Use the returned rows, columns, and cell info to decide which table cell or table mutation to apply next."
                    )
                elif tool_name == "list_comments":
                    model_result["next_step_guidance"] = (
                        "Use comment_id values for reply_to_comment or resolve_comment. To add a new anchored comment, first "
                        "locate exact text with find_text_context."
                    )
                elif tool_name == "list_tracked_changes":
                    model_result["next_step_guidance"] = (
                        "Use change ids with decide_tracked_change, or set apply_to_all=true when the user clearly wants to "
                        "accept or reject all revisions."
                    )
                elif tool_name == "list_hyperlinks":
                    model_result["next_step_guidance"] = (
                        "Inspect existing links here. To add a link to current text, first locate the exact text span and then "
                        "call wrap_text_with_link."
                    )
                elif tool_name == "find_insertion_anchor":
                    anchor_candidates = enriched_result.get("anchor_candidates") or []
                    if len(anchor_candidates) > 1:
                        pending_anchor_candidates = anchor_candidates
                        model_result["next_step_guidance"] = (
                            "Multiple plausible image anchors were found. Stop and ask the user to choose one candidate."
                        )
                    else:
                        pending_anchor_candidates = []
                elif enriched_result.get("document_mutated"):
                    model_result["next_step_guidance"] = (
                        "The edit was applied successfully. If the request is satisfied, stop calling tools now "
                        "and send the final answer. Do not repeat the same edit."
                    )

                result_str = json.dumps(model_result, ensure_ascii=False)
                is_structured_error = enriched_result.get("error_code") in STRUCTURED_ERROR_CODES
                requires_user_resolution = enriched_result.get("error_code") in STRUCTURED_STOP_ERROR_CODES
                await ws.send_json({
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
                })
                if tool_name == "find_insertion_anchor" and len(pending_anchor_candidates) > 1:
                    content = _build_anchor_resolution_message(pending_anchor_candidates)
                    await ws.send_json({
                        "type": "ai_message",
                        "content": content,
                        "streaming": False,
                    })
                    return AgentLoopResult(
                        content=content,
                        pending_anchor_candidates=pending_anchor_candidates,
                        pending_user_message=user_message,
                        pending_attachments=attachments,
                    )
                messages.append({
                    "role": "tool",
                    "tool_call_id": tool_call.id,
                    "content": result_str,
                })
                litellm_kwargs["messages"] = messages
                if requires_user_resolution:
                    content = _build_context_resolution_message(tool_name, enriched_result)
                    await ws.send_json({
                        "type": "ai_message",
                        "content": content,
                        "streaming": False,
                    })
                    return AgentLoopResult(content=content)
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
                litellm_kwargs["messages"] = messages

    await ws.send_json({
        "type": "ai_message",
        "content": "操作步骤过多，已停止。请尝试更简单的指令。",
        "streaming": False,
    })
    return AgentLoopResult(content=None)


def _build_user_content(
    user_message: str,
    document_id: str,
    attachments: list[dict[str, Any]],
) -> str | list[dict[str, Any]]:
    trimmed = user_message.strip() or "请处理我上传的图片。"
    if not attachments:
        return trimmed

    parts: list[dict[str, Any]] = [{
        "type": "text",
        "text": (
            f"{trimmed}\n\n"
            f"本轮共附带 {len(attachments)} 张图片。请结合图片内容、文档结构和上下文决定插入位置、尺寸和 caption。"
        ),
    }]

    for attachment in attachments:
        asset_id = str(attachment.get("asset_id", "")).strip()
        if not asset_id:
            continue
        preview_url = document_service.get_chat_asset_preview_data_url(document_id, asset_id)
        parts.append({
            "type": "text",
            "text": (
                f"图片附件：{attachment.get('filename') or asset_id} "
                f"(真实 asset_id={asset_id}, {attachment.get('width')}x{attachment.get('height')})。"
                " 后续工具调用 insert_image_at_anchor 时，必须使用这个真实 asset_id，不能使用文件名代替。"
            ),
        })
        parts.append({
            "type": "image_url",
            "image_url": {
                "url": preview_url,
            },
        })

    return parts


def _build_tool_signature(tool_call) -> str:
    function = getattr(tool_call, "function", None)
    if function is None and isinstance(tool_call, dict):
        function = tool_call.get("function", {})

    tool_name = getattr(function, "name", "") if not isinstance(function, dict) else function.get("name", "")
    raw_arguments = getattr(function, "arguments", None) if not isinstance(function, dict) else function.get("arguments")
    raw_arguments = raw_arguments or "{}"

    try:
        parsed_arguments = json.loads(raw_arguments)
        normalized_arguments = json.dumps(parsed_arguments, ensure_ascii=False, sort_keys=True)
    except Exception:
        normalized_arguments = raw_arguments

    return f"{tool_name}:{normalized_arguments}"


def _normalize_tool_call(tool_call, attachments: list[dict[str, Any]]) -> dict[str, Any]:
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
        candidates = {
            asset_id,
            filename,
            stem,
            filename.lower(),
            stem.lower(),
        }
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


def _build_context_resolution_message(tool_name: str, result: dict) -> str:
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
