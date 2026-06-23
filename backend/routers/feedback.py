"""
AI 平行人生 — 用户反馈 API
POST /api/feedback — 收集内测反馈
"""

import json
from datetime import datetime, timezone
from pathlib import Path

from fastapi import APIRouter
from pydantic import BaseModel, Field

router = APIRouter(prefix="/api", tags=["feedback"])

# 反馈文件存储路径
FEEDBACK_FILE = Path(__file__).resolve().parent.parent / "feedback.jsonl"


class FeedbackRequest(BaseModel):
    content: str = Field(..., min_length=1, max_length=500, description="反馈内容")
    version: str = Field("1.0.0-beta", description="产品版本")


class FeedbackResponse(BaseModel):
    message: str
    id: str


@router.post("/feedback", response_model=FeedbackResponse)
def submit_feedback(body: FeedbackRequest):
    """提交用户反馈，追加写入 feedback.jsonl"""
    import uuid

    feedback_id = str(uuid.uuid4())[:8]
    entry = {
        "id": feedback_id,
        "content": body.content,
        "version": body.version,
        "createdAt": datetime.now(timezone.utc).isoformat(),
    }

    try:
        with open(FEEDBACK_FILE, "a", encoding="utf-8") as f:
            f.write(json.dumps(entry, ensure_ascii=False) + "\n")
    except Exception as e:
        return FeedbackResponse(message=f"保存失败: {str(e)}", id=feedback_id)

    return FeedbackResponse(message="反馈已提交，感谢你的建议！", id=feedback_id)