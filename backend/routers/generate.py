"""
AI 平行人生 — 叙事生成 API
POST /api/generate — 流式 SSE 返回
"""

import json
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from database import get_db
from models.story import Story
from schemas.story import GenerateRequest
from services.narrative import generate_narrative

router = APIRouter(prefix="/api", tags=["generate"])


@router.post("/generate")
async def generate_story(body: GenerateRequest, db: Session = Depends(get_db)):
    """
    触发 AI 叙事生成，以 SSE (Server-Sent Events) 流式返回

    事件流：
      event: thinking  → data: "文案..."
      event: scene     → data: {...}  (单个场景片段)
      event: done      → data: {...}  (完整故事数据)
      event: error     → data: "错误信息"
    """

    async def event_stream():
        story_id = str(uuid.uuid4())
        created_at = datetime.now(timezone.utc)

        async for event in generate_narrative(body.userInput):
            if event["event"] == "done":
                data = event["data"]
                data["id"] = story_id
                data["createdAt"] = created_at.isoformat()

                # 存入数据库
                try:
                    story = Story(
                        id=story_id,
                        created_at=created_at,
                        title=data.get("title", ""),
                        user_input=body.userInput.model_dump(),
                        narratives=data.get("narratives", {}),
                        reflection=data.get("reflection", {}),
                        chat_messages=[m.model_dump() for m in (body.chatMessages or [])],
                    )
                    db.add(story)
                    db.commit()
                except Exception as e:
                    yield f"event: error\ndata: {json.dumps({'message': f'数据库保存失败: {str(e)}'})}\n\n"
                    return

                # 在 done 事件中把 chatMessages 一并返回（前端补全本地 store）
                data["chatMessages"] = [m.model_dump() for m in (body.chatMessages or [])]
                yield f"event: done\ndata: {json.dumps(data, ensure_ascii=False)}\n\n"
                return

            elif event["event"] == "error":
                yield f"event: error\ndata: {json.dumps({'message': event['data']})}\n\n"
                return

            elif event["event"] == "thinking":
                yield f"event: thinking\ndata: {json.dumps({'message': event['data']})}\n\n"

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache, no-transform",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
            "Transfer-Encoding": "chunked",
        },
    )