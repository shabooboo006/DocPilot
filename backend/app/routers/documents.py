from fastapi import APIRouter, UploadFile, File, HTTPException, Query
from fastapi.responses import Response
from app.services import document_service
from app.models.schemas import DocumentCreateResponse, DocumentInfo

router = APIRouter(prefix="/api/documents", tags=["documents"])


@router.post("/upload", response_model=DocumentCreateResponse)
async def upload_document(file: UploadFile = File(...)):
    if not file.filename or not file.filename.lower().endswith(".docx"):
        raise HTTPException(status_code=400, detail="Only .docx files are accepted")
    data = await file.read()
    document_id = document_service.upload_document(file.filename, data)
    return DocumentCreateResponse(document_id=document_id, name=file.filename)


@router.post("/create", response_model=DocumentCreateResponse)
async def create_document(name: str = Query(default="Untitled")):
    document_id = document_service.create_blank_document(name)
    return DocumentCreateResponse(document_id=document_id, name=name)


@router.get("/{document_id}/info", response_model=DocumentInfo)
async def get_document_info(document_id: str):
    try:
        info = document_service.get_document_info(document_id)
        return DocumentInfo(**info)
    except Exception:
        raise HTTPException(status_code=404, detail="Document not found")


@router.get("/{document_id}/download")
async def download_document(document_id: str):
    try:
        data = document_service.download_document(document_id)
        return Response(
            content=data,
            media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            headers={"Content-Disposition": f'attachment; filename="{document_id}.docx"'},
        )
    except Exception:
        raise HTTPException(status_code=404, detail="Document not found")


@router.delete("/{document_id}")
async def delete_document(document_id: str):
    document_service.delete_document(document_id)
    return {"status": "deleted"}
