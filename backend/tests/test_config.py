from app.config import Settings


def test_settings_defaults():
    s = Settings(
        _env_file=None,
        minio_endpoint="localhost:9000",
        litellm_api_key="test-key",
    )
    assert s.minio_bucket == "docpilot-documents"
    assert s.collab_server_url == "ws://localhost:3050"
    assert s.backend_port == 8000
    assert s.minio_use_ssl is False
