"""
AI 平行人生 — 文件上传 API
POST /api/upload — 上传图片/音频文件
"""

import os
import uuid
from pathlib import Path

from fastapi import APIRouter, UploadFile, File, HTTPException
from starlette.responses import JSONResponse

from config import settings

router = APIRouter(prefix="/api", tags=["upload"])

# 允许的文件类型
ALLOWED_IMAGE_TYPES = {"image/jpeg", "image/png", "image/gif", "image/webp"}
ALLOWED_AUDIO_TYPES = {"audio/mpeg", "audio/wav", "audio/ogg", "audio/mp4", "audio/webm"}
MAX_FILE_SIZE = 10 * 1024 * 1024  # 10MB

# 确保上传目录存在
UPLOAD_DIR = Path(settings.uploads_dir)
IMAGE_DIR = UPLOAD_DIR / "images"
AUDIO_DIR = UPLOAD_DIR / "audio"
IMAGE_DIR.mkdir(parents=True, exist_ok=True)
AUDIO_DIR.mkdir(parents=True, exist_ok=True)


@router.post("/upload")
async def upload_file(file: UploadFile = File(...)):
    """
    上传文件（图片或音频）

    返回:
        {
            "url": "/uploads/images/xxx.jpg",     # 访问路径
            "type": "image",                        # image | audio
            "filename": "original_name.jpg"
        }
    """
    # 检查文件大小
    content = await file.read()
    if len(content) > MAX_FILE_SIZE:
        raise HTTPException(status_code=413, detail="文件大小超过限制（最大 10MB）")

    content_type = file.content_type or ""
    ext = _get_extension(content_type, file.filename or "")

    if content_type in ALLOWED_IMAGE_TYPES:
        file_type = "image"
        save_dir = IMAGE_DIR
        url_subdir = "images"
    elif content_type in ALLOWED_AUDIO_TYPES:
        file_type = "audio"
        save_dir = AUDIO_DIR
        url_subdir = "audio"
    else:
        raise HTTPException(
            status_code=400,
            detail=f"不支持的文件类型: {content_type}。支持: JPG/PNG/GIF/WebP 图片, MP3/WAV/OGG 音频",
        )

    # 生成唯一文件名
    unique_name = f"{uuid.uuid4().hex}{ext}"
    save_path = save_dir / unique_name

    with open(save_path, "wb") as f:
        f.write(content)

    # URL 子目录与存储目录保持一致（images/audio，复数）
    url_path = f"/uploads/{url_subdir}/{unique_name}"

    return {
        "url": url_path,
        "type": file_type,
        "filename": file.filename or unique_name,
    }


def _get_extension(content_type: str, original_name: str) -> str:
    """从 content_type 或原文件名获取扩展名"""
    ext_map = {
        "image/jpeg": ".jpg",
        "image/png": ".png",
        "image/gif": ".gif",
        "image/webp": ".webp",
        "audio/mpeg": ".mp3",
        "audio/wav": ".wav",
        "audio/ogg": ".ogg",
        "audio/mp4": ".m4a",
        "audio/webm": ".webm",
    }
    if content_type in ext_map:
        return ext_map[content_type]
    # fallback: 从原始文件名取扩展名
    if original_name and "." in original_name:
        return Path(original_name).suffix
    return ".bin"