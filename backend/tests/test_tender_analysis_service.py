from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.services.tender_analysis_service import (
    AnalysisRunState,
    TenderAnalysisService,
    _normalize_evidence_list,
    _normalize_timeline_node,
)


class DummyCrewRunner:
    async def run_stage(self, *, stage, document_name, context, previous_results, snapshot):
        if stage == "inventory":
            return MagicMock(
                summary="已建立文档结构地图",
                preview={"key_sections": ["项目概况", "开标安排"]},
                data={"document_meta": {"outline_summary": "共 8 个主章节", "key_sections": ["项目概况", "开标安排"]}},
            )
        if stage == "core_facts":
            return MagicMock(
                summary="已提取核心项目事实",
                preview={"project_name": "测试项目"},
                data={
                    "project_overview": {
                        "project_name": {
                            "value": "测试项目",
                            "status": "confirmed",
                            "confidence": 0.92,
                            "evidence": [{"excerpt": "项目名称：测试项目", "source_path": "第一章", "confidence": 0.92}],
                        }
                    },
                    "commercial_terms": {
                        "budget": {
                            "value": "100万元",
                            "status": "confirmed",
                            "confidence": 0.88,
                            "evidence": [{"excerpt": "预算金额：100万元", "source_path": "第一章", "confidence": 0.88}],
                        }
                    },
                    "lots": [{"name": "第一标段"}],
                    "contacts": [{"name": "张三", "phone": "18800000000"}],
                },
            )
        if stage == "timeline":
            return MagicMock(
                summary="已提取关键时间线",
                preview={"next_deadline": "2026-04-10T09:30:00+08:00"},
                data={
                    "timeline": {
                        "nodes": [
                            {
                                "id": "open-bid",
                                "event_type": "bid_opening",
                                "label": "开标",
                                "date": "2026-04-10",
                                "time": "09:30",
                                "datetime_iso": "2026-04-10T09:30:00+08:00",
                                "status": "confirmed",
                                "confidence": 0.91,
                                "evidence": [
                                    {"excerpt": "开标时间：2026年4月10日09:30", "source_path": "第二章", "confidence": 0.91}
                                ],
                            }
                        ],
                        "conflicts": [],
                    },
                    "deadline_todos": [{"id": "todo-1", "title": "开标前复核盖章", "status": "open"}],
                },
            )
        if stage == "requirements":
            return MagicMock(
                summary="已归纳资格与提交要求",
                preview={"qualification_count": 1},
                data={
                    "qualification_requirements": [{"title": "具备有效营业执照", "status": "confirmed"}],
                    "technical_scope": {
                        "summary": {
                            "value": "提供软件实施与培训",
                            "status": "confirmed",
                            "confidence": 0.85,
                            "evidence": [{"excerpt": "实施与培训服务", "source_path": "第三章", "confidence": 0.85}],
                        },
                        "items": [{"title": "软件实施"}],
                    },
                    "submission_requirements": [{"title": "投标文件需加盖公章", "status": "confirmed"}],
                },
            )
        if stage == "risk_review":
            return MagicMock(
                summary="已完成风险复核",
                preview={"risk_count": 1},
                data={
                    "evaluation_criteria": [{"title": "综合评分法"}],
                    "compliance_flags": [{"title": "保证金需按时缴纳"}],
                    "risk_register": [{"id": "risk-1", "title": "答疑截止时间未明确时分", "severity": "medium"}],
                    "open_questions": [{"id": "question-1", "question": "是否支持联合体投标？"}],
                },
            )
        raise AssertionError(f"Unexpected stage {stage}")


@pytest.mark.asyncio
async def test_run_extraction_uses_crewai_and_persists_snapshot():
    service = TenderAnalysisService()
    service._crew_runner = DummyCrewRunner()
    run = AnalysisRunState(id="job123456789", document_id="abc123456789", document_name="测试项目.docx")

    markdown = """
## 项目概况
项目名称：测试项目
预算金额：100万元
联系人：张三
电话：18800000000
""".strip()

    with patch("app.services.tender_analysis_service._fetch_document_context", new=AsyncMock(return_value={"outline": {}, "markdown": markdown})), \
         patch("app.services.tender_analysis_service.document_service.save_analysis_payload") as save_payload, \
         patch("app.services.tender_analysis_service.realtime_service.broadcast", new=AsyncMock()) as broadcast:
        await service._run_extraction(run)

    assert run.status == "succeeded"
    assert run.completed_step_count == 5
    assert run.snapshot is not None
    assert run.snapshot["document_meta"]["source"] == "crewai"
    assert run.snapshot["project_overview"]["project_name"]["value"] == "测试项目"
    assert run.snapshot["project_overview"]["project_name"]["evidence"][0]["source_excerpt"] == "项目名称：测试项目"
    assert run.snapshot["project_overview"]["project_name"]["evidence"][0]["source_section_path"] != ""
    assert run.snapshot["timeline"]["nodes"][0]["label"] == "开标"
    assert len(run.snapshot["risk_register"]) == 1
    assert run.snapshot["contacts"][0]["name"]["value"] == "张三"
    assert run.snapshot["contacts"][0]["name"]["evidence"][0]["source_excerpt"] != ""
    assert save_payload.call_count == 2

    event_types = [call.args[1]["type"] for call in broadcast.await_args_list]
    assert "tender_analysis_run" in event_types
    assert "tender_analysis_run_complete" in event_types
    assert event_types.count("tender_analysis_step") == 5
    assert event_types.count("tender_analysis_step_update") == 5


