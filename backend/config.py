"""
AI 平行人生 — 配置管理
从环境变量读取配置，支持 .env 文件
"""
import os
from pathlib import Path
from pydantic_settings import BaseSettings


# 显式定位 .env 文件路径：始终使用本文件所在目录（backend/.env）
# 避免 pydantic_settings 在上级目录查找导致 API key 加载失败
_BACKEND_DIR = Path(__file__).resolve().parent
_ENV_FILE = _BACKEND_DIR / ".env"


class Settings(BaseSettings):
    # LLM 配置
    llm_provider: str = "deepseek"  # openai | anthropic | deepseek

    # OpenAI
    openai_api_key: str = ""
    openai_model: str = "gpt-4o-mini"

    # Anthropic
    anthropic_api_key: str = ""
    anthropic_model: str = "claude-3-haiku-20240307"

    # DeepSeek（OpenAI 兼容）
    deepseek_api_key: str = ""
    deepseek_model: str = "deepseek-chat"
    deepseek_base_url: str = "https://api.deepseek.com"

    # 数据库
    database_url: str = "sqlite:///./parallel_life.db"

    # 服务
    host: str = "0.0.0.0"
    port: int = 8000
    uploads_dir: str = "uploads"

    # CORS — 前端地址
    # 注意：包含所有可能用到的端口（5500 已被 Trae IDE 占用，现用 8765）
    cors_origins: str = "http://localhost:5500,http://127.0.0.1:5500,http://localhost:8765,http://127.0.0.1:8765"

    class Config:
        # 显式指定 .env 绝对路径，无论从哪个目录启动都能找到
        env_file = str(_ENV_FILE)
        env_file_encoding = "utf-8"


settings = Settings()

# 确保数据库目录存在（使用绝对路径，避免 cwd 影响）
_db_path = settings.database_url.replace("sqlite:///", "")
if _db_path:
    _db_abs = (_BACKEND_DIR / _db_path) if not os.path.isabs(_db_path) else Path(_db_path)
    _db_abs.parent.mkdir(parents=True, exist_ok=True)