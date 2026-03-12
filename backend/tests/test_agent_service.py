import json
import pytest
from unittest.mock import AsyncMock, MagicMock, patch

from app.services.agent_service import AgentRuntimeState, build_execution_prompt_from_plan, build_system_prompt, PendingPlan


@pytest.mark.asyncio
async def test_run_agent_loop_text_only_response():
    """When LLM returns no tool calls, sends ai_message and returns content."""
    from app.services.agent_service import run_agent_loop

    mock_ws = AsyncMock()
    mock_response = MagicMock()
    mock_response.choices[0].message.tool_calls = None
    mock_response.choices[0].message.content = "已完成修改"
    mock_response.choices[0].message.model_dump.return_value = {"role": "assistant", "content": "已完成修改"}

    with patch("app.services.agent_service.superdoc_service.get_session", new=AsyncMock(return_value=MagicMock())), \
         patch("app.services.agent_service.superdoc_service.get_tools", new=AsyncMock(return_value=[])), \
         patch("app.services.agent_service.litellm.acompletion", return_value=mock_response):
        result = await run_agent_loop(
            document_id="abc123456789",
            user_message="修改标题",
            chat_history=[],
            attachments=[],
            ws=mock_ws,
            suggest=True,
        )

    assert result.content == "已完成修改"
    events = [call.args[0] for call in mock_ws.send_json.await_args_list]
    assert events[0]["type"] == "agent_phase"
    assert events[1]["type"] == "ai_message"
    assert events[1]["content"] == "已完成修改"
    assert events[1]["streaming"] is False
    assert events[2]["type"] == "agent_summary"


@pytest.mark.asyncio
async def test_run_agent_loop_llm_error():
    """When LLM raises, sends error message and returns None."""
    from app.services.agent_service import run_agent_loop

    mock_ws = AsyncMock()

    with patch("app.services.agent_service.superdoc_service.get_session", new=AsyncMock(return_value=MagicMock())), \
         patch("app.services.agent_service.superdoc_service.get_tools", new=AsyncMock(return_value=[])), \
         patch("app.services.agent_service.litellm.acompletion", side_effect=Exception("connection error")):
        result = await run_agent_loop(
            document_id="abc123456789",
            user_message="修改标题",
            chat_history=[],
            attachments=[],
            ws=mock_ws,
            suggest=True,
        )

    assert result.content is None
    events = [call.args[0] for call in mock_ws.send_json.await_args_list]
    assert events[0]["type"] == "agent_phase"
    assert events[-1]["type"] == "error"


def test_build_system_prompt_mentions_plan_constraints_in_plan_mode():
    prompt = build_system_prompt(suggest=True, plan_mode=True)

    assert "建议模式" in prompt
    assert "Word `.docx`" in prompt
    assert "tracked changes / 修订" in prompt
    assert "Agent Plan Mode" in prompt
    assert "严禁执行任何会修改文档的工具" in prompt
    assert "agent_finish_plan" in prompt
    assert "不要重复调用完全相同的工具和参数" in prompt
    assert "find_text_context" in prompt
    assert "agent_update_todo" in prompt


def test_build_system_prompt_keeps_direct_edit_prompt_for_non_suggest_mode():
    prompt = build_system_prompt(suggest=False, plan_mode=False)

    assert "直接编辑模式" in prompt
    assert "普通正文改写优先走 find_text_context + replace_text" in prompt
    assert "normalize_heading_hierarchy" in prompt
    assert "create_table_at_anchor" in prompt
    assert "当前处于 Agent Plan Mode" not in prompt
    assert "不要重复调用完全相同的工具和参数" in prompt
    assert "Word `.docx`" in prompt
    assert "find_text_context" in prompt
    assert "preview_mutations" in prompt
    assert "update_table_cells" in prompt


def test_build_execution_prompt_mentions_approved_plan_recovery_rules():
    prompt = build_execution_prompt_from_plan(
        PendingPlan(
            title="测试计划",
            summary="测试摘要",
            content="1. 修改标题\n2. 统一格式",
            source_user_message="请执行计划",
        )
    )

    assert "该计划已经得到用户明确批准" in prompt
    assert "不要再次要求用户确认计划内步骤" in prompt
    assert "优先通过读取文档、补参数、切换工具、自恢复继续执行" in prompt


