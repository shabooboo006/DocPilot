import json
import base64
from unittest.mock import patch, MagicMock

PNG_BYTES = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a8l8AAAAASUVORK5CYII="
)


@patch("app.services.document_service.s3")
def test_upload_document(mock_s3):
    from app.services.document_service import upload_document
    doc_id = upload_document("test.docx", b"fake-docx-content")
    assert len(doc_id) == 12
    assert mock_s3.put_object.call_count == 3  # original + current + meta


@patch("app.services.document_service.s3")
def test_create_blank_document(mock_s3):
    from app.services.document_service import create_blank_document
    doc_id = create_blank_document("New Document")
    assert len(doc_id) == 12
    assert mock_s3.put_object.call_count == 3  # original + current + meta


@patch("app.services.document_service.s3")
def test_get_document_info(mock_s3):
    from app.services.document_service import get_document_info
    meta = json.dumps({"name": "test.docx", "document_id": "abc123"})
    mock_s3.get_object.return_value = {
        "Body": MagicMock(read=MagicMock(return_value=meta.encode()))
    }
    info = get_document_info("abc123")
    assert info["name"] == "test.docx"
    assert info["document_id"] == "abc123"


@patch("app.services.document_service.s3")
def test_delete_document(mock_s3):
    from app.services.document_service import delete_document
    mock_s3.list_objects_v2.return_value = {
        "Contents": [
            {"Key": "documents/abc123/current.docx"},
            {"Key": "documents/abc123/meta.json"},
        ]
    }
    delete_document("abc123")
    mock_s3.delete_objects.assert_called_once()


@patch("app.services.document_service.s3")
def test_save_current_document(mock_s3):
    from app.services.document_service import save_current_document

    save_current_document("abc123456789", b"updated-docx-content")

    mock_s3.put_object.assert_called_once_with(
        Bucket="docpilot-documents",
        Key="documents/abc123456789/current.docx",
        Body=b"updated-docx-content",
    )


@patch("app.services.document_service.s3")
def test_upload_chat_asset(mock_s3):
    from app.services.document_service import upload_chat_asset

    asset = upload_chat_asset(
        "abc123456789",
        "figure.png",
        PNG_BYTES,
        "image/png",
    )

    assert asset["filename"] == "figure.png"
    assert asset["mime_type"] == "image/png"
    assert asset["width"] == 1
    assert asset["height"] == 1
    assert mock_s3.put_object.call_count == 3
