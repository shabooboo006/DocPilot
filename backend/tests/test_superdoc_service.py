from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

import httpx
import pytest

from app.services.superdoc_service import SuperDocService


def _tool_call(name: str, arguments: str = "{}"):
    return SimpleNamespace(
        id="call-1",
        type="function",
        function=SimpleNamespace(name=name, arguments=arguments),
    )


@pytest.mark.asyncio
async def test_get_tools_uses_executor_endpoint():
    service = SuperDocService(base_url="http://executor.test")
    session = await service.get_session("abc123456789", suggest=True)

    with patch.object(service, "_request", new=AsyncMock(return_value={"tools": [{"function": {"name": "get_document_text"}}]})) as mock_request:
        tools = await service.get_tools(session)

    assert tools == [{"function": {"name": "get_document_text"}}]
    mock_request.assert_awaited_once_with(
        "GET",
        "/agent/tools",
        params={"mode": "suggesting", "provider": "openai"},
    )


@pytest.mark.asyncio
async def test_dispatch_tool_uses_suggesting_mode():
    service = SuperDocService(base_url="http://executor.test")
    session = await service.get_session("abc123456789", suggest=True)

    with patch.object(
        service,
        "_request",
        new=AsyncMock(return_value={"result": {"title": "新标题"}, "documentMutated": True}),
    ) as mock_request:
        response = await service.dispatch_tool(session, _tool_call("set_document_title", '{"title":"新标题"}'))

    assert response["result"]["title"] == "新标题"
    mock_request.assert_awaited_once()
    _, kwargs = mock_request.await_args
    assert kwargs["json"]["documentId"] == "abc123456789"
    assert kwargs["json"]["mode"] == "suggesting"
    assert kwargs["json"]["toolCall"]["function"]["name"] == "set_document_title"


def test_serialize_tool_call_supports_dict_and_object():
    service = SuperDocService(base_url="http://executor.test")

    object_payload = service._serialize_tool_call(_tool_call("replace_text", '{"target":"A","replacement":"B"}'))
    dict_payload = service._serialize_tool_call({
        "id": "call-2",
        "type": "function",
        "function": {"name": "append_paragraph", "arguments": '{"text":"结尾"}'},
    })

    assert object_payload["function"]["name"] == "replace_text"
    assert dict_payload["function"]["arguments"] == '{"text":"结尾"}'


@pytest.mark.asyncio
async def test_request_wraps_connect_error_with_clear_message():
    service = SuperDocService(base_url="http://executor.test")

    class FailingClient:
        async def __aenter__(self):
            return self

        async def __aexit__(self, exc_type, exc, tb):
            return False

        async def request(self, *args, **kwargs):
            raise httpx.ConnectError("boom")

    with patch("app.services.superdoc_service.httpx.AsyncClient", return_value=FailingClient()):
        with pytest.raises(ValueError) as exc:
            await service._request("GET", "/agent/tools")

    assert "无法连接 SuperDoc executor" in str(exc.value)
