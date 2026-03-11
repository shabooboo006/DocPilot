import json
from unittest.mock import patch, MagicMock


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
    assert mock_s3.put_object.call_count == 1  # only meta


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
