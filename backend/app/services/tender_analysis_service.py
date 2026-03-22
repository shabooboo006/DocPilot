import asyncio
import json
import logging
import re
import uuid
from copy import deepcopy
from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import Any

from app.services import document_service
from app.services.realtime_service import realtime_service
from app.services.superdoc_service import superdoc_service
from app.services.tender_analysis_crew import TenderAnalysisCrewRunner

logger = logging.getLogger(__name__)

STAGES = [
    ("inventory", "Document Inventory", "建立目录、标题层级与关键文档区域地图。"),
    ("core_facts", "Core Facts", "提取项目概况、主体、预算、标段与联系人。"),
    ("timeline", "Timeline Extraction", "提取招标时间线和关键里程碑。"),
    ("requirements", "Requirements Extraction", "提取资格、商务、技术和投标文件要求。"),
    ("risk_review", "Conflict & Risk Review", "复核评标、合规、冲突、缺失和高风险事项。"),
]


def _utc_now() -> str:
    return datetime.now(UTC).isoformat()


def _make_field(
    value: Any = None,
    *,
    status: str = "missing",
    confidence: float = 0.0,
    evidence: list[dict[str, Any]] | None = None,
    candidate_values: list[Any] | None = None,
) -> dict[str, Any]:
    return {
        "value": value,
        "status": status,
        "confidence": confidence,
        "evidence": evidence or [],
        "candidate_values": candidate_values or [],
    }


CONFIDENCE_LEVELS = {
    "very_high": 0.98,
    "high": 0.9,
    "medium": 0.65,
    "low": 0.35,
    "very_low": 0.15,
    "confirmed": 1.0,
    "inferred": 0.65,
    "conflicting": 0.4,
    "missing": 0.0,
}


def _coerce_confidence(value: Any, default: float = 0.0) -> float:
    if isinstance(value, bool):
        return 1.0 if value else 0.0
    if isinstance(value, (int, float)):
        return float(value)
    if isinstance(value, str):
        normalized = value.strip().lower()
        if not normalized:
            return default
        if normalized.endswith("%"):
            try:
                return float(normalized[:-1]) / 100
            except ValueError:
                return default
        if normalized in CONFIDENCE_LEVELS:
            return CONFIDENCE_LEVELS[normalized]
        try:
            return float(normalized)
        except ValueError:
            return default
    return default


def _default_snapshot(document_id: str, document_name: str) -> dict[str, Any]:
    return {
        "document_meta": {
            "document_id": document_id,
            "document_name": document_name,
            "source": "crewai",
            "extracted_at": _utc_now(),
        },
        "project_overview": {
            "project_name": _make_field(),
            "project_code": _make_field(),
            "tenderer": _make_field(),
            "agency": _make_field(),
            "region": _make_field(),
            "procurement_method": _make_field(),
        },
        "lots": [],
        "timeline": {"nodes": [], "conflicts": []},
        "contacts": [],
        "commercial_terms": {
            "budget": _make_field(),
            "maximum_price": _make_field(),
            "bid_bond": _make_field(),
            "delivery_term": _make_field(),
        },
        "qualification_requirements": [],
        "technical_scope": {"summary": _make_field(), "items": []},
        "submission_requirements": [],
        "evaluation_criteria": [],
        "compliance_flags": [],
        "risk_register": [],
        "open_questions": [],
        "deadline_todos": [],
        "evidence_index": {},
    }


def _walk_field_entries(data: Any, path: str = ""):
    if isinstance(data, dict):
        if {"value", "status", "confidence", "evidence"}.issubset(data.keys()):
            yield path, data
            return
        for key, value in data.items():
            next_path = f"{path}.{key}" if path else key
            yield from _walk_field_entries(value, next_path)
    elif isinstance(data, list):
        for index, value in enumerate(data):
            next_path = f"{path}[{index}]"
            yield from _walk_field_entries(value, next_path)


def _build_evidence_index(snapshot: dict[str, Any]) -> dict[str, list[dict[str, Any]]]:
    index: dict[str, list[dict[str, Any]]] = {}
    for path, field in _walk_field_entries(snapshot):
        evidence = field.get("evidence") or []
        if evidence:
            index[path] = evidence

    for node in snapshot.get("timeline", {}).get("nodes", []):
        node_id = node.get("id")
        if node_id and node.get("evidence"):
            index[f"timeline.nodes.{node_id}"] = node["evidence"]

    return index