@pytest.mark.asyncio
async def test_run_agent_loop_sends_reload_metadata_for_mutations():
    from app.services.agent_service import run_agent_loop

    mock_ws = AsyncMock()
    mock_response = MagicMock()
    mock_tool_call = MagicMock()
    mock_tool_call.id = "call-1"
    mock_tool_call.function.name = "set_document_title"
    mock_tool_call.function.arguments = '{"title":"新标题"}'
    mock_tool_call.model_dump.return_value = {
        "id": "call-1",
        "type": "function",
        "function": {"name": "set_document_title", "arguments": '{"title":"新标题"}'},
    }
    mock_response.choices[0].message.tool_calls = [mock_tool_call]
    mock_response.choices[0].message.model_dump.return_value = {
        "role": "assistant",
        "content": None,
        "tool_calls": [
            {
                "id": "call-1",
                "type": "function",
                "function": {"name": "set_document_title", "arguments": '{"title":"新标题"}'},
            }
        ],
    }

    final_response = MagicMock()
    final_response.choices[0].message.tool_calls = None
    final_response.choices[0].message.content = "已生成修订"
    final_response.choices[0].message.model_dump.return_value = {"role": "assistant", "content": "已生成修订"}

    with patch("app.services.agent_service.superdoc_service.get_session", new=AsyncMock(return_value=MagicMock())), \
         patch("app.services.agent_service.superdoc_service.get_tools", new=AsyncMock(return_value=[])), \
         patch(
             "app.services.agent_service.superdoc_service.dispatch_tool",
             new=AsyncMock(
                 return_value={
                     "result": {"title": "新标题"},
                     "documentMutated": True,
                     "reloadRequired": True,
                     "trackedChangesSummary": {"total": 1},
                 }
             ),
         ), \
         patch("app.services.agent_service.litellm.acompletion", side_effect=[mock_response, final_response]):
        result = await run_agent_loop(
            document_id="abc123456789",
            user_message="修改标题",
            chat_history=[],
            attachments=[],
            ws=mock_ws,
            suggest=True,
        )

    assert result.content == "已生成修订"
    tool_result_event = [call.args[0] for call in mock_ws.send_json.await_args_list if call.args[0]["type"] == "tool_result"][0]
    assert tool_result_event["document_mutated"] is True
    assert tool_result_event["reload_required"] is True
    assert tool_result_event["tracked_changes_summary"]["total"] == 1


@pytest.mark.asyncio
async def test_run_agent_loop_stops_on_repeated_identical_tool_calls():
    from app.services.agent_service import run_agent_loop

    mock_ws = AsyncMock()

    repeated_tool_call = MagicMock()
    repeated_tool_call.id = "call-1"
    repeated_tool_call.function.name = "replace_text"
    repeated_tool_call.function.arguments = '{"target":"A","replacement":"B"}'

    repeated_response = MagicMock()
    repeated_response.choices[0].message.tool_calls = [repeated_tool_call]
    repeated_response.choices[0].message.model_dump.return_value = {
        "role": "assistant",
        "content": None,
        "tool_calls": [
            {
                "id": "call-1",
                "type": "function",
                "function": {"name": "replace_text", "arguments": '{"target":"A","replacement":"B"}'},
            }
        ],
    }

    with patch("app.services.agent_service.superdoc_service.get_session", new=AsyncMock(return_value=MagicMock())), \
         patch("app.services.agent_service.superdoc_service.get_tools", new=AsyncMock(return_value=[])), \
         patch(
             "app.services.agent_service.superdoc_service.dispatch_tool",
             new=AsyncMock(
                 return_value={
                     "result": {"replacements": 1},
                     "documentMutated": True,
                     "reloadRequired": True,
                     "trackedChangesSummary": {"total": 1},
                 }
             ),
         ) as mock_dispatch, \
         patch(
             "app.services.agent_service.litellm.acompletion",
             side_effect=[repeated_response, repeated_response, repeated_response],
         ):
        result = await run_agent_loop(
            document_id="abc123456789",
            user_message="把 A 改成 B",
            chat_history=[],
            attachments=[],
            ws=mock_ws,
            suggest=True,
        )

    assert result.content is not None and "重复执行相同的文档操作" in result.content
    assert mock_dispatch.await_count == 2
    ai_messages = [call.args[0] for call in mock_ws.send_json.await_args_list if call.args[0]["type"] == "ai_message"]
    assert any("重复执行相同的文档操作" in message["content"] for message in ai_messages)


