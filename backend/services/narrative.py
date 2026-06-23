"""
AI 平行人生 — 叙事生成逻辑
组装 Prompt、调用 LLM、处理结果
"""

import json
import re

from schemas.story import UserNode
from services.llm_service import generate_narrative_stream


# ─── 关键词兜底库（按"真实线 / 平行线"语义分组） ─────────────
_REAL_KEYWORDS = [
    "踏实", "陪伴", "日常", "安稳", "熟悉", "坚定", "温柔", "沉淀", "靠近",
    "靠岸", "落地", "热汤", "灯下", "细水", "常伴", "累积", "坚守", "责任",
    "依靠", "规律", "平静", "归属", "扎根", "灯火", "撑伞", "人海", "团圆",
    "温饱", "守候", "归途", "港湾", "经营", "岁月", "细碎", "烟火", "细密",
]
_PARALLEL_KEYWORDS = [
    "未知", "远行", "自由", "重启", "陌生", "可能", "漂泊", "独自", "跳出",
    "代价", "破局", "大雾", "追光", "北风", "异乡", "沿途", "方向", "孤身",
    "大城", "海风", "霓虹", "迁徙", "夜行", "回响", "脱轨", "孤岛", "岔路",
    "起落", "探身", "未竟", "空旷", "回身", "改写", "另一端",
]

# 停用词 — LLM 偶发返回的语气词、虚词、句段时直接过滤
_STOP_WORDS = {
    "我们", "他们", "你们", "这是", "那个", "这个", "一些", "没有", "什么", "可以",
    "就是", "还是", "已经", "现在", "可能", "应该", "知道", "感觉", "觉得", "因为",
    "所以", "但是", "不过", "怎么", "为什么", "其实", "只是", "这样", "那样", "一种",
    "然后", "后来", "当时", "如果", "也许", "大概", "一定", "一直", "一下", "开始",
    "结束", "选择", "决定", "走", "去", "来", "做", "是", "在", "了", "的", "和",
    "与", "也", "都", "还", "再", "把", "让", "给", "用", "到", "从", "被", "我",
    "你", "他", "她", "它", "的", "地", "得", "啊", "吧", "呢", "嘛", "呗", "哇",
    "哦", "嗯", "啊", "呵", "嘿", "哈", "啦", "噢", "哎", "嘛",
}


def _extract_phrase_keywords(text: str, line: str, limit: int = 8) -> list:
    """
    从用户故事文本里抽"中文 2~4 字词语"（n-gram + 频次）。
    优先 2 字词（更像"词"），再用 3~4 字。
    """
    if not text:
        return []
    # 先做基本清理
    text = re.sub(r"[^\u4e00-\u9fa5]", " ", text)
    freq = {}
    # 2 字
    for m in re.finditer(r"[\u4e00-\u9fa5]{2}", text):
        w = m.group(0)
        if w in _STOP_WORDS:
            continue
        freq[w] = freq.get(w, 0) + 1
    # 3~4 字（作为补充；权重略低）
    for m in re.finditer(r"[\u4e00-\u9fa5]{3,4}", text):
        w = m.group(0)
        if w in _STOP_WORDS:
            continue
        # 如果 w 的所有 2-gram 子串都已经计入，则跳过（避免重复计数）
        # 这里直接计入，但权重低一些
        freq[w] = freq.get(w, 0) + 0.3

    # 排序：频次降序，相同时长降序
    sorted_words = sorted(freq.items(), key=lambda x: (-x[1], -len(x[0])))
    result = []
    for w, _ in sorted_words:
        if w in _STOP_WORDS:
            continue
        if len(w) > 4 or len(w) < 2:
            continue
        if w in result:
            continue
        result.append(w)
        if len(result) >= limit:
            break
    return result


