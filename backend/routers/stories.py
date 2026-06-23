"""
AI 平行人生 — 故事 CRUD API 路由
"""

import hashlib
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


def _user_input_hash(payload: dict) -> str:
    """
    计算 userInput 的稳定哈希，用于去重
    - 排序后再序列化，避免字段顺序差异导致哈希不同
    - 上传媒体只取 url+type（filename 容易变化，不入哈希）
    """
    normalized = {}
    for k, v in (payload or {}).items():
        if k == "uploadedMedia" and isinstance(v, list):
            normalized[k] = sorted([
                {"url": m.get("url", ""), "type": m.get("type", "")}
                for m in v if isinstance(m, dict)
            ], key=lambda x: x.get("url", ""))
        else:
            normalized[k] = v
    raw = json.dumps(normalized, sort_keys=True, ensure_ascii=False, default=str)
    return hashlib.md5(raw.encode("utf-8")).hexdigest()


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
    """
    创建新故事（保存用户输入）

    去重策略：用 userInput 的内容哈希匹配最近 7 天内同输入的故事；
    若已存在则直接返回旧记录，避免重复入库。
    """
    payload = body.userInput.model_dump()
    content_hash = _user_input_hash(payload)

    # 7 天窗口去重
    from datetime import timedelta
    cutoff = datetime.now(timezone.utc) - timedelta(days=7)
    existing = (
        db.query(Story)
        .filter(Story.created_at >= cutoff)
        .order_by(Story.created_at.desc())
        .all()
    )
    for s in existing:
        if _user_input_hash(s.user_input or {}) == content_hash:
            # 命中：返回旧记录，不创建新的
            return _story_to_response(s)

    story = Story(
        id=str(uuid.uuid4()),
        created_at=datetime.now(timezone.utc),
        title=f"如果当初{body.userInput.choiceB or '做了不同的选择'}",
        user_input=payload,
    )
    db.add(story)
    db.commit()
    db.refresh(story)
    return _story_to_response(story)


@router.get("", response_model=StoryListResponse)
def list_stories(db: Session = Depends(get_db)):
    """获取历史故事列表（按创建时间倒序）"""
    stories = db.query(Story).order_by(Story.created_at.desc()).all()
    # 防御性去重：相同 content_hash 保留最新一条
    seen_hashes = set()
    items = []
    for s in stories:
        h = _user_input_hash(s.user_input or {})
        if h in seen_hashes:
            continue
        seen_hashes.add(h)
        items.append(StoryListItem(
            id=s.id,
            createdAt=s.created_at.isoformat() if s.created_at else "",
            title=s.title or "",
        ))
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
    """删除故事（同时清理同一 userInput 哈希的重复记录）"""
    story = db.query(Story).filter(Story.id == story_id).first()
    if not story:
        raise HTTPException(status_code=404, detail="故事不存在")
    # 顺手清理同哈希的重复条目，保持数据库整洁
    h = _user_input_hash(story.user_input or {})
    same_hash = [s for s in db.query(Story).all()
                 if _user_input_hash(s.user_input or {}) == h]
    for s in same_hash:
        db.delete(s)
    db.commit()
    return MessageResponse(message="删除成功")