from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.models.schemas import TenderAnalysisJobResponse, TenderAnalysisSnapshotResponse
from app.routers.documents import _validate_document_id
from app.services.tender_analysis_service import tender_analysis_service

router = APIRouter(prefix="/api/documents", tags=["tender-analysis"])


class PatchFieldRequest(BaseModel):
    field_path: str
    value: Any
    note: str | None = None


class PatchSnapshotValueRequest(BaseModel):
    field_path: str
    value: Any


class PatchTimelineRequest(BaseModel):
    patch: dict[str, Any]


class DeadlineTodoRequest(BaseModel):
    template_type: str | None = None


@router.post("/{document_id}/tender-analysis/extract", response_model=TenderAnalysisJobResponse)
async def start_tender_analysis(document_id: str, force_refresh: bool = False):
    _validate_document_id(document_id)
    run = await tender_analysis_service.start_extraction(document_id, force_refresh=force_refresh)
    return TenderAnalysisJobResponse(job_id=run.id, status=run.status, run=run.as_dict())


@router.get("/{document_id}/tender-analysis", response_model=TenderAnalysisSnapshotResponse)
async def get_tender_analysis(document_id: str):
    _validate_document_id(document_id)
    payload = tender_analysis_service.get_status(document_id)
    return TenderAnalysisSnapshotResponse(**payload)


@router.get("/{document_id}/tender-analysis/status", response_model=TenderAnalysisSnapshotResponse)
async def get_tender_analysis_status(document_id: str):
    _validate_document_id(document_id)
    payload = tender_analysis_service.get_status(document_id)
    return TenderAnalysisSnapshotResponse(**payload)


@router.patch("/{document_id}/tender-analysis/fields", response_model=TenderAnalysisSnapshotResponse)
async def patch_tender_field(document_id: str, request: PatchFieldRequest):
    _validate_document_id(document_id)
    snapshot = tender_analysis_service.patch_field(document_id, request.field_path, request.value, request.note)
    payload = tender_analysis_service.get_status(document_id)
    payload["snapshot"] = snapshot
    return TenderAnalysisSnapshotResponse(**payload)


@router.patch("/{document_id}/tender-analysis/snapshot", response_model=TenderAnalysisSnapshotResponse)
async def patch_tender_snapshot_value(document_id: str, request: PatchSnapshotValueRequest):
    _validate_document_id(document_id)
    snapshot = tender_analysis_service.patch_snapshot_value(document_id, request.field_path, request.value)
    payload = tender_analysis_service.get_status(document_id)
    payload["snapshot"] = snapshot
    return TenderAnalysisSnapshotResponse(**payload)


@router.patch("/{document_id}/tender-analysis/timeline/{node_id}", response_model=TenderAnalysisSnapshotResponse)
async def patch_tender_timeline_node(document_id: str, node_id: str, request: PatchTimelineRequest):
    _validate_document_id(document_id)
    snapshot = tender_analysis_service.patch_timeline_node(document_id, node_id, request.patch)
    payload = tender_analysis_service.get_status(document_id)
    payload["snapshot"] = snapshot
    return TenderAnalysisSnapshotResponse(**payload)


@router.post("/{document_id}/tender-analysis/timeline/{node_id}/confirm", response_model=TenderAnalysisSnapshotResponse)
async def confirm_tender_timeline_node(document_id: str, node_id: str):
    _validate_document_id(document_id)
    snapshot = tender_analysis_service.confirm_timeline_node(document_id, node_id)
    payload = tender_analysis_service.get_status(document_id)
    payload["snapshot"] = snapshot
    return TenderAnalysisSnapshotResponse(**payload)


@router.get("/{document_id}/tender-analysis/evidence")
async def list_tender_evidence(document_id: str, field_path: str):
    _validate_document_id(document_id)
    return {"field_path": field_path, "evidence": tender_analysis_service.list_evidence(document_id, field_path)}


@router.get("/{document_id}/tender-analysis/timeline/conflicts")
async def list_tender_timeline_conflicts(document_id: str):
    _validate_document_id(document_id)
    return {"conflicts": tender_analysis_service.list_timeline_conflicts(document_id)}


@router.post("/{document_id}/tender-analysis/timeline/{node_id}/todos")
async def create_tender_deadline_todo(document_id: str, node_id: str, request: DeadlineTodoRequest):
    _validate_document_id(document_id)
    try:
        todo = tender_analysis_service.create_deadline_todo(document_id, node_id, request.template_type)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    return {"todo": todo}