@pytest.mark.asyncio
async def test_run_agent_loop_stops_and_asks_user_on_structured_context_error():
    from app.services.agent_service import run_agent_loop

    mock_ws = AsyncMock()
    mock_response = MagicMock()
    mock_tool_call = MagicMock()
    mock_tool_call.id = "call-ctx"
    mock_tool_call.function.name = "replace_text"
    mock_tool_call.function.arguments = '{"target":"163.20万元","replacement":"200.00万元"}'
    mock_response.choices[0].message.tool_calls = [mock_tool_call]
    mock_response.choices[0].message.model_dump.return_value = {
        "role": "assistant",
        "content": None,
        "tool_calls": [
            {
                "id": "call-ctx",
                "type": "function",
                "function": {"name": "replace_text", "arguments": '{"target":"163.20万元","replacement":"200.00万元"}'},
            }
        ],
    }

    with patch("app.services.agent_service.superdoc_service.get_session", new=AsyncMock(return_value=MagicMock())), \
         patch("app.services.agent_service.superdoc_service.get_tools", new=AsyncMock(return_value=[])), \
         patch(
             "app.services.agent_service.superdoc_service.dispatch_tool",
             new=AsyncMock(
                 return_value={
                     "result": {
                         "message": "目标文本命中多处。",
                         "error_code": "ambiguous_match",
                         "candidates": [
                             {
                                 "location_label": "表格1 第4行 第8列",
                                 "matched_text": "163.20万元",
                                 "context_before": "估算总价（不含税）",
                                 "context_after": "",
                             }
                         ],
                     },
                     "documentMutated": False,
                     "reloadRequired": False,
                     "trackedChangesSummary": {"total": 2},
                     "errorCode": "ambiguous_match",
                     "candidates": [
                         {
                             "location_label": "表格1 第4行 第8列",
                             "matched_text": "163.20万元",
                             "context_before": "估算总价（不含税）",
                             "context_after": "",
                         }
                     ],
                 }
             ),
         ), \
         patch("app.services.agent_service.litellm.acompletion", return_value=mock_response):
        result = await run_agent_loop(
            document_id="abc123456789",
            user_message="把金额改成 200.00 万元",
            chat_history=[],
            attachments=[],
            ws=mock_ws,
            suggest=True,
        )

    assert result.content is not None and "请告诉我具体要改哪一处" in result.content
    tool_result_event = [call.args[0] for call in mock_ws.send_json.await_args_list if call.args[0]["type"] == "tool_result"][0]
    assert tool_result_event["status"] == "error"
    assert tool_result_event["error_code"] == "ambiguous_match"