def _sanitize_keywords(candidate, line: str, user_input: UserNode) -> list:
    """
    校验/补齐关键词。
    1) 优先用 LLM 返回的（过滤：必须是字符串、2~4 字、不在停用词、不能是句段）
    2) 不足时从用户故事里抽 2 字词补
    3) 再不足时从兜底库里按 line 抽
    4) 最多 4 个
    """
    pool = list(_REAL_KEYWORDS if line == "real" else _PARALLEL_KEYWORDS)

    cleaned = []
    if isinstance(candidate, list):
        for w in candidate:
            if not isinstance(w, str):
                continue
            w = w.strip()
            if not w:
                continue
            # 必须 2~4 字、不能含标点/数字、不能是停用词
            if not re.fullmatch(r"[\u4e00-\u9fa5]{2,4}", w):
                continue
            if w in _STOP_WORDS:
                continue
            if w in cleaned:
                continue
            cleaned.append(w)
            if len(cleaned) >= 4:
                break

    # 不足 → 从用户故事里抽
    if len(cleaned) < 4:
        # 真实线：取 actualChoice + actualOutcome + 真实叙述
        # 平行线：取 choiceB + imagination + 平行叙述
        if line == "real":
            source_text = (user_input.actualChoice or "") + " " + (user_input.actualOutcome or "")
        else:
            source_text = (user_input.choiceB or "") + " " + (user_input.imagination or "")
        extracted = _extract_phrase_keywords(source_text, line, limit=8)
        for w in extracted:
            if w in cleaned:
                continue
            cleaned.append(w)
            if len(cleaned) >= 4:
                break

    # 还不足 → 从兜底库按 line 抽（按故事 id 散列起点）
    if len(cleaned) < 4:
        seed = sum(ord(c) for c in (user_input.choiceA or user_input.choiceB or "x")) % len(pool)
        idx = seed
        for _ in range(len(pool)):
            w = pool[idx % len(pool)]
            if w not in cleaned:
                cleaned.append(w)
                if len(cleaned) >= 4:
                    break
            idx += 1

    return cleaned[:4]


def _build_prompt(user_input: UserNode) -> str:
    """将用户输入组装为 LLM Prompt"""
    parts = [
        f"【时间】{user_input.time or '未提及'}",
        f"【地点】{user_input.location or '未提及'}",
        f"【选择 A】{user_input.choiceA or '未提及'}",
        f"【选择 B】{user_input.choiceB or '未提及'}",
        f"【真实选择】{user_input.actualChoice or '未提及'}",
        f"【真实结果】{user_input.actualOutcome or '未提及'}",
        f"【对平行选择的想象】{user_input.imagination or '未提及'}",
    ]

    # 用户上传了图片/音频 → 告诉 LLM 在合适的位置放置对应类型卡片
    # 关键约束（产品需求）：
    # 1. 照片/语音**只放在真实线**（用户走过的路）— 平行线是想象中没走过的路，
    #    不应该出现用户的真实照片
    # 2. 多张照片时，前端会按 photo 卡片在真实线里的顺序轮询绑定，
    #    不同 photo 卡片挂不同的图
    media = list(user_input.uploadedMedia or [])
    images = [m for m in media if m.get('type') == 'image']
    audios = [m for m in media if m.get('type') == 'audio']
    if images:
        if len(images) == 1:
            parts.append(f"【用户提供的图片】1 张（请确保真实线至少保留 1 个 type=photo 卡片；平行线**不要**放 type=photo 卡片，平行线只用纯文字/diary 表达。photo 卡片的 scene 要能呼应这张图片的氛围）")
        else:
            parts.append(f"【用户提供的图片】{len(images)} 张（请确保真实线保留至少 {min(len(images), 2)} 个 type=photo 卡片，每张图片会按顺序绑定到真实线里的 photo 卡片上；平行线**不要**放 type=photo 卡片，平行线只用纯文字/diary 表达）")
    if audios:
        parts.append(f"【用户提供的语音】{len(audios)} 段（请确保真实线有 1 个 type=voicenote 卡片；平行线**不要**放 type=voicenote 卡片）")

    return "\n".join(parts)


def _transform_narrative_data(raw: dict, user_input: UserNode) -> dict:
    """
    将 LLM 返回的原始数据转换为前端统一格式
    """
    real_line = raw.get("realLine", [])
    parallel_line = raw.get("parallelLine", [])

    def _normalize_scenes(scenes: list) -> list:
        return [
            {
                "type": s.get("type", "diary"),
                "scene": s.get("scene", ""),
                "content": s.get("content", ""),
                "emotion": s.get("emotion", ""),
                "time": s.get("time", ""),
            }
            for s in scenes
        ]

    reflection = raw.get("reflection", {})
    if not reflection.get("themeColor"):
        reflection["themeColor"] = "#c8842c"

    # 关键词：优先用 LLM 返回的，否则后端兜底推导
    raw_kw = reflection.get("keywords") or {}
    real_kw = _sanitize_keywords(raw_kw.get("real") if isinstance(raw_kw, dict) else None, "real", user_input)
    parallel_kw = _sanitize_keywords(raw_kw.get("parallel") if isinstance(raw_kw, dict) else None, "parallel", user_input)
    reflection["keywords"] = {"real": real_kw, "parallel": parallel_kw}

    return {
        "title": raw.get("title", f"如果当初{user_input.choiceB or '做了不同的选择'}"),
        "narratives": {
            "real": _normalize_scenes(real_line),
            "parallel": _normalize_scenes(parallel_line),
        },
        "reflection": {
            "insight": reflection.get("insight", ""),
            "message": reflection.get("message", ""),
            "themeColor": reflection.get("themeColor", "#c8842c"),
            "keywords": reflection["keywords"],
        },
    }


