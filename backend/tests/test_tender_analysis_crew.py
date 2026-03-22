from types import SimpleNamespace

import pytest
from crewai import LLM, Process

from app.config import settings
from app.services.tender_analysis_crew import (
    StageEnvelope,
    TenderAnalysisCrewRunner,
    _apply_openai_compatible_env,
    build_tender_analysis_llm,
)


def test_build_tender_analysis_llm_uses_settings(monkeypatch):
    monkeypatch.setattr(settings, "litellm_model", "openai/test-model")
    monkeypatch.setattr(settings, "litellm_api_key", "test-key")
    monkeypatch.setattr(settings, "litellm_api_base", "https://example.com/v1")

    llm = build_tender_analysis_llm()

    assert llm.model == "openai/test-model"
    assert llm.api_key == "test-key"
    assert llm.base_url == "https://example.com/v1"


def test_apply_openai_compatible_env(monkeypatch):
    monkeypatch.setattr(settings, "litellm_api_key", "env-key")
    monkeypatch.setattr(settings, "litellm_api_base", "https://proxy.example/v1")

    _apply_openai_compatible_env()

    import os

    assert os.environ["OPENAI_API_KEY"] == "env-key"
    assert os.environ["OPENAI_BASE_URL"] == "https://proxy.example/v1"
    assert os.environ["OPENAI_API_BASE"] == "https://proxy.example/v1"


def test_build_tender_analysis_llm_requires_api_key(monkeypatch):
    monkeypatch.setattr(settings, "litellm_api_key", "")

    with pytest.raises(ValueError, match="LITELLM_API_KEY"):
        build_tender_analysis_llm()


def test_build_stage_crew_returns_sequential_crew(monkeypatch):
    monkeypatch.setattr(settings, "crewai_verbose", False)

    runner = TenderAnalysisCrewRunner(llm=LLM(model="openai/test", api_key="test-key", base_url="https://example.com/v1"))
    crew, task = runner.build_stage_crew(
        stage="timeline",
        document_name="测试招标文件",
        context={"outline": {"sections": []}, "markdown": "## 开标时间\n2026年4月10日 09:30"},
        previous_results={"core_facts": {"summary": "已提取项目概况"}},
        snapshot={"document_meta": {"document_name": "测试招标文件"}},
    )

    assert len(runner.agents) == 5
    assert len(crew.tasks) == 1
    assert crew.process == Process.sequential
    assert crew.planning is False
    assert task.output_pydantic is None


def test_extract_envelope_from_raw_json():
    output = SimpleNamespace(
        pydantic=None,
        json_dict=None,
        raw='{"summary":"ok","preview_json":"{\\"a\\":1}","data_json":"{\\"b\\":2}"}',
    )

    envelope = TenderAnalysisCrewRunner._extract_envelope(output)

    assert isinstance(envelope, StageEnvelope)
    assert envelope.summary == "ok"
    assert envelope.preview_json == '{"a":1}'
    assert envelope.data_json == '{"b":2}'


def test_extract_envelope_from_raw_json_with_trailing_text():
    output = SimpleNamespace(
        pydantic=None,
        json_dict=None,
        raw='{"summary":"ok","preview_json":"{\\"a\\":1}","data_json":"{\\"b\\":2}"} trailing text',
    )

    envelope = TenderAnalysisCrewRunner._extract_envelope(output)

    assert envelope.summary == "ok"
    assert envelope.preview_json == '{"a":1}'


def test_parse_json_object():
    assert TenderAnalysisCrewRunner._parse_json_object('{"a":1}', field_name="preview_json") == {"a": 1}


def test_parse_json_object_repairs_minor_damage():
    repaired = TenderAnalysisCrewRunner._parse_json_object('{"a":1 "b":2}', field_name="data_json")
    assert repaired == {"a": 1, "b": 2}