@pytest.mark.asyncio
async def test_run_agent_loop_continues_after_recoverable_structured_error():
    from app.services.agent_service import run_agent_loop

    mock_ws = AsyncMock()
    failing_tool_call = MagicMock()
    failing_tool_call.id = "call-format"
    failing_tool_call.function.name = "apply_formatting"
    failing_tool_call.function.arguments = json.dumps({
        "operation": "lists.setType",
        "segment_id": "seg-10",
        "args": {"kind": "ordered"},
    }, ensure_ascii=False)

    first_response = MagicMock()
    first_response.choices[0].message.tool_calls = [failing_tool_call]
    first_response.choices[0].message.model_dump.return_value = {
        "role": "assistant",
        "content": None,
        "tool_calls": [
            {
                "id": "call-format",
                "type": "function",
                "function": {
                    "name": "apply_formatting",
                    "arguments": failing_tool_call.function.arguments,
                },
            }
        ],
    }

    final_response = MagicMock()
    final_response.choices[0].message.tool_calls = None
    final_response.choices[0].message.content = "已改用正确的列表创建步骤继续处理。"
    final_response.choices[0].message.model_dump.return_value = {"role": "assistant", "content": "已改用正确的列表创建步骤继续处理。"}

    with patch("app.services.agent_service.superdoc_service.get_session", new=AsyncMock(return_value=MagicMock())), \
         patch("app.services.agent_service.superdoc_service.get_tools", new=AsyncMock(return_value=[])), \
         patch(
             "app.services.agent_service.superdoc_service.dispatch_tool",
             new=AsyncMock(
                 return_value={
                     "result": {
                         "message": "该列表格式操作只能作用于现有列表项。请先定位到已有列表项，或先使用 lists.create 创建列表。",
                         "error_code": "invalid_target_state",
                         "error_details": {"suggested_operation": "lists.create"},
                     },
                     "documentMutated": False,
                     "reloadRequired": False,
                     "trackedChangesSummary": {"total": 0},
                     "errorCode": "invalid_target_state",
                     "errorDetails": {"suggested_operation": "lists.create"},
                 }
             ),
         ), \
         patch("app.services.agent_service.litellm.acompletion", side_effect=[first_response, final_response]) as mock_completion:
        result = await run_agent_loop(
            document_id="abc123456789",
            user_message="把资格要求整理成正式列表格式",
            chat_history=[],
            attachments=[],
            ws=mock_ws,
            suggest=True,
        )

    assert result.content == "已改用正确的列表创建步骤继续处理。"
    assert mock_completion.await_count == 2
    tool_result_event = [call.args[0] for call in mock_ws.send_json.await_args_list if call.args[0]["type"] == "tool_result"][0]
    assert tool_result_event["status"] == "error"
    assert tool_result_event["error_code"] == "invalid_target_state"
    ai_messages = [call.args[0] for call in mock_ws.send_json.await_args_list if call.args[0]["type"] == "ai_message"]
    assert ai_messages[-1]["content"] == "已改用正确的列表创建步骤继续处理。"


@pytest.mark.asyncio
async def test_run_agent_loop_builds_multimodal_user_message_for_attachments():
    from app.services.agent_service import run_agent_loop

    mock_ws = AsyncMock()
    mock_response = MagicMock()
    mock_response.choices[0].message.tool_calls = None
    mock_response.choices[0].message.content = "已处理图片"
    mock_response.choices[0].message.model_dump.return_value = {"role": "assistant", "content": "已处理图片"}

    with patch("app.services.agent_service.superdoc_service.get_session", new=AsyncMock(return_value=MagicMock())), \
         patch("app.services.agent_service.superdoc_service.get_tools", new=AsyncMock(return_value=[])), \
         patch("app.services.agent_service.document_service.get_chat_asset_preview_data_url", return_value="data:image/jpeg;base64,abc"), \
         patch("app.services.agent_service.litellm.acompletion", return_value=mock_response) as mock_completion:
        result = await run_agent_loop(
            document_id="abc123456789",
            user_message="把这张图插到方法部分",
            chat_history=[],
            attachments=[
                {
                    "asset_id": "asset12345678",
                    "filename": "figure.png",
                    "mime_type": "image/png",
                    "width": 100,
                    "height": 80,
                }
            ],
            ws=mock_ws,
            suggest=True,
        )

    assert result.content == "已处理图片"
    sent_messages = mock_completion.await_args.kwargs["messages"]
    user_content = sent_messages[-1]["content"]
    assert isinstance(user_content, list)
    assert any(part["type"] == "image_url" for part in user_content)


