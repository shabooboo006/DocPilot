from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    # MinIO
    minio_endpoint: str = "localhost:9000"
    minio_access_key: str = "minioadmin"
    minio_secret_key: str = "minioadmin"
    minio_bucket: str = "docpilot-documents"
    minio_use_ssl: bool = False

    # LiteLLM
    litellm_model: str = "gpt-4o"
    litellm_api_key: str = ""
    litellm_api_base: str = ""

    # Services
    collab_server_url: str = "ws://localhost:6350"
    superdoc_executor_url: str = "http://localhost:6350"
    backend_port: int = 6800

    model_config = SettingsConfigDict(
        env_file="../.env",
        env_file_encoding="utf-8",
        extra="ignore",
    )


settings = Settings()