def _count_confirmed_fields(snapshot: dict[str, Any]) -> int:
    count = 0
    for _, field in _walk_field_entries(snapshot):
        if field.get("status") in {"confirmed", "user_edited"} and field.get("value") not in (None, "", []):
            count += 1
    return count


def _deep_merge(base: Any, override: Any) -> Any:
    if isinstance(base, dict) and isinstance(override, dict):
        merged = deepcopy(base)
        for key, value in override.items():
            merged[key] = _deep_merge(merged.get(key), value)
        return merged
    if isinstance(base, list) and isinstance(override, list):
        return override
    return override if override is not None else base


def _ensure_field(value: Any) -> dict[str, Any]:
    if isinstance(value, dict) and {"value", "status", "confidence", "evidence"}.issubset(value.keys()):
        normalized = dict(value)
        normalized["confidence"] = _coerce_confidence(normalized.get("confidence"))
        normalized.setdefault("candidate_values", [])
        return normalized

    if value in (None, "", []):
        return _make_field()

    return _make_field(value, status="inferred", confidence=0.55)


def _normalize_field_mapping(payload: dict[str, Any], keys: list[str], *, markdown: str, labels: dict[str, str]) -> dict[str, Any]:
    normalized = {}
    for key in keys:
        normalized[key] = _normalize_field_evidence(payload.get(key), markdown=markdown, label=labels.get(key))
    return normalized


def _normalize_evidence_list(items: Any) -> list[dict[str, Any]]:
    if not isinstance(items, list):
        return []
    normalized: list[dict[str, Any]] = []
    for item in items:
        if not isinstance(item, dict):
            continue
        excerpt = item.get("excerpt") or item.get("source_excerpt") or item.get("text") or ""
        source_path = item.get("source_path") or item.get("source_section_path") or item.get("section") or ""
        normalized.append(
            {
                "excerpt": excerpt,
                "source_excerpt": item.get("source_excerpt") or excerpt,
                "source_path": source_path,
                "source_section_path": item.get("source_section_path") or source_path,
                "matched_text": item.get("matched_text") or item.get("text") or excerpt,
                "table_cell_reference": item.get("table_cell_reference") or item.get("table_cell") or "",
                "confidence": _coerce_confidence(item.get("confidence")),
            }
        )
    return normalized


PROJECT_FIELD_LABELS = {
    "project_name": "项目名称",
    "project_code": "项目编号",
    "tenderer": "采购人",
    "agency": "代理机构",
    "region": "区域",
    "procurement_method": "采购方式",
}

COMMERCIAL_FIELD_LABELS = {
    "budget": "预算金额",
    "maximum_price": "最高限价",
    "bid_bond": "投标保证金",
    "delivery_term": "交付周期",
}


def _compact_text(text: str) -> str:
    return re.sub(r"\s+", "", text).strip()


def _heading_label_from_line(line: str) -> str | None:
    text = line.strip().lstrip("#").strip()
    if not text:
        return None
    if re.match(r"^[一二三四五六七八九十]+、", text):
        return text
    if re.match(r"^[（(][一二三四五六七八九十]+[)）]", text):
        return text
    if re.match(r"^\d+[.、]", text):
        return text
    if len(text) <= 32 and not re.search(r"[:：]", text):
        return text
    return None


def _build_source_path(markdown: str, match_index: int) -> str:
    prefix = markdown[:match_index]
    heading_chain: list[str] = []
    for raw_line in prefix.splitlines():
        heading = _heading_label_from_line(raw_line)
        if heading:
            heading_chain.append(heading)
    if not heading_chain:
        return "文档 markdown 摘要"
    return " / ".join(heading_chain[-3:])


def _make_synthetic_evidence(markdown: str, *, value: Any, label: str | None = None) -> list[dict[str, Any]]:
    if not isinstance(value, str):
        return []
    target = _compact_text(value)
    if not target:
        return []

    compact_markdown = _compact_text(markdown)
    match_index = compact_markdown.find(target)
    if match_index < 0 and label:
        match_index = compact_markdown.find(_compact_text(label))
    if match_index < 0:
        return []

    raw_index = markdown.find(value)
    if raw_index < 0 and label:
        raw_index = markdown.find(label)
    if raw_index < 0:
        raw_index = 0

    start = max(0, raw_index - 120)
    end = min(len(markdown), raw_index + max(len(value), len(label or value)) + 120)
    excerpt = markdown[start:end].strip()
    source_path = _build_source_path(markdown, raw_index)
    return [
        {
            "excerpt": excerpt,
            "source_excerpt": excerpt,
            "source_path": source_path,
            "source_section_path": source_path,
            "matched_text": value,
            "confidence": 0.78,
        }
    ]


