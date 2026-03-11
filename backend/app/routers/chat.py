import json
import logging
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from app.services import agent_service
from app.services.superdoc_service import superdoc_service

logger = logging.getLogger(__name__)
router = APIRouter()

# In-memory chat history per document session (MVP, no persistence)
_chat_histories: dict[str, list[dict]] = {}


@router.websocket("/ws/chat/{document_id}")
async def chat_websocket(ws: WebSocket, document_id: str):
    await ws.accept()
    logger.info(f"Chat WebSocket connected for document {document_id}")

    if document_id not in _chat_histories:
        _chat_histories[document_id] = []

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
                if not content:
                    continue

                suggest = data.get("suggest", True)
                history = list(_chat_histories[document_id])

                await agent_service.run_agent_loop(
                    document_id=document_id,
                    user_message=content,
                    chat_history=history,
                    ws=ws,
                    suggest=suggest,
                )

                _chat_histories[document_id].append({"role": "user", "content": content})

            elif msg_type == "set_suggest_mode":
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
        await superdoc_service.close_session(document_id)
        _chat_histories.pop(document_id, None)
    except Exception as e:
        logger.error(f"WebSocket error for document {document_id}: {e}")
        try:
            await ws.send_json({"type": "error", "message": "Internal server error"})
        except Exception:
            pass
