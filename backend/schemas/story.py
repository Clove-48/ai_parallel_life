"""
AI 平行人生 — Pydantic 数据模型（请求 / 响应）
"""

from datetime import datetime
from typing import Optional
from pydantic import BaseModel, Field


# ─── 请求模型 ───────────────────────────────────────────

class UserNode(BaseModel):
    """用户输入的人生关键节点"""
    time: str = Field("", description="时间，如 '2019 年夏天'")
    location: str = Field("", description="地点，如 '成都'")
    choiceA: str = Field("", description="选择 A")
    choiceB: str = Field("", description="选择 B")
    actualChoice: str = Field("", description="真实选择")
    actualOutcome: str = Field("", description="真实结果")
    imagination: str = Field("", description="对平行选择的想象")
    uploadedMedia: list[dict] = Field(default_factory=list, description="用户上传的媒体文件 [{url, type, filename}]")


class ChatMessage(BaseModel):
    """单条聊天消息"""
    role: str  # "user" | "assistant"
    content: str
    # 用户消息可附带图片/音频 — 后端会把 attachments 转成自然语言描述，
    # 拼到 user content 里给 LLM 看（DeepSeek 为纯文本模型，看不到图片本身）
    attachments: list[dict] = Field(default_factory=list, description="附件 [{url, type, filename}]")


class GenerateRequest(BaseModel):
    """生成叙事请求"""
    userInput: UserNode
    chatMessages: list[ChatMessage] = Field(default_factory=list, description="聊天记录")


class StoryCreate(BaseModel):
    """创建故事请求"""
    userInput: UserNode


# ─── 响应模型 ───────────────────────────────────────────

class NarrativeScene(BaseModel):
    """叙事线中的单个场景"""
    type: str = Field(..., pattern="^(chat|moment|photo|voicenote|diary)$")
    scene: str = ""
    content: str = ""
    emotion: str = ""
    time: str = ""


class Narratives(BaseModel):
    """双线叙事"""
    real: list[NarrativeScene] = []
    parallel: list[NarrativeScene] = []


class Reflection(BaseModel):
    """感悟卡片"""
    insight: str = ""
    message: str = ""
    themeColor: str = "#c8842c"
    keywords: dict = Field(default_factory=dict, description="两条路的关键词 {real: [4字词], parallel: [4字词]}")


class StoryResponse(BaseModel):
    """故事完整响应"""
    id: str
    createdAt: str
    title: str = ""
    node: UserNode
    narratives: Narratives
    reflection: Reflection
    chatMessages: list[ChatMessage] = Field(default_factory=list)


class StoryListItem(BaseModel):
    """故事列表项"""
    id: str
    createdAt: str
    title: str = ""


class StoryListResponse(BaseModel):
    """故事列表响应"""
    stories: list[StoryListItem]


# ─── 生成流式响应 ───────────────────────────────────────

class GenerateEvent(BaseModel):
    """SSE 生成事件"""
    event: str  # "thinking" | "scene" | "reflection" | "done" | "error"
    data: str


# ─── 通用响应 ───────────────────────────────────────────

class MessageResponse(BaseModel):
    message: str