def _normalize_field_evidence(field: Any, *, markdown: str, label: str | None = None) -> dict[str, Any]:
    normalized = _ensure_field(field)
    evidence = _normalize_evidence_list(normalized.get("evidence"))
    if not evidence:
        evidence = _make_synthetic_evidence(markdown, value=normalized.get("value"), label=label)

    normalized["evidence"] = evidence
    if normalized.get("value") in (None, "", []) and not evidence:
        normalized["status"] = "missing"
        normalized["confidence"] = 0.0
        return normalized

    if evidence and normalized.get("status") not in {"confirmed", "user_edited"}:
        normalized["status"] = "inferred"
        normalized["confidence"] = max(_coerce_confidence(normalized.get("confidence")), 0.65)
    elif not evidence and normalized.get("status") == "confirmed":
        normalized["status"] = "inferred"
        normalized["confidence"] = max(_coerce_confidence(normalized.get("confidence")), 0.55)

    return normalized


def _normalize_timeline_node(node: Any, index: int) -> dict[str, Any]:
    if not isinstance(node, dict):
        node = {}
    return {
        "id": node.get("id") or uuid.uuid4().hex[:10],
        "event_type": node.get("event_type") or "milestone",
        "label": node.get("label") or f"节点 {index + 1}",
        "date": node.get("date"),
        "time": node.get("time"),
        "datetime_iso": node.get("datetime_iso"),
        "lots": node.get("lots") if isinstance(node.get("lots"), list) else [],
        "status": node.get("status") or "missing",
        "confidence": _coerce_confidence(node.get("confidence")),
        "urgency": node.get("urgency") or "normal",
        "is_critical": bool(node.get("is_critical") or node.get("isCritical") or False),
        "dependencies": node.get("dependencies") if isinstance(node.get("dependencies"), list) else [],
        "candidate_values": node.get("candidate_values") if isinstance(node.get("candidate_values"), list) else [],
        "evidence": _normalize_evidence_list(node.get("evidence")),
        "user_note": node.get("user_note") or "",
    }


def _normalize_list_of_dicts(items: Any) -> list[dict[str, Any]]:
    return [item for item in items if isinstance(item, dict)] if isinstance(items, list) else []


def _normalize_contact_item(item: Any, *, markdown: str) -> dict[str, Any] | None:
    if not isinstance(item, dict):
        return None

    normalized = dict(item)
    normalized["name"] = _normalize_field_evidence(
        normalized.get("name") or normalized.get("contact_name") or normalized.get("person"),
        markdown=markdown,
        label="联系人",
    )
    normalized["role"] = _normalize_field_evidence(
        normalized.get("role") or normalized.get("title") or normalized.get("department"),
        markdown=markdown,
        label="联系人角色",
    )
    normalized["phone"] = _normalize_field_evidence(
        normalized.get("phone") or normalized.get("mobile") or normalized.get("telephone"),
        markdown=markdown,
        label="联系电话",
    )
    normalized["email"] = _normalize_field_evidence(
        normalized.get("email") or normalized.get("mail"),
        markdown=markdown,
        label="邮箱",
    )
    return normalized


