import logging
from app.config import settings

logger = logging.getLogger(__name__)


class SuperDocServiceStub:
    """
    Stub implementation for when superdoc-sdk is not available.
    The real implementation requires superdoc-sdk (alpha, not yet on PyPI).
    Replace this with the real SuperDocService once superdoc-sdk is available.
    """

    def __init__(self):
        self.sessions: dict = {}
        logger.warning(
            "SuperDoc SDK not available. Using stub — AI tool calls will not execute document operations."
        )

    async def get_session(self, document_id: str, suggest: bool = True):
        self.sessions[document_id] = {"document_id": document_id, "suggest": suggest}
        return self.sessions[document_id]

    async def close_session(self, document_id: str):
        self.sessions.pop(document_id, None)

    async def switch_mode(self, document_id: str, suggest: bool):
        if document_id in self.sessions:
            self.sessions[document_id]["suggest"] = suggest

    def get_tools(self, session) -> list:
        # Return empty list — LLM will respond without document tools
        return []

    def dispatch_tool(self, session, tool_call) -> dict:
        return {"error": "SuperDoc SDK not available"}


superdoc_service = SuperDocServiceStub()
