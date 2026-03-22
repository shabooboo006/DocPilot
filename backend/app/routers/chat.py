import json
import logging
import re
from dataclasses import dataclass, field
from typing import Any
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from app.services import agent_service
from app.services.agent_service import AgentRuntimeState
from app.services.realtime_service import realtime_service
from app.services.superdoc_service import superdoc_service
from app.models.schemas import ChatAttachment

logger = logging.getLogger(__name__)
router = APIRouter()


@dataclass
class PendingAnchorTask:
    user_message: str
    attachments: list[dict[str, Any]] = field(default_factory=list)
    candidates: list[dict[str, Any]] = field(default_factory=list)


@dataclass
class ChatSessionState:
    history: list[dict[str, Any]] = field(default_factory=list)
    pending_anchor_task: PendingAnchorTask | None = None
    runtime: AgentRuntimeState = field(default_factory=AgentRuntimeState)


_chat_sessions: dict[str, ChatSessionState] = {}


@router.websocket("/ws/chat/{document_id}")
async def chat_websocket(ws: WebSocket, document_id: str):
    await ws.accept()
    await realtime_service.register(document_id, ws)
    logger.info(f"Chat WebSocket connected for document {document_id}")

    session = _chat_sessions.setdefault(document_id, ChatSessionState())

    try:
        while True:
            raw = await ws.receive_text()
            try:
                data = json.loads(raw)
            except json.JSONDecodeError:
                await ws.send_json({"type": "error", "message": "Invalid JSON"})
                continue

            msg_type = data.get("type")

            if msg_type == "user_message":
                content = data.get("content", "").strip()
                attachment_payloads = data.get("attachments") or []
                attachments = [ChatAttachment.model_validate(item).model_dump() for item in attachment_payloads]
                plan_mode = bool(data.get("plan_mode", False))
                analysis_read_only = bool(data.get("analysis_read_only", False))

                if not content and not attachments:
                    continue

                suggest = data.get("suggest", True)
                effective_content, effective_attachments = _resolve_user_turn(
                    content,
                    attachments,
                    session.pending_anchor_task,
                )

                result = await agent_service.run_agent_loop(
                    document_id=document_id,
                    user_message=effective_content,
                    chat_history=list(session.history),
                    attachments=effective_attachments,
                    ws=ws,
                    suggest=suggest,
                    plan_mode=plan_mode,
                    analysis_read_only=analysis_read_only,
                    runtime=session.runtime,
                )

                session.history.append({
                    "role": "user",
                    "content": _to_history_content(content, attachments),
                })
                if result.content:
                    session.history.append({"role": "assistant", "content": result.content})

                if result.pending_anchor_candidates:
                    session.pending_anchor_task = PendingAnchorTask(
                        user_message=result.pending_user_message or content,
                        attachments=result.pending_attachments or attachments,
                        candidates=result.pending_anchor_candidates,
                    )
                else:
                    session.pending_anchor_task = None

            elif msg_type == "agent_plan_decision":
                decision = str(data.get("decision") or "").strip().lower()
                pending_plan = session.runtime.pending_plan
                if pending_plan is None:
                    await ws.send_json({"type": "error", "message": "当前没有等待确认的计划。"})
                    continue

                if decision == "yes":
                    session.runtime.plan_mode_state = "executing"
                    await ws.send_json({"type": "agent_plan", "title": pending_plan.title, "summary": pending_plan.summary, "content": pending_plan.content, "status": "executing"})
                    execution_prompt = agent_service.build_execution_prompt_from_plan(pending_plan)
                    result = await agent_service.run_agent_loop(
                        document_id=document_id,
                        user_message=execution_prompt,
                        chat_history=list(session.history),
                        attachments=list(pending_plan.attachments),
                        ws=ws,
                        suggest=pending_plan.suggest,
                        plan_mode=False,
                        analysis_read_only=pending_plan.analysis_read_only,
                        approved_plan_execution=True,
                        runtime=session.runtime,
                    )
                    session.history.append({"role": "user", "content": "用户已确认执行计划。"})
                    if result.content:
                        session.history.append({"role": "assistant", "content": result.content})
                    session.runtime.pending_plan = None
                    session.runtime.plan_mode_state = "idle"
                    session.runtime.execution_strategy = "normal_execution"
                elif decision == "no":
                    pending_plan.waiting_for_feedback = True
                    session.runtime.plan_mode_state = "collecting_feedback"
                    await ws.send_json({"type": "agent_plan", "title": pending_plan.title, "summary": pending_plan.summary, "content": pending_plan.content, "status": "collecting_feedback"})
                else:
                    await ws.send_json({"type": "error", "message": "未知的计划决策。"})

            elif msg_type == "agent_plan_feedback":
                feedback = data.get("content", "").strip()
                pending_plan = session.runtime.pending_plan
                if pending_plan is None:
                    await ws.send_json({"type": "error", "message": "当前没有可补充的计划。"})
                    continue
                if not feedback:
                    await ws.send_json({"type": "error", "message": "请先输入要补充的内容。"})
                    continue

                pending_plan.waiting_for_feedback = False
                session.runtime.plan_mode_state = "planning"
                feedback_prompt = agent_service.build_feedback_prompt_from_plan(pending_plan, feedback)
                result = await agent_service.run_agent_loop(
                    document_id=document_id,
                    user_message=feedback_prompt,
                    chat_history=list(session.history),
                    attachments=list(pending_plan.attachments),
                    ws=ws,
                    suggest=pending_plan.suggest,
                    plan_mode=True,
                    analysis_read_only=pending_plan.analysis_read_only,
                    runtime=session.runtime,
                )
                session.history.append({"role": "user", "content": feedback})
                if result.content:
                    session.history.append({"role": "assistant", "content": result.content})

            elif msg_type == "set_suggest_mode":
                if bool(data.get("analysis_read_only", False)):
                    await ws.send_json({
                        "type": "ai_message",
                        "content": "招标分析场景下左侧文档处于只读查看模式，不能切换到可编辑模式。",
                        "streaming": False,
                    })
                    continue
                suggest = data.get("suggest", True)
                await superdoc_service.switch_mode(document_id, suggest)
                await ws.send_json({
                    "type": "ai_message",
                    "content": f"已切换到{'建议' if suggest else '直接编辑'}模式",
                    "streaming": False,
                })

            else:
                logger.warning(f"Unknown message type: {msg_type}")

    except WebSocketDisconnect:
        logger.info(f"Chat WebSocket disconnected for document {document_id}")
        await realtime_service.unregister(document_id, ws)
        await superdoc_service.close_session(document_id)
        _chat_sessions.pop(document_id, None)
    except Exception as e:
        logger.error(f"WebSocket error for document {document_id}: {e}")
        await realtime_service.unregister(document_id, ws)
        try:
            await ws.send_json({"type": "error", "message": "Internal server error"})
        except Exception:
            pass