@pytest.mark.asyncio
async def test_run_extraction_marks_failed_step_on_crewai_error():
    service = TenderAnalysisService()
    service._crew_runner = MagicMock()
    service._crew_runner.run_stage = AsyncMock(side_effect=ValueError("未配置 LITELLM_API_KEY，无法启动 CrewAI 招标提取团队。"))
    run = AnalysisRunState(id="job123456789", document_id="abc123456789", document_name="测试项目.docx")

    with patch("app.services.tender_analysis_service._fetch_document_context", new=AsyncMock(return_value={"outline": {}, "markdown": "# 文档"})), \
         patch("app.services.tender_analysis_service.realtime_service.broadcast", new=AsyncMock()) as broadcast:
        await service._run_extraction(run)

    assert run.status == "failed"
    assert run.steps[-1].status == "failed"
    assert "LITELLM_API_KEY" in (run.error or "")
    event_types = [call.args[1]["type"] for call in broadcast.await_args_list]
    assert "tender_analysis_run_failed" in event_types


def test_patch_snapshot_value_updates_latest_job_snapshot():
    service = TenderAnalysisService()
    run = AnalysisRunState(id="job123456789", document_id="abc123456789", document_name="测试项目.docx")
    run.snapshot = {
        "document_meta": {"document_id": "abc123456789", "document_name": "测试项目.docx"},
        "project_overview": {},
        "lots": [{"name": "第一标段"}],
        "timeline": {"nodes": [], "conflicts": []},
        "contacts": [],
        "commercial_terms": {},
        "qualification_requirements": [],
        "technical_scope": {"summary": {}, "items": []},
        "submission_requirements": [],
        "evaluation_criteria": [],
        "compliance_flags": [],
        "risk_register": [],
        "open_questions": [],
        "deadline_todos": [],
        "evidence_index": {},
    }
    service._jobs[run.id] = run
    service._latest_job_by_document[run.document_id] = run.id

    with patch("app.services.tender_analysis_service.document_service.save_analysis_payload") as save_payload:
        snapshot = service.patch_snapshot_value(run.document_id, "lots", [{"name": "第二标段"}])

    assert snapshot["lots"] == [{"name": "第二标段"}]
    assert run.snapshot["lots"] == [{"name": "第二标段"}]
    save_payload.assert_called_once()


def test_patch_field_preserves_existing_field_evidence():
    service = TenderAnalysisService()
    service._jobs["job123456789"] = AnalysisRunState(id="job123456789", document_id="abc123456789", document_name="测试项目.docx")
    service._latest_job_by_document["abc123456789"] = "job123456789"
    service._jobs["job123456789"].snapshot = {
        "document_meta": {"document_id": "abc123456789", "document_name": "测试项目.docx"},
        "project_overview": {
            "project_name": {
                "value": "测试项目",
                "status": "confirmed",
                "confidence": 0.93,
                "evidence": [{"source_excerpt": "项目名称：测试项目", "source_section_path": "项目概况", "matched_text": "测试项目", "confidence": 0.93}],
                "candidate_values": [],
            }
        },
        "lots": [],
        "timeline": {"nodes": [], "conflicts": []},
        "contacts": [],
        "commercial_terms": {},
        "qualification_requirements": [],
        "technical_scope": {"summary": {"value": "", "status": "missing", "confidence": 0.0, "evidence": [], "candidate_values": []}, "items": []},
        "submission_requirements": [],
        "evaluation_criteria": [],
        "compliance_flags": [],
        "risk_register": [],
        "open_questions": [],
        "deadline_todos": [],
        "evidence_index": {},
    }

    snapshot = service.patch_field("abc123456789", "project_overview.project_name", "新测试项目")

    assert snapshot["project_overview"]["project_name"]["value"] == "新测试项目"
    assert snapshot["project_overview"]["project_name"]["evidence"][0]["source_excerpt"] == "项目名称：测试项目"


def test_normalize_evidence_list_preserves_aliases():
    evidence = _normalize_evidence_list(
        [
            {
                "excerpt": "项目名称：测试项目",
                "source_path": "项目概况 / 项目名称",
                "confidence": 0.92,
            }
        ]
    )

    assert evidence[0]["source_excerpt"] == "项目名称：测试项目"
    assert evidence[0]["source_section_path"] == "项目概况 / 项目名称"
    assert evidence[0]["matched_text"] == "项目名称：测试项目"


def test_normalize_evidence_list_accepts_textual_confidence():
    evidence = _normalize_evidence_list(
        [
            {
                "source_excerpt": "采购方式：公开招标",
                "source_section_path": "项目概况 / 采购方式",
                "confidence": "high",
            }
        ]
    )

    assert evidence[0]["confidence"] == pytest.approx(0.9)


def test_normalize_timeline_node_accepts_percentage_confidence():
    node = _normalize_timeline_node(
        {
            "label": "开标",
            "confidence": "85%",
        },
        0,
    )

    assert node["confidence"] == pytest.approx(0.85)
