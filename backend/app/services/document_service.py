import uuid
import json
import boto3
from botocore.config import Config as BotoConfig
from app.config import settings


def _make_s3_client():
    return boto3.client(
        "s3",
        endpoint_url=f"{'https' if settings.minio_use_ssl else 'http'}://{settings.minio_endpoint}",
        aws_access_key_id=settings.minio_access_key,
        aws_secret_access_key=settings.minio_secret_key,
        config=BotoConfig(signature_version="s3v4"),
        region_name="us-east-1",
    )


s3 = _make_s3_client()
BUCKET = settings.minio_bucket


def ensure_bucket() -> None:
    try:
        s3.head_bucket(Bucket=BUCKET)
    except Exception:
        s3.create_bucket(Bucket=BUCKET)


def generate_id() -> str:
    return uuid.uuid4().hex[:12]


def upload_document(filename: str, file_data: bytes) -> str:
    document_id = generate_id()
    s3.put_object(Bucket=BUCKET, Key=f"documents/{document_id}/original.docx", Body=file_data)
    s3.put_object(Bucket=BUCKET, Key=f"documents/{document_id}/current.docx", Body=file_data)
    meta = json.dumps({"name": filename, "document_id": document_id})
    s3.put_object(Bucket=BUCKET, Key=f"documents/{document_id}/meta.json", Body=meta.encode())
    return document_id


def create_blank_document(name: str) -> str:
    document_id = generate_id()
    meta = json.dumps({"name": name, "document_id": document_id})
    s3.put_object(Bucket=BUCKET, Key=f"documents/{document_id}/meta.json", Body=meta.encode())
    return document_id


def get_document_info(document_id: str) -> dict:
    resp = s3.get_object(Bucket=BUCKET, Key=f"documents/{document_id}/meta.json")
    return json.loads(resp["Body"].read())


def download_document(document_id: str) -> bytes:
    resp = s3.get_object(Bucket=BUCKET, Key=f"documents/{document_id}/current.docx")
    return resp["Body"].read()


def delete_document(document_id: str) -> None:
    prefix = f"documents/{document_id}/"
    response = s3.list_objects_v2(Bucket=BUCKET, Prefix=prefix)
    if "Contents" in response:
        objects = [{"Key": obj["Key"]} for obj in response["Contents"]]
        s3.delete_objects(Bucket=BUCKET, Delete={"Objects": objects})
