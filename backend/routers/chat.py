"""
AI 平行人生 — 智能对话 API
POST /api/chat — 发送消息，AI 自然对话
POST /api/chat/stream — 流式对话，SSE 输出
"""

import json
import re

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from schemas.story import ChatMessage  # 复用统一模型（包含 attachments 字段）
from services.chat_service import (
    chat_with_llm,
    chat_stream,
    extract_fields_from_conversation,
    REQUIRED_FIELDS,
)


router = APIRouter(prefix="/api", tags=["chat"])


class ChatRequest(BaseModel):
    messages: list[ChatMessage]


class ChatResponse(BaseModel):
    reply: str
    fields: dict
    complete: bool


@router.post("/chat", response_model=ChatResponse)
async def chat(body: ChatRequest):
    """AI 智能对话（非流式）"""
    # 保留 attachments 字段 — 让 LLM 知道用户发了图片
    messages = [
        {"role": m.role, "content": m.content, "attachments": m.attachments or []}
        for m in body.messages
    ]

    try:
        reply = await chat_with_llm(messages)
    except ConnectionError:
        fields = _fallback_extract_simple(messages)
        reply = _fallback_question(fields)
        is_complete = "[收集完成]" in reply
        reply = reply.replace("[收集完成]", "").strip()
        if is_complete:
            fields = _fallback_extract_simple(messages)
        return ChatResponse(reply=reply, fields=fields, complete=is_complete)

    is_complete = "[收集完成]" in reply
    reply = reply.replace("[收集完成]", "").strip()

    fields = {}
    if is_complete:
        fields = await extract_fields_from_conversation(messages)
    else:
        fields = _fallback_extract_simple(messages)

    return ChatResponse(reply=reply, fields=fields, complete=is_complete)


@router.post("/chat/extract")
async def chat_extract_endpoint(body: ChatRequest):
    """
    用户主动结束聊天时调用 — 从完整对话历史提取结构化字段

    用于 _userFinish 场景，无需等 LLM 输出 [收集完成] 标记
    """
    messages = [
        {"role": m.role, "content": m.content, "attachments": m.attachments or []}
        for m in body.messages
    ]
    try:
        fields = await extract_fields_from_conversation(messages)
    except Exception as e:
        # 兜底用正则提取
        fields = _fallback_extract_simple(messages)
    return {"fields": fields}


@router.post("/chat/stream")
async def chat_stream_endpoint(body: ChatRequest):
    """
    AI 智能对话（SSE 流式）

    边生成边输出，前端可实时展示打字机效果。
    最后一条 SSE 事件包含 complete、fields 标记。
    """
    # 保留 attachments 字段
    messages = [
        {"role": m.role, "content": m.content, "attachments": m.attachments or []}
        for m in body.messages
    ]

    async def event_stream():
        buffer = ""
        had_error = False
        try:
            async for token in chat_stream(messages):
                # 关键：chat_service 在 LLM 上游失败时会 yield 错误文本，
                # 这里必须识别并升级为 SSE error 事件，否则前端会把它当正常 AI 回复显示
                if token and (token.startswith("（连接出错") or token.startswith("（AI 响应出错") or token.startswith("对不起，API 配置未完成")):
                    had_error = True
                    msg = token.strip("（）")
                    yield f"event: error\ndata: {json.dumps({'message': msg}, ensure_ascii=False)}\n\n"
                    return
                buffer += token
                yield f"data: {json.dumps({'token': token, 'done': False}, ensure_ascii=False)}\n\n"
        except Exception as e:
            had_error = True
            yield f"event: error\ndata: {json.dumps({'message': f'聊天服务异常: {str(e)}'}, ensure_ascii=False)}\n\n"
            return

        if had_error:
            return

        # 流结束后，检查完成标记
        is_complete = "[收集完成]" in buffer
        reply = buffer.replace("[收集完成]", "").strip()

        fields = {}
        if is_complete:
            fields = await extract_fields_from_conversation(messages)

        yield f"data: {json.dumps({'done': True, 'complete': is_complete, 'fields': fields, 'reply': reply}, ensure_ascii=False)}\n\n"

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache, no-transform",
            "X-Accel-Buffering": "no",  # 禁用代理缓冲
        },
    )


def _fallback_extract_simple(messages: list[dict]) -> dict:
    """精简版字段提取 — 仅用于展示进度"""
    fields = {}
    user_text = " ".join(
        m["content"] for m in messages if m["role"] == "user"
    )
    if not user_text.strip():
        return fields

    t = re.search(r"(\d{4}年[^\s，。]{0,10})", user_text)
    if t:
        fields["time"] = t.group(1)
    l = re.search(r"(北京|上海|广州|深圳|成都|杭州|武汉|南京|西安|重庆|天津|长沙|成都)", user_text)
    if l:
        fields["location"] = l.group(1)
    c = re.search(r"([^\s，。]{2,20}(?:vs|VS|还是)[^\s，。]{2,20})", user_text)
    if c:
        fields["choice"] = c.group(1).strip()
    return fields


def _fallback_question(fields: dict) -> str:
    """当 LLM 不可用时的兜底问题"""
    missing = [f for f in REQUIRED_FIELDS if not fields.get(f)]

    fallbacks = {
        "time": '能告诉我这件事大概发生在什么时候吗？比如"2019年夏天"或"大三那年"。',
        "location": "当时你在哪里呢？在哪个城市，或者哪个特别的场景？",
        "choice": '你当时面临的选择是什么？比如"留在成都 vs 去北京"——你在纠结什么？',
        "actual": "你最终选择了哪一个方向？",
        "outcome": "那条路走下来感觉怎么样？结果你还满意吗？",
        "imagination": "如果当初做了另一个选择，你觉得会是什么样子？闭上眼睛想象一下……",
    }

    for f in missing:
        return fallbacks.get(f, "能再跟我多说说吗？")

    return "好的，我已经了解了！[收集完成]"