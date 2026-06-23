"""
AI 平行人生 — 故事 CRUD API 路由
"""

import json
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from database import get_db
from models.story import Story
from schemas.story import (
    GenerateRequest,
    StoryCreate,
    StoryResponse,
    StoryListItem,
    StoryListResponse,
    MessageResponse,
)

router = APIRouter(prefix="/api/stories", tags=["stories"])


def _story_to_response(s: Story) -> StoryResponse:
    """将 ORM 模型转换为响应模型"""
    return StoryResponse(
        id=s.id,
        createdAt=s.created_at.isoformat() if s.created_at else "",
        title=s.title or "",
        node=s.user_input or {},
        narratives=s.narratives or {},
        reflection=s.reflection or {},
        chatMessages=s.chat_messages or [],
    )


@router.post("", response_model=StoryResponse)
def create_story(body: StoryCreate, db: Session = Depends(get_db)):
    """创建新故事（保存用户输入）"""
    story = Story(
        id=str(uuid.uuid4()),
        created_at=datetime.now(timezone.utc),
        title=f"如果当初{body.userInput.choiceB or '做了不同的选择'}",
        user_input=body.userInput.model_dump(),
    )
    db.add(story)
    db.commit()
    db.refresh(story)
    return _story_to_response(story)


@router.get("", response_model=StoryListResponse)
def list_stories(db: Session = Depends(get_db)):
    """获取历史故事列表（按创建时间倒序）"""
    stories = db.query(Story).order_by(Story.created_at.desc()).all()
    items = [
        StoryListItem(
            id=s.id,
            createdAt=s.created_at.isoformat() if s.created_at else "",
            title=s.title or "",
        )
        for s in stories
    ]
    return StoryListResponse(stories=items)


@router.get("/{story_id}", response_model=StoryResponse)
def get_story(story_id: str, db: Session = Depends(get_db)):
    """获取单个故事详情"""
    story = db.query(Story).filter(Story.id == story_id).first()
    if not story:
        raise HTTPException(status_code=404, detail="故事不存在")
    return _story_to_response(story)


@router.delete("/{story_id}", response_model=MessageResponse)
def delete_story(story_id: str, db: Session = Depends(get_db)):
    """删除故事"""
    story = db.query(Story).filter(Story.id == story_id).first()
    if not story:
        raise HTTPException(status_code=404, detail="故事不存在")
    db.delete(story)
    db.commit()
    return MessageResponse(message="删除成功")