def _resolve_user_turn(
    content: str,
    attachments: list[dict[str, Any]],
    pending_anchor_task: PendingAnchorTask | None,
) -> tuple[str, list[dict[str, Any]]]:
    if pending_anchor_task is None or attachments:
        return content, attachments

    selected_candidate = _select_anchor_candidate(content, pending_anchor_task.candidates)
    if not selected_candidate:
        return content, attachments

    rewritten = (
        "继续刚才的插图任务。\n"
        f"原始要求：{pending_anchor_task.user_message}\n"
        f"用户已选择候选位置：{selected_candidate.get('location_label') or selected_candidate.get('anchor_id')}\n"
        f"anchor_id={selected_candidate.get('anchor_id')}\n"
        "请直接使用该 anchor 完成插图，不要再次搜索位置。"
    )
    return rewritten, pending_anchor_task.attachments


def _to_history_content(content: str, attachments: list[dict[str, Any]]) -> str | list[dict[str, str]]:
    trimmed = content.strip() or "请处理我上传的图片。"
    if not attachments:
        return trimmed

    summary = [
        {
            "type": "text",
            "text": (
                f"{trimmed}\n\n"
                f"附件："
                + ", ".join(
                    f"{item.get('filename') or item.get('asset_id')}({item.get('width')}x{item.get('height')})"
                    for item in attachments
                )
            ),
        }
    ]
    return summary


def _select_anchor_candidate(content: str, candidates: list[dict[str, Any]]) -> dict[str, Any] | None:
    if not candidates:
        return None

    explicit_index = _parse_candidate_index(content)
    if explicit_index is not None and 0 <= explicit_index < len(candidates):
        return candidates[explicit_index]

    lowered = content.strip().lower()
    for candidate in candidates:
        haystacks = [
            str(candidate.get("location_label") or "").lower(),
            str(candidate.get("section_path") or "").lower(),
            str(candidate.get("context_before") or "").lower(),
            str(candidate.get("context_after") or "").lower(),
        ]
        if lowered and any(lowered in value for value in haystacks if value):
            return candidate

    return None


def _parse_candidate_index(content: str) -> int | None:
    mapping = {
        "第一个": 0,
        "第1个": 0,
        "1": 0,
        "第二个": 1,
        "第2个": 1,
        "2": 1,
        "第三个": 2,
        "第3个": 2,
        "3": 2,
    }
    normalized = re.sub(r"\s+", "", content)
    if normalized in mapping:
        return mapping[normalized]

    match = re.search(r"第\s*([1-9])\s*个", content)
    if match:
        return int(match.group(1)) - 1

    return None