@pytest.mark.asyncio
async def test_run_agent_loop_normalizes_insert_image_asset_id_from_filename():
    from app.services.agent_service import run_agent_loop

    mock_ws = AsyncMock()
    tool_call = MagicMock()
    tool_call.id = "call-img"
    tool_call.function.name = "insert_image_at_anchor"
    tool_call.function.arguments = json.dumps({
        "asset_id": "清掏项目审批表.jpg",
        "anchor_id": "paragraph:20",
        "caption_mode": "auto",
    }, ensure_ascii=False)

    first_response = MagicMock()
    first_response.choices[0].message.tool_calls = [tool_call]
    first_response.choices[0].message.model_dump.return_value = {
        "role": "assistant",
        "content": None,
        "tool_calls": [
            {
                "id": "call-img",
                "type": "function",
                "function": {
                    "name": "insert_image_at_anchor",
                    "arguments": tool_call.function.arguments,
                },
            }
        ],
    }

    final_response = MagicMock()
    final_response.choices[0].message.tool_calls = None
    final_response.choices[0].message.content = "已插图"
    final_response.choices[0].message.model_dump.return_value = {"role": "assistant", "content": "已插图"}

    with patch("app.services.agent_service.superdoc_service.get_session", new=AsyncMock(return_value=MagicMock())), \
         patch("app.services.agent_service.superdoc_service.get_tools", new=AsyncMock(return_value=[])), \
         patch("app.services.agent_service.document_service.get_chat_asset_preview_data_url", return_value="data:image/jpeg;base64,abc"), \
         patch("app.services.agent_service.superdoc_service.dispatch_tool", new=AsyncMock(return_value={
             "result": {"inserted": True},
             "documentMutated": True,
             "reloadRequired": True,
         })) as mock_dispatch, \
         patch("app.services.agent_service.litellm.acompletion", side_effect=[first_response, final_response]):
        result = await run_agent_loop(
            document_id="abc123456789",
            user_message="插图",
            chat_history=[],
            attachments=[{
                "asset_id": "a1b2c3d4e5f6",
                "filename": "清掏项目审批表.jpg",
                "mime_type": "image/jpeg",
                "width": 100,
                "height": 100,
            }],
            ws=mock_ws,
            suggest=True,
        )

    assert result.content == "已插图"
    dispatched_call = mock_dispatch.await_args.args[1]
    dispatched_args = json.loads(dispatched_call["function"]["arguments"])
    assert dispatched_args["asset_id"] == "a1b2c3d4e5f6"


@pytest.mark.asyncio
async def test_run_agent_loop_plan_mode_generates_plan_and_waits_for_confirmation():
    from app.services.agent_service import run_agent_loop

    mock_ws = AsyncMock()
    runtime = AgentRuntimeState()

    tool_call = MagicMock()
    tool_call.id = "call-plan"
    tool_call.function.name = "agent_finish_plan"
    tool_call.function.arguments = json.dumps(
        {
            "title": "更新项目建议书",
            "summary": "先分析目录，再逐节改写。",
            "content": "1. 读取文档大纲\n2. 确认要改写的章节\n3. 逐节执行并校验",
        },
        ensure_ascii=False,
    )

    response = MagicMock()
    response.choices[0].message.tool_calls = [tool_call]
    response.choices[0].message.model_dump.return_value = {
        "role": "assistant",
        "content": None,
        "tool_calls": [
            {
                "id": "call-plan",
                "type": "function",
                "function": {
                    "name": "agent_finish_plan",
                    "arguments": tool_call.function.arguments,
                },
            }
        ],
    }

    with patch("app.services.agent_service.superdoc_service.get_session", new=AsyncMock(return_value=MagicMock())), \
         patch("app.services.agent_service.superdoc_service.get_tools", new=AsyncMock(return_value=[])), \
         patch("app.services.agent_service.litellm.acompletion", return_value=response):
        result = await run_agent_loop(
            document_id="abc123456789",
            user_message="请先给我一份改写计划",
            chat_history=[],
            attachments=[],
            ws=mock_ws,
            suggest=True,
            plan_mode=True,
            runtime=runtime,
        )

    assert result.plan_generated is True
    assert runtime.pending_plan is not None
    events = [call.args[0] for call in mock_ws.send_json.await_args_list]
    assert events[0]["type"] == "agent_phase"
    assert any(event["type"] == "agent_plan" for event in events)
    assert any(event["type"] == "agent_plan_decision_required" for event in events)