def _normalize_stage_result(stage: str, result: dict[str, Any], *, markdown: str) -> dict[str, Any]:
    if stage == "inventory":
        meta = result.get("document_meta", {})
        if not isinstance(meta, dict):
            meta = {}
        meta["source"] = "crewai"
        meta["extracted_at"] = _utc_now()
        return {"document_meta": meta}

    if stage == "core_facts":
        return {
            "project_overview": _normalize_field_mapping(
                result.get("project_overview", {}),
                ["project_name", "project_code", "tenderer", "agency", "region", "procurement_method"],
                markdown=markdown,
                labels=PROJECT_FIELD_LABELS,
            ),
            "lots": _normalize_list_of_dicts(result.get("lots")),
            "contacts": [
                contact
                for contact in (
                    _normalize_contact_item(item, markdown=markdown)
                    for item in _normalize_list_of_dicts(result.get("contacts"))
                )
                if contact is not None
            ],
            "commercial_terms": _normalize_field_mapping(
                result.get("commercial_terms", {}),
                ["budget", "maximum_price", "bid_bond", "delivery_term"],
                markdown=markdown,
                labels=COMMERCIAL_FIELD_LABELS,
            ),
        }

    if stage == "timeline":
        timeline = result.get("timeline", {})
        if not isinstance(timeline, dict):
            timeline = {}
        nodes = [_normalize_timeline_node(node, index) for index, node in enumerate(timeline.get("nodes", []))]
        conflicts = _normalize_list_of_dicts(timeline.get("conflicts"))
        todos = _normalize_list_of_dicts(result.get("deadline_todos"))
        return {
            "timeline": {
                "nodes": nodes,
                "conflicts": conflicts,
            },
            "deadline_todos": todos,
        }

    if stage == "requirements":
        technical_scope = result.get("technical_scope", {})
        if not isinstance(technical_scope, dict):
            technical_scope = {}
        return {
            "qualification_requirements": _normalize_list_of_dicts(result.get("qualification_requirements")),
            "technical_scope": {
                "summary": _ensure_field(technical_scope.get("summary")),
                "items": _normalize_list_of_dicts(technical_scope.get("items")),
            },
            "submission_requirements": _normalize_list_of_dicts(result.get("submission_requirements")),
        }

    if stage == "risk_review":
        return {
            "evaluation_criteria": _normalize_list_of_dicts(result.get("evaluation_criteria")),
            "compliance_flags": _normalize_list_of_dicts(result.get("compliance_flags")),
            "risk_register": _normalize_list_of_dicts(result.get("risk_register")),
            "open_questions": _normalize_list_of_dicts(result.get("open_questions")),
        }

    return result


def _set_by_path(data: dict[str, Any], field_path: str, value: Any) -> None:
    segments = field_path.replace("[", ".[").split(".")
    current: Any = data
    for index, raw_segment in enumerate(segment for segment in segments if segment):
        is_last = index == len([segment for segment in segments if segment]) - 1
        if raw_segment.startswith("[") and raw_segment.endswith("]"):
            list_index = int(raw_segment[1:-1])
            if is_last:
                current[list_index] = value
                return
            current = current[list_index]
            continue

        if is_last:
            current[raw_segment] = value
            return
        current = current[raw_segment]


async def _dispatch_read_tool(document_id: str, name: str, arguments: dict[str, Any] | None = None) -> dict[str, Any]:
    session = await superdoc_service.get_session(document_id, suggest=True)
    payload = {
        "id": f"tender-{name}",
        "type": "function",
        "function": {
            "name": name,
            "arguments": json.dumps(arguments or {}, ensure_ascii=False),
        },
    }
    response = await superdoc_service.dispatch_tool(session, payload)
    return response.get("result", response)


async def _fetch_document_context(document_id: str, document_name: str) -> dict[str, Any]:
    outline_result, markdown_result = await asyncio.gather(
        _dispatch_read_tool(document_id, "get_document_outline"),
        _dispatch_read_tool(document_id, "get_document_markdown"),
    )
    markdown = (
        markdown_result.get("markdown")
        or markdown_result.get("content")
        or markdown_result.get("text")
        or ""
    )
    return {
        "document_id": document_id,
        "document_name": document_name,
        "outline": outline_result,
        "markdown": markdown[:120000],
    }


@dataclass
class AnalysisStepState:
    id: str
    stage: str
    title: str
    description: str
    status: str = "pending"
    started_at: str | None = None
    updated_at: str | None = None
    events: list[dict[str, Any]] = field(default_factory=list)
    preview_payload: dict[str, Any] | None = None
    error: str | None = None

    def as_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "stage": self.stage,
            "title": self.title,
            "description": self.description,
            "status": self.status,
            "startedAt": self.started_at,
            "updatedAt": self.updated_at,
            "events": self.events,
            "previewPayload": self.preview_payload,
            "error": self.error,
        }


