import logging
from dataclasses import dataclass
from typing import Any

import httpx

from app.config import settings

logger = logging.getLogger(__name__)


@dataclass
class DocumentSession:
    document_id: str
    suggest: bool = True


class SuperDocService:
    def __init__(self, base_url: str | None = None):
        self.sessions: dict[str, DocumentSession] = {}
        self.base_url = (base_url or settings.superdoc_executor_url).rstrip("/")

    async def get_session(self, document_id: str, suggest: bool = True) -> DocumentSession:
        session = self.sessions.get(document_id)
        if session is None:
            session = DocumentSession(document_id=document_id, suggest=suggest)
            self.sessions[document_id] = session
        else:
            session.suggest = suggest
        return session

    async def close_session(self, document_id: str):
        self.sessions.pop(document_id, None)

    async def switch_mode(self, document_id: str, suggest: bool):
        session = await self.get_session(document_id, suggest=suggest)
        session.suggest = suggest

    async def get_tools(self, session: DocumentSession) -> list[dict[str, Any]]:
        payload = await self._request(
            "GET",
            "/agent/tools",
            params={"mode": self._mode(session), "provider": "openai"},
        )
        tools = payload.get("tools")
        if not isinstance(tools, list):
            raise ValueError("Executor returned invalid tools payload")
        return tools

    async def dispatch_tool(self, session: DocumentSession, tool_call) -> dict[str, Any]:
        payload = {
            "documentId": session.document_id,
            "mode": self._mode(session),
            "toolCall": self._serialize_tool_call(tool_call),
        }
        response = await self._request("POST", "/agent/dispatch", json=payload)
        if not isinstance(response, dict):
            raise ValueError("Executor returned invalid dispatch payload")
        return response

    async def _request(self, method: str, path: str, **kwargs) -> Any:
        url = f"{self.base_url}{path}"
        timeout = httpx.Timeout(60.0, connect=10.0)

        try:
            async with httpx.AsyncClient(timeout=timeout) as client:
                response = await client.request(method, url, **kwargs)
        except httpx.ConnectError as exc:
            raise ValueError(
                f"无法连接 SuperDoc executor: {self.base_url}。请先启动 collab-server（例如运行 `make dev-collab`）。"
            ) from exc

        if response.is_error:
            detail = None
            try:
                payload = response.json()
                detail = payload.get("error") or payload.get("detail")
            except Exception:
                detail = response.text
            raise ValueError(detail or f"Executor request failed with status {response.status_code}")

        return response.json()

    def _mode(self, session: DocumentSession) -> str:
        return "suggesting" if session.suggest else "editing"

    def _serialize_tool_call(self, tool_call) -> dict[str, Any]:
        function = getattr(tool_call, "function", None)
        if function is None and isinstance(tool_call, dict):
            function = tool_call.get("function", {})

        if function is None:
            raise ValueError("Tool call is missing function metadata")

        name = getattr(function, "name", None)
        arguments = getattr(function, "arguments", None)

        if isinstance(function, dict):
            name = function.get("name", name)
            arguments = function.get("arguments", arguments)

        if not name:
            raise ValueError("Tool call is missing function name")

        return {
            "id": getattr(tool_call, "id", None) if not isinstance(tool_call, dict) else tool_call.get("id"),
            "type": getattr(tool_call, "type", None) if not isinstance(tool_call, dict) else tool_call.get("type"),
            "function": {
                "name": name,
                "arguments": arguments or "{}",
            },
        }


superdoc_service = SuperDocService()
