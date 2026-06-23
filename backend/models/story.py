"""
AI 平行人生 — SQLAlchemy 数据模型
"""

import uuid
from datetime import datetime, timezone

from sqlalchemy import Column, String, DateTime, JSON, Text

from database import Base


def _uuid():
    return str(uuid.uuid4())


def _now():
    return datetime.now(timezone.utc)


class Story(Base):
    __tablename__ = "stories"

    id = Column(String, primary_key=True, default=_uuid)
    created_at = Column(DateTime, default=_now, nullable=False)
    title = Column(String(200), default="")

    # 用户的原始输入节点
    user_input = Column(JSON, default=dict)

    # LLM 返回的完整叙事数据（real + parallel）
    narratives = Column(JSON, default=dict)

    # 感悟卡片数据
    reflection = Column(JSON, default=dict)

    # 聊天记录（[{role, content}]），用于时间线页回看
    chat_messages = Column(JSON, default=list)

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "createdAt": self.created_at.isoformat() if self.created_at else "",
            "title": self.title or "",
            "node": self.user_input or {},
            "narratives": self.narratives or {},
            "reflection": self.reflection or {},
            "chatMessages": self.chat_messages or [],
        }