async def generate_narrative(user_input: UserNode):
    """
    生成叙事的主流程

    返回 AsyncGenerator:
        {"event": "thinking" | "scene" | "reflection" | "done" | "error", "data": ...}
    """
    prompt = _build_prompt(user_input)
    full_raw = {}

    async for event in generate_narrative_stream(prompt):
        if event["event"] == "parsed":
            full_raw = event["data"]
            transformed = _transform_narrative_data(full_raw, user_input)
            yield {
                "event": "done",
                "data": {
                    "id": "",  # 由调用方填充
                    "createdAt": "",  # 由调用方填充
                    "title": transformed["title"],
                    "node": user_input.model_dump(),
                    "narratives": transformed["narratives"],
                    "reflection": transformed["reflection"],
                },
            }
            return
        elif event["event"] == "error":
            yield event
        elif event["event"] == "thinking":
            yield event

    # 如果 LLM 没有返回有效数据，使用降级方案
    if not full_raw:
        async for event in _fallback_generate(user_input):
            yield event


async def _fallback_generate(user_input: UserNode):
    """降级方案：当 LLM 不可用时使用预设叙事"""
    choice_a = user_input.choiceA or "原来的选择"
    choice_b = user_input.choiceB or "另一个选择"

    data = {
        "id": "",
        "createdAt": "",
        "title": f"如果当初{choice_b}",
        "node": user_input.model_dump(),
        "narratives": {
            "real": [
                {
                    "type": "diary",
                    "scene": f"{user_input.time}，{user_input.location}",
                    "content": f"那是{user_input.time}，我站在{user_input.location}的街头，做了选择。最终我选择了{choice_a}。现在回想起来，那天的阳光、空气里的味道，都还那么清晰。",
                    "emotion": "怀念",
                    "time": user_input.time or "",
                },
                {
                    "type": "chat",
                    "scene": "和朋友聊起当初的决定",
                    "content": f"朋友：你后悔吗？\n我：说不后悔是假的，但那时确实是最好的选择了。\n朋友：也是，每条路都有每条路的风景。",
                    "emotion": "坦然",
                    "time": "一年后",
                },
                {
                    "type": "photo",
                    "scene": f"{choice_a}之后的日子",
                    "content": f"{user_input.location}的黄昏，窗外是万家灯火。这条路上有笑有泪，但回头看，都是值得的。",
                    "emotion": "平静",
                    "time": "两年后",
                },
            ],
            "parallel": [
                {
                    "type": "chat",
                    "scene": f"决定{choice_b}的那一刻",
                    "content": f"我：我想好了，我要{choice_b}。\n家人：你确定吗？\n我：不确定，但我想试试。",
                    "emotion": "忐忑而坚定",
                    "time": user_input.time or "",
                },
                {
                    "type": "moment",
                    "scene": "新的开始",
                    "content": f"第一天。一切都陌生而新鲜。新的城市，新的节奏，新的自己。#新的开始",
                    "emotion": "兴奋",
                    "time": user_input.time or "",
                },
                {
                    "type": "diary",
                    "scene": "写给自己的信",
                    "content": f"亲爱的自己：\n谢谢你当初的勇气。虽然这条路也不容易，但你没有辜负那个勇敢做决定的自己。\n每一条路都有它的意义。",
                    "emotion": "温暖",
                    "time": "两年后",
                },
            ],
        },
        "reflection": {
            "insight": "你一直拥有的，不是完美选择的能力，而是把选择变成正确选择的勇气。",
            "message": "无论当初选择了哪条路，你都在认真生活、认真感受。每一条路都有属于它的阳光和风雨，而你已经足够勇敢。",
            "themeColor": "#c8842c",
            "keywords": {
                "real": _sanitize_keywords(None, "real", user_input),
                "parallel": _sanitize_keywords(None, "parallel", user_input),
            },
        },
    }

    yield {"event": "done", "data": data}