@pytest.mark.asyncio
async def test_run_agent_loop_auto_recovers_missing_target_text_for_inline_formatting():
    from app.services.agent_service import run_agent_loop

    mock_ws = AsyncMock()
    formatting_tool_call = MagicMock()
    formatting_tool_call.id = "call-format"
    formatting_tool_call.function.name = "apply_formatting"
    formatting_tool_call.function.arguments = json.dumps(
        {
            "operation": "format.bold",
            "segment_id": "paragraph:2",
            "args": {"value": True},
        },
        ensure_ascii=False,
    )

    first_response = MagicMock()
    first_response.choices[0].message.tool_calls = [formatting_tool_call]
    first_response.choices[0].message.model_dump.return_value = {
        "role": "assistant",
        "content": None,
        "tool_calls": [
            {
                "id": "call-format",
                "type": "function",
                "function": {
                    "name": "apply_formatting",
                    "arguments": formatting_tool_call.function.arguments,
                },
            }
        ],
    }

    final_response = MagicMock()
    final_response.choices[0].message.tool_calls = None
    final_response.choices[0].message.content = "已自动修复格式调整参数并继续执行。"
    final_response.choices[0].message.model_dump.return_value = {"role": "assistant", "content": "已自动修复格式调整参数并继续执行。"}

    dispatch_results = [
        {
            "result": {
                "message": "字符格式调整必须提供 target_text，或设置 apply_to_entire_segment=true。",
                "error_code": "missing_target_text_for_inline_formatting",
                "error_details": {
                    "can_retry_without_user": True,
                    "next_best_action": "retry_same_tool_with_apply_to_entire_segment",
                    "segment_id": "paragraph:2",
                },
            },
            "documentMutated": False,
            "reloadRequired": False,
            "trackedChangesSummary": {"total": 0},
            "errorCode": "missing_target_text_for_inline_formatting",
            "errorDetails": {
                "can_retry_without_user": True,
                "next_best_action": "retry_same_tool_with_apply_to_entire_segment",
                "segment_id": "paragraph:2",
            },
        },
        {
            "result": {
                "mutations_applied": 1,
                "location_label": "正文段落 2",
                "operation": "format.bold",
                "apply_to_entire_segment": True,
            },
            "documentMutated": True,
            "reloadRequired": True,
            "trackedChangesSummary": {"total": 1},
        },
    ]

    with patch("app.services.agent_service.superdoc_service.get_session", new=AsyncMock(return_value=MagicMock())), \
         patch("app.services.agent_service.superdoc_service.get_tools", new=AsyncMock(return_value=[])), \
         patch("app.services.agent_service.superdoc_service.dispatch_tool", new=AsyncMock(side_effect=dispatch_results)) as mock_dispatch, \
         patch("app.services.agent_service.litellm.acompletion", side_effect=[first_response, final_response]):
        result = await run_agent_loop(
            document_id="abc123456789",
            user_message="把这一段加粗",
            chat_history=[],
            attachments=[],
            ws=mock_ws,
            suggest=True,
        )

    assert result.content == "已自动修复格式调整参数并继续执行。"
    assert mock_dispatch.await_count == 2
    retry_call = mock_dispatch.await_args_list[1].args[1]
    retry_args = json.loads(retry_call["function"]["arguments"])
    assert retry_call["function"]["name"] == "apply_formatting"
    assert retry_args["apply_to_entire_segment"] is True
    ai_messages = [call.args[0] for call in mock_ws.send_json.await_args_list if call.args[0]["type"] == "ai_message"]
    assert not any("请告诉我具体要改哪一处" in (message.get("content") or "") for message in ai_messages)