@dataclass
class AnalysisRunState:
    id: str
    document_id: str
    document_name: str
    status: str = "queued"
    current_stage: str | None = None
    started_at: str = field(default_factory=_utc_now)
    updated_at: str = field(default_factory=_utc_now)
    summary: str = ""
    completed_step_count: int = 0
    risk_count: int = 0
    confirmed_field_count: int = 0
    steps: list[AnalysisStepState] = field(default_factory=list)
    snapshot: dict[str, Any] | None = None
    thread_id: str | None = None
    error: str | None = None

    def as_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "documentId": self.document_id,
            "documentName": self.document_name,
            "status": self.status,
            "currentStage": self.current_stage,
            "startedAt": self.started_at,
            "updatedAt": self.updated_at,
            "summary": self.summary,
            "completedStepCount": self.completed_step_count,
            "riskCount": self.risk_count,
            "confirmedFieldCount": self.confirmed_field_count,
            "steps": [step.as_dict() for step in self.steps],
            "threadId": self.thread_id,
            "error": self.error,
        }


class TenderAnalysisService:
    def __init__(self) -> None:
        self._jobs: dict[str, AnalysisRunState] = {}
        self._latest_job_by_document: dict[str, str] = {}
        self._crew_runner: TenderAnalysisCrewRunner | None = None

    def get_latest_job(self, document_id: str) -> AnalysisRunState | None:
        job_id = self._latest_job_by_document.get(document_id)
        if not job_id:
            return None
        return self._jobs.get(job_id)

    def get_job(self, job_id: str) -> AnalysisRunState | None:
        return self._jobs.get(job_id)

    async def start_extraction(self, document_id: str, force_refresh: bool = False) -> AnalysisRunState:
        info = document_service.get_document_info(document_id)
        document_name = str(info.get("name") or document_id)
        existing = None if force_refresh else self.get_latest_job(document_id)
        if existing and existing.status in {"queued", "running"}:
            return existing

        run = AnalysisRunState(
            id=uuid.uuid4().hex[:12],
            document_id=document_id,
            document_name=document_name,
            status="queued",
            summary="等待启动招标提取任务。",
        )
        self._jobs[run.id] = run
        self._latest_job_by_document[document_id] = run.id
        asyncio.create_task(self._run_extraction(run))
        return run

    async def _emit(self, document_id: str, payload: dict[str, Any]) -> None:
        await realtime_service.broadcast(document_id, payload)

    async def _emit_run(self, run: AnalysisRunState, event_type: str) -> None:
        await self._emit(
            run.document_id,
            {
                "type": event_type,
                "run": run.as_dict(),
            },
        )

    async def _emit_step(self, run: AnalysisRunState, step: AnalysisStepState, event_type: str) -> None:
        await self._emit(
            run.document_id,
            {
                "type": event_type,
                "run_id": run.id,
                "step": step.as_dict(),
            },
        )

    async def _emit_step_event(
        self,
        run: AnalysisRunState,
        step: AnalysisStepState,
        *,
        kind: str,
        message: str,
        payload: dict[str, Any] | None = None,
    ) -> None:
        event = {
            "id": uuid.uuid4().hex[:10],
            "kind": kind,
            "message": message,
            "timestamp": _utc_now(),
            "payload": payload or {},
        }
        step.events.append(event)
        step.updated_at = _utc_now()
        await self._emit(
            run.document_id,
            {
                "type": "tender_analysis_step_event",
                "run_id": run.id,
                "step_id": step.id,
                "event": event,
            },
        )

    async def _run_extraction(self, run: AnalysisRunState) -> None:
        run.status = "running"
        run.summary = "招标信息提取任务已启动，正在组建 CrewAI 提取团队。"
        run.updated_at = _utc_now()
        await self._emit_run(run, "tender_analysis_run")

        try:
            context = await _fetch_document_context(run.document_id, run.document_name)
            snapshot = _default_snapshot(run.document_id, run.document_name)
            previous_results: dict[str, Any] = {}
            await self._emit_run(run, "tender_analysis_run_update")

            for stage_key, title, description in STAGES:
                step = AnalysisStepState(
                    id=uuid.uuid4().hex[:12],
                    stage=stage_key,
                    title=title,
                    description=description,
                    status="running",
                    started_at=_utc_now(),
                    updated_at=_utc_now(),
                )
                run.steps.append(step)
                run.current_stage = stage_key
                run.summary = description
                run.updated_at = _utc_now()
                await self._emit_step(run, step, "tender_analysis_step")
                await self._emit_run(run, "tender_analysis_run_update")
                await self._emit_step_event(
                    run,
                    step,
                    kind="status",
                    message=f"开始执行 {title}",
                )
                await self._emit_step_event(
                    run,
                    step,
                    kind="progress",
                    message="已准备文档上下文，正在调用 CrewAI 团队处理。",
                )

                stage_result = await self._run_stage(
                    document_id=run.document_id,
                    document_name=run.document_name,
                    stage=stage_key,
                    context=context,
                    previous_results=previous_results,
                    snapshot=snapshot,
                )
                result = stage_result.get("result") or {}
                previous_results[stage_key] = result
                snapshot = self._merge_stage_result(snapshot, stage_key, result, context=context)
                snapshot["document_meta"]["extracted_at"] = _utc_now()
                snapshot["evidence_index"] = _build_evidence_index(snapshot)

                step.status = "succeeded"
                step.preview_payload = result.get("preview") or result
                step.updated_at = _utc_now()
                run.completed_step_count += 1
                run.risk_count = len(snapshot.get("risk_register", []))
                run.confirmed_field_count = _count_confirmed_fields(snapshot)
                run.updated_at = _utc_now()
                await self._emit_step_event(
                    run,
                    step,
                    kind="summary",
                    message=result.get("summary") or f"{title} 已完成",
                    payload={"preview": step.preview_payload or {}},
                )
                await self._emit_step(run, step, "tender_analysis_step_update")
                await self._emit_run(run, "tender_analysis_run_update")

            run.status = "succeeded"
            run.summary = "招标信息提取已完成，可以切换到驾驶舱查看和修订。"
            run.snapshot = snapshot
            run.current_stage = None
            run.updated_at = _utc_now()
            document_service.save_analysis_payload(run.document_id, "latest.json", snapshot)
            document_service.save_analysis_payload(run.document_id, f"jobs/{run.id}.json", {
                "run": run.as_dict(),
                "snapshot": snapshot,
            })
            await self._emit_run(run, "tender_analysis_run_complete")
        except Exception as exc:
            logger.exception("Tender analysis failed for %s", run.document_id)
            run.status = "failed"
            run.error = str(exc)
            run.summary = str(exc)
            run.updated_at = _utc_now()
            if run.steps:
                step = run.steps[-1]
                step.status = "failed"
                step.error = str(exc)
                step.updated_at = _utc_now()
                await self._emit_step_event(run, step, kind="error", message=str(exc))
                await self._emit_step(run, step, "tender_analysis_step_update")
            await self._emit_run(run, "tender_analysis_run_failed")

    async def _run_stage(
        self,
        *,
        document_id: str,
        document_name: str,
        stage: str,
        context: dict[str, Any],
        previous_results: dict[str, Any],
        snapshot: dict[str, Any],
    ) -> dict[str, Any]:
        if self._crew_runner is None:
            self._crew_runner = TenderAnalysisCrewRunner()

        stage_execution = await self._crew_runner.run_stage(
            stage=stage,
            document_name=document_name,
            context=context,
            previous_results=previous_results,
            snapshot=snapshot,
        )
        return {
            "result": {
                **stage_execution.data,
                "summary": stage_execution.summary,
                "preview": stage_execution.preview,
            }
        }

    def _merge_stage_result(self, snapshot: dict[str, Any], stage: str, result: dict[str, Any], *, context: dict[str, Any]) -> dict[str, Any]:
        normalized = _normalize_stage_result(stage, result, markdown=str(context.get("markdown") or ""))
        return _deep_merge(snapshot, normalized)

    def get_snapshot(self, document_id: str) -> dict[str, Any] | None:
        job = self.get_latest_job(document_id)
        if job and job.snapshot:
            return job.snapshot
        return document_service.load_analysis_payload(document_id, "latest.json")

    def get_status(self, document_id: str) -> dict[str, Any]:
        job = self.get_latest_job(document_id)
        snapshot = self.get_snapshot(document_id)
        status = job.status if job else ("ready" if snapshot else "idle")
        return {
            "status": status,
            "active_job_id": job.id if job else None,
            "snapshot": snapshot,
        }

    def _persist_snapshot(self, document_id: str, snapshot: dict[str, Any]) -> dict[str, Any]:
        latest_job = self.get_latest_job(document_id)
        if latest_job:
            latest_job.snapshot = snapshot
            latest_job.risk_count = len(snapshot.get("risk_register", []))
            latest_job.confirmed_field_count = _count_confirmed_fields(snapshot)
            latest_job.updated_at = _utc_now()
        document_service.save_analysis_payload(document_id, "latest.json", snapshot)
        return snapshot

    def patch_field(self, document_id: str, field_path: str, value: Any, note: str | None = None) -> dict[str, Any]:
        snapshot = self.get_snapshot(document_id) or _default_snapshot(document_id, document_id)
        current = self._get_by_path(snapshot, field_path)
        if isinstance(current, dict) and {"value", "status", "confidence", "evidence"}.issubset(current.keys()):
            field = dict(current)
            field["value"] = value
            field["status"] = "user_edited"
            field["confidence"] = 1.0
            field.setdefault("evidence", [])
            field.setdefault("candidate_values", [])
            field["user_note"] = note or ""
        else:
            field = {
                "value": value,
                "status": "user_edited",
                "confidence": 1.0,
                "evidence": [],
                "candidate_values": [],
                "user_note": note or "",
            }
        _set_by_path(snapshot, field_path, field)
        snapshot["evidence_index"] = _build_evidence_index(snapshot)
        return self._persist_snapshot(document_id, snapshot)

    def patch_snapshot_value(self, document_id: str, field_path: str, value: Any) -> dict[str, Any]:
        snapshot = self.get_snapshot(document_id) or _default_snapshot(document_id, document_id)
        _set_by_path(snapshot, field_path, value)
        snapshot["evidence_index"] = _build_evidence_index(snapshot)
        return self._persist_snapshot(document_id, snapshot)

    @staticmethod
    def _get_by_path(data: dict[str, Any], field_path: str) -> Any:
        segments = [segment for segment in field_path.replace("[", ".[").split(".") if segment]
        current: Any = data
        for index, raw_segment in enumerate(segments):
            is_last = index == len(segments) - 1
            if raw_segment.startswith("[") and raw_segment.endswith("]"):
                current = current[int(raw_segment[1:-1])]
                continue
            if is_last:
                return current.get(raw_segment) if isinstance(current, dict) else None
            current = current[raw_segment]
        return None

    def patch_timeline_node(self, document_id: str, node_id: str, patch: dict[str, Any]) -> dict[str, Any]:
        snapshot = self.get_snapshot(document_id) or _default_snapshot(document_id, document_id)
        nodes = snapshot.get("timeline", {}).get("nodes", [])
        for node in nodes:
            if node.get("id") == node_id:
                node.update(patch)
                node["status"] = "user_edited"
                node["updatedAt"] = _utc_now()
                break
        snapshot["evidence_index"] = _build_evidence_index(snapshot)
        return self._persist_snapshot(document_id, snapshot)

    def confirm_timeline_node(self, document_id: str, node_id: str) -> dict[str, Any]:
        return self.patch_timeline_node(document_id, node_id, {"status": "confirmed"})

    def list_evidence(self, document_id: str, field_path: str) -> list[dict[str, Any]]:
        snapshot = self.get_snapshot(document_id) or {}
        return snapshot.get("evidence_index", {}).get(field_path, [])

    def list_timeline_conflicts(self, document_id: str) -> list[dict[str, Any]]:
        snapshot = self.get_snapshot(document_id) or {}
        return snapshot.get("timeline", {}).get("conflicts", [])

    def create_deadline_todo(self, document_id: str, node_id: str, template_type: str | None = None) -> dict[str, Any]:
        snapshot = self.get_snapshot(document_id) or _default_snapshot(document_id, document_id)
        nodes = snapshot.get("timeline", {}).get("nodes", [])
        node = next((item for item in nodes if item.get("id") == node_id), None)
        if not node:
            raise ValueError("Timeline node not found")
        todo = {
            "id": uuid.uuid4().hex[:12],
            "node_id": node_id,
            "title": f"{node.get('label') or '关键节点'} 前完成准备",
            "status": "open",
            "template_type": template_type or "default",
            "due_datetime": node.get("datetime_iso"),
            "created_at": _utc_now(),
        }
        snapshot.setdefault("deadline_todos", []).append(todo)
        self._persist_snapshot(document_id, snapshot)
        return todo


tender_analysis_service = TenderAnalysisService()
