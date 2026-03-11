from pydantic import BaseModel


class DocumentInfo(BaseModel):
    document_id: str
    name: str
    size: int | None = None


class DocumentCreateResponse(BaseModel):
    document_id: str
    name: str


class ChatAssetResponse(BaseModel):
    asset_id: str
    filename: str
    mime_type: str
    width: int
    height: int
    size_bytes: int
    storage_key: str


class ChatAttachment(BaseModel):
    asset_id: str
    filename: str
    mime_type: str
    width: int
    height: int


class ChatMessage(BaseModel):
    type: str
    content: str = ""
    tool: str = ""
    status: str = ""
    description: str = ""
    result: dict | None = None
    message: str = ""
    streaming: bool = False
