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
    collab_server_url: str = "ws://localhost:3050"
    backend_port: int = 8000

    model_config = SettingsConfigDict(
        env_file="../.env",
        env_file_encoding="utf-8",
        extra="ignore",
    )


settings = Settings()