@pytest.mark.asyncio
async def test_run_agent_loop_approved_plan_execution_uses_recovery_mode():
    from app.services.agent_service import run_agent_loop

    mock_ws = AsyncMock()
    runtime = AgentRuntimeState()
    formatting_tool_call = MagicMock()
    formatting_tool_call.id = "call-format-approved"
    formatting_tool_call.function.name = "apply_formatting"
    formatting_tool_call.function.arguments = json.dumps(
        {
            "operation": "format.bold",
            "segment_id": "paragraph:2",
            "args": {"value": True},
        },
        ensure_ascii=False,
    )

    first_response = MagicMock()
    first_response.choices[0].message.tool_calls = [formatting_tool_call]
    first_response.choices[0].message.model_dump.return_value = {
        "role": "assistant",
        "content": None,
        "tool_calls": [
            {
                "id": "call-format-approved",
                "type": "function",
                "function": {
                    "name": "apply_formatting",
                    "arguments": formatting_tool_call.function.arguments,
                },
            }
        ],
    }

    final_response = MagicMock()
    final_response.choices[0].message.tool_calls = None
    final_response.choices[0].message.content = "已按批准计划自动完成格式处理。"
    final_response.choices[0].message.model_dump.return_value = {"role": "assistant", "content": "已按批准计划自动完成格式处理。"}

    dispatch_results = [
        {
            "result": {
                "message": "字符格式调整必须提供 target_text，或设置 apply_to_entire_segment=true。",
                "error_code": "missing_target_text_for_inline_formatting",
                "error_details": {
                    "can_retry_without_user": True,
                    "next_best_action": "retry_same_tool_with_apply_to_entire_segment",
                    "segment_id": "paragraph:2",
                },
            },
            "documentMutated": False,
            "reloadRequired": False,
            "trackedChangesSummary": {"total": 0},
            "errorCode": "missing_target_text_for_inline_formatting",
            "errorDetails": {
                "can_retry_without_user": True,
                "next_best_action": "retry_same_tool_with_apply_to_entire_segment",
                "segment_id": "paragraph:2",
            },
        },
        {
            "result": {
                "mutations_applied": 1,
                "location_label": "正文段落 2",
                "operation": "format.bold",
                "apply_to_entire_segment": True,
            },
            "documentMutated": True,
            "reloadRequired": True,
            "trackedChangesSummary": {"total": 1},
        },
    ]

    with patch("app.services.agent_service.superdoc_service.get_session", new=AsyncMock(return_value=MagicMock())), \
         patch("app.services.agent_service.superdoc_service.get_tools", new=AsyncMock(return_value=[])), \
         patch("app.services.agent_service.superdoc_service.dispatch_tool", new=AsyncMock(side_effect=dispatch_results)), \
         patch("app.services.agent_service.litellm.acompletion", side_effect=[first_response, final_response]):
        result = await run_agent_loop(
            document_id="abc123456789",
            user_message="执行已批准计划",
            chat_history=[],
            attachments=[],
            ws=mock_ws,
            suggest=True,
            approved_plan_execution=True,
            runtime=runtime,
        )

    assert result.content == "已按批准计划自动完成格式处理。"
    assert runtime.execution_strategy == "approved_plan_execution"


@pytest.mark.asyncio
async def test_run_agent_loop_blocks_mutation_tools_in_plan_mode():
    from app.services.agent_service import run_agent_loop

    mock_ws = AsyncMock()
    runtime = AgentRuntimeState()

    tool_call = MagicMock()
    tool_call.id = "call-mutate"
    tool_call.function.name = "replace_text"
    tool_call.function.arguments = json.dumps(
        {
            "target": "旧标题",
            "replacement": "新标题",
            "segment_id": "paragraph:1",
            "context_before": "",
            "context_after": "",
        },
        ensure_ascii=False,
    )

    response = MagicMock()
    response.choices[0].message.tool_calls = [tool_call]
    response.choices[0].message.model_dump.return_value = {
        "role": "assistant",
        "content": None,
        "tool_calls": [
            {
                "id": "call-mutate",
                "type": "function",
                "function": {
                    "name": "replace_text",
                    "arguments": tool_call.function.arguments,
                },
            }
        ],
    }

    final_response = MagicMock()
    final_response.choices[0].message.tool_calls = None
    final_response.choices[0].message.content = "已停留在计划阶段。"
    final_response.choices[0].message.model_dump.return_value = {"role": "assistant", "content": "已停留在计划阶段。"}

    with patch("app.services.agent_service.superdoc_service.get_session", new=AsyncMock(return_value=MagicMock())), \
         patch("app.services.agent_service.superdoc_service.get_tools", new=AsyncMock(return_value=[])), \
         patch("app.services.agent_service.litellm.acompletion", side_effect=[response, final_response]), \
         patch("app.services.agent_service.superdoc_service.dispatch_tool", new=AsyncMock()) as mock_dispatch:
        result = await run_agent_loop(
            document_id="abc123456789",
            user_message="先规划，不要执行",
            chat_history=[],
            attachments=[],
            ws=mock_ws,
            suggest=True,
            plan_mode=True,
            runtime=runtime,
        )

    assert result.content == "已生成计划，请确认是否执行。"
    assert mock_dispatch.await_count == 0
    tool_result_event = [call.args[0] for call in mock_ws.send_json.await_args_list if call.args[0]["type"] == "tool_result"][0]
    assert tool_result_event["error_code"] == "tool_forbidden_in_plan_mode"
