from pydantic import BaseModel


class DocumentInfo(BaseModel):
    document_id: str
    name: str
    size: int | None = None


class DocumentCreateResponse(BaseModel):
    document_id: str
    name: str


class ChatMessage(BaseModel):
    type: str
    content: str = ""
    tool: str = ""
    status: str = ""
    description: str = ""
    result: dict | None = None
    message: str = ""
    streaming: bool = False
