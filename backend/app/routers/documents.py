import re
from fastapi import APIRouter, UploadFile, File, HTTPException, Query, Request
from fastapi.responses import Response
from botocore.exceptions import ClientError
from app.services import document_service
from app.models.schemas import ChatAssetResponse, DocumentCreateResponse, DocumentInfo

router = APIRouter(prefix="/api/documents", tags=["documents"])


def _validate_document_id(document_id: str) -> None:
    if not re.match(r'^[a-f0-9]{12}$', document_id):
        raise HTTPException(status_code=400, detail="Invalid document ID format")


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
    _validate_document_id(document_id)
    try:
        info = document_service.get_document_info(document_id)
        return DocumentInfo(**info)
    except ClientError as e:
        if e.response["Error"]["Code"] in ("NoSuchKey", "404"):
            raise HTTPException(status_code=404, detail="Document not found")
        raise HTTPException(status_code=500, detail="Storage error")
    except Exception:
        raise HTTPException(status_code=404, detail="Document not found")


@router.get("/{document_id}/download")
async def download_document(document_id: str):
    _validate_document_id(document_id)
    try:
        data = document_service.download_document(document_id)
        return Response(
            content=data,
            media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            headers={
                "Content-Disposition": f'attachment; filename="{document_id}.docx"',
                "Cache-Control": "no-store, max-age=0",
                "Pragma": "no-cache",
            },
        )
    except ClientError as e:
        if e.response["Error"]["Code"] in ("NoSuchKey", "404"):
            raise HTTPException(status_code=404, detail="Document not found")
        raise HTTPException(status_code=500, detail="Storage error")
    except Exception:
        raise HTTPException(status_code=404, detail="Document not found")


@router.put("/{document_id}/content")
async def save_document_content(document_id: str, request: Request):
    _validate_document_id(document_id)
    data = await request.body()
    if not data:
        raise HTTPException(status_code=400, detail="Document content is empty")

    try:
        document_service.save_current_document(document_id, data)
        return {"status": "updated"}
    except ClientError as e:
        if e.response["Error"]["Code"] in ("NoSuchKey", "404", "NoSuchBucket"):
            raise HTTPException(status_code=404, detail="Document not found")
        raise HTTPException(status_code=500, detail="Storage error")


@router.post("/{document_id}/chat-assets", response_model=ChatAssetResponse)
async def upload_chat_asset(document_id: str, file: UploadFile = File(...)):
    _validate_document_id(document_id)
    if not file.filename:
        raise HTTPException(status_code=400, detail="Filename is required")

    mime_type = file.content_type or ""
    if mime_type not in document_service.CHAT_ASSET_ALLOWED_MIME_TYPES:
        raise HTTPException(status_code=400, detail="Only png/jpg/jpeg/webp/gif images are accepted")

    data = await file.read()
    if not data:
        raise HTTPException(status_code=400, detail="Image content is empty")

    try:
        asset = document_service.upload_chat_asset(document_id, file.filename, data, mime_type)
        return ChatAssetResponse(**asset)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except ClientError as e:
        if e.response["Error"]["Code"] in ("NoSuchBucket", "404"):
            raise HTTPException(status_code=404, detail="Document not found")
        raise HTTPException(status_code=500, detail="Storage error")


@router.delete("/{document_id}/chat-assets/{asset_id}")
async def delete_chat_asset(document_id: str, asset_id: str):
    _validate_document_id(document_id)
    if not re.match(r'^[a-f0-9]{12}$', asset_id):
        raise HTTPException(status_code=400, detail="Invalid asset ID format")

    found = document_service.delete_chat_asset(document_id, asset_id)
    if not found:
        raise HTTPException(status_code=404, detail="Asset not found")
    return {"status": "deleted"}


@router.delete("/{document_id}")
async def delete_document(document_id: str):
    _validate_document_id(document_id)
    found = document_service.delete_document(document_id)
    if not found:
        raise HTTPException(status_code=404, detail="Document not found")
    return {"status": "deleted"}
