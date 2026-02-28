from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    project_name: str = "Gemini Hackathon AI World"
    gemini_api_key: str = ""

    # Temporal
    temporal_host: str = "localhost:7233"
    temporal_namespace: str = "default"
    temporal_task_queue: str = "agent-task-queue"

    class Config:
        env_file = ".env"

settings = Settings()
