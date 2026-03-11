import pytest
from unittest.mock import AsyncMock, MagicMock, patch


@pytest.mark.asyncio
async def test_run_agent_loop_text_only_response():
    """When LLM returns no tool calls, sends ai_message and returns content."""
    from app.services.agent_service import run_agent_loop

    mock_ws = AsyncMock()
    mock_response = MagicMock()
    mock_response.choices[0].message.tool_calls = None
    mock_response.choices[0].message.content = "已完成修改"

    with patch("app.services.agent_service.litellm.acompletion", return_value=mock_response):
        result = await run_agent_loop(
            document_id="abc123456789",
            user_message="修改标题",
            chat_history=[],
            ws=mock_ws,
            suggest=True,
        )

    assert result == "已完成修改"
    mock_ws.send_json.assert_called_once()
    sent = mock_ws.send_json.call_args[0][0]
    assert sent["type"] == "ai_message"
    assert sent["content"] == "已完成修改"
    assert sent["streaming"] is False


@pytest.mark.asyncio
async def test_run_agent_loop_llm_error():
    """When LLM raises, sends error message and returns None."""
    from app.services.agent_service import run_agent_loop

    mock_ws = AsyncMock()

    with patch("app.services.agent_service.litellm.acompletion", side_effect=Exception("connection error")):
        result = await run_agent_loop(
            document_id="abc123456789",
            user_message="修改标题",
            chat_history=[],
            ws=mock_ws,
            suggest=True,
        )

    assert result is None
    mock_ws.send_json.assert_called_once()
    sent = mock_ws.send_json.call_args[0][0]
    assert sent["type"] == "error"
