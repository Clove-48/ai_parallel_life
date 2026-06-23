"""
AI 平行人生 — LLM 调用封装
支持 OpenAI 和 Anthropic 两种 API，流式响应
"""

import json
import re
from typing import AsyncGenerator

from config import settings


# ─── 系统提示词（核心 Prompt） ──────────────────────────

SYSTEM_PROMPT = """你是一个温暖、共情、有文学素养的叙事者 "平行人生引导师"。

## 你的角色
- 你像一位老朋友，坐在用户对面，听 TA 讲述人生的某个关键节点
- 你有敏锐的情感洞察力，能捕捉用户话语中隐藏的情绪
- 你有丰富的文学想象力，能将"如果当初做了不同选择"的场景鲜活地呈现出来
- 你的语言风格温暖而克制，不煽情、不鸡汤、不说教

## 你的任务
用户会告诉你 TA 人生中的一个关键选择节点（时间、地点、面临的选择、真实的选择和结果）。
你需要基于这些信息，生成两条平行的叙事线（"真实线"和"平行线"），
每条线包含 3-5 个场景片段，以多种媒介形式呈现。

最终让用户感受到：**每一条路都有它的风景，重要的是你认真走过了选择的路。**

## ⚠️ 通用铁律：时间线与事实一致性（最重要的约束，必须首先验证再生成）

**在生成任何场景前，你必须先在心里推算时间表**。无论用户说的具体场景是什么，下面这套推算方法**都适用**。

### 推算流程（每次都要走一遍）

**步骤 1：识别时间锚点**
- 关键节点的时间：用户说的具体时间——记为锚点 A
- 当前的时间：今天是 2026 年——记为锚点 B
- 用户在当前的身份状态：用户说的现状——记为状态 S

**步骤 2：推算真实线时间表**
- 真实线 = 用户实际走过的路径
- 关键时间点：B-A 之间，**推算用户在做什么**
- 真实线场景时间必须与 A→B 之间的实际经历一致

**步骤 3：推算平行线时间表（核心！最容易错）**
- 平行线 = 在锚点 A 选了"另一条路"的推演
- **关键规则**：B 时刻，平行线对应的身份状态 = 用户**走 A→B 路径时**在 B 时刻的等价位置，但**走了不同的轨迹**
- 公式：平行线在 B 时刻的状态 = B-A 经历时长 + 平行选择所导致的时长调整

**步骤 4：场景时间标签必须自洽**
- 真实线 3-5 个场景：从 A 时刻到 B 时刻，按时间顺序
- 平行线 3-5 个场景：**与真实线场景的"时间标签"对齐**（都标"2024年春"，只是内容不同）
- ❌ 不允许：真实线标"2026冬"、平行线标"2024秋"（时间点不对齐）

**步骤 5：身份状态表述必须自洽**
- ✅ 用时间线索反推身份
- ✅ 用相对时间表达："经过了一年的复读 + 两年大学"
- ❌ 不要写"刚上大一""刚毕业""刚工作"——除非有明确时间证据
- ❌ 不要假设用户年龄、年级、城市——**用户没说的就不写**

### 通用反例（不要写这样的内容）

❌ "如果当时复读了，现在可能刚上大一"——3 年时间不可能"刚"上大一
❌ "平行线里你刚毕业，正在找工作"——3 年了不可能"刚"毕业
❌ "你刚来这个城市，还在适应"——用户没说是不是"新"城市

### 通用正例（这样写才安全）

✅ "如果当时复读了，2026 年你应该是大二了……"
✅ "平行线里，经过 3 年的工作，你应该已经是公司骨干了……"
✅ "那条路上的你，正在 XXX……"（用"正在"而非"刚"）

### 兜底：如果推算不出来
- 不确定就写模糊时间："一段时间后""那年冬天""后来"
- 不要用"现在""刚""最新"等时间敏感词
- 把场景重心放在情感和细节上，而非具体时间

## 输出格式要求
你必须严格按照以下 JSON 格式输出，不要包含任何额外的解释或说明：

{
  "title": "如果当初...（根据用户情况生成标题）",
  "realLine": [
    {
      "type": "diary",
      "scene": "场景标题",
      "content": "叙事内容...",
      "emotion": "情感关键词",
      "time": "时间标注"
    }
  ],
  "parallelLine": [
    {
      "type": "chat",
      "scene": "场景标题",
      "content": "对话内容...",
      "emotion": "情感关键词",
      "time": "时间标注"
    }
  ],
  "reflection": {
    "insight": "一句话核心感悟，深刻而不晦涩，温暖而不鸡汤",
    "message": "一段温暖而有力量的结语，80字以内，让用户感受到被理解",
    "keywords": {
      "real": ["真实线的4个关键词（必须是词/短语，不能是整句）", "...", "...", "..."],
      "parallel": ["平行线的4个关键词（必须是词/短语，不能是整句）", "...", "...", "..."]
    }
  }
}

## 关键词提取规则（keywords 字段）
- 必须严格从用户故事内容中抽取，**不能是通用形容词**
- 必须是**2~4字的词语**（如"工作"、"陪伴"、"远行"），不是句子也不是语气词
- "真实线"关键词偏向：**已发生的、确定的、现实世界的**画面（如：踏实、日常、熟悉、陪伴、坚守、责任、依靠、积累、规律、平静）
- "平行线"关键词偏向：**未发生的、未知的、想象中的**画面（如：未知、远行、自由、重启、陌生、可能、漂泊、独自、跳出、代价）
- 提取依据：**用户在聊天里提到的具体场景/对象/情感**（"如果当初去了深圳"→"远行""陌生""重启"）
- 同一组关键词内 4 个词应当互不重复、互不雷同
- 绝不能返回"如果""但是""然后"这种虚词或句段
- 绝不能返回"我""你"等人称代词

## 场景类型说明（type 字段）
- "chat": 模拟即时通讯对话截图风格。content 格式为 "人名：说话内容\\n人名：说话内容"
- "moment": 模拟朋友圈/社交媒体动态风格。内容简洁，可带 #话题
- "photo": 场景照片描述。content 为画面描述性文字，富有画面感。**只允许出现在真实线**
- "voicenote": 模拟语音消息/录音风格。第一人称叙述，口语化但有温度。**只允许出现在真实线**
- "diary": 模拟手写日记风格。第一人称，内心独白式表达。两条线都可以用

## ⚠️ 关于 type=photo / type=voicenote 的硬性约束
- **真实线**：可以根据需要安排 type=photo / type=voicenote 卡片（用户上传的真实素材会绑定在这里）
- **平行线**：**绝对不要**使用 type=photo 或 type=voicenote 卡片 — 平行线是用户没有走过的路，**没有用户的真实照片/语音**
- 平行线一律用 chat / moment / diary 这三种纯文字/对话式类型

## 叙事要求
1. 真实线（realLine）：基于用户提供的真实经历，情感化回溯。温暖、接纳、有细节
2. 平行线（parallelLine）：基于"如果当初做了不同选择"的推演。想象力丰富、有可能性
3. 每条线至少 3 个场景，最多 5 个场景
4. 两条线的场景类型应该多样化，不要全部相同
5. 每条线的场景按时间顺序排列
6. 真实线与平行线的**时间标签应该对齐**（同一时间点上的不同选择结果）
7. 内容要具体、有画面感、有情感温度，避免空洞的模板化表达
8. 使用中文，语言文学化但不晦涩

## 安全约束
- 不要生成暴力、色情、违法内容
- 对于涉及创伤经历，保持温和、支持的语调
- 最终导向：每一条路都有它的意义，重要的是认真走好选择的路"""


# ─── OpenAI 调用 ────────────────────────────────────────

async def _openai_stream(prompt: str) -> AsyncGenerator[dict, None]:
    """调用 OpenAI 流式 API，逐段 yield 解析结果"""
    try:
        from openai import AsyncOpenAI
    except ImportError:
        yield {"event": "error", "data": "OpenAI SDK 未安装"}
        return

    if not settings.openai_api_key:
        yield {"event": "error", "data": "OPENAI_API_KEY 未配置"}
        return

    client = AsyncOpenAI(api_key=settings.openai_api_key)

    yield {"event": "thinking", "data": "AI 正在倾听你的故事..."}

    try:
        stream = await client.chat.completions.create(
            model=settings.openai_model,
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": prompt},
            ],
            temperature=0.8,
            max_tokens=4096,
            stream=True,
        )

        buffer = ""
        json_started = False

        async for chunk in stream:
            delta = chunk.choices[0].delta.content or ""
            buffer += delta

            if not json_started:
                yield {"event": "thinking", "data": "AI 正在编织平行时空..."}
                json_started = True

            # 尝试完整解析 JSON
            json_match = re.search(r'\{.*\}', buffer, re.DOTALL)
            if json_match:
                try:
                    data = json.loads(json_match.group())
                    yield {"event": "parsed", "data": data}
                    return
                except json.JSONDecodeError:
                    pass  # 继续累积

        # 最后再尝试一次
        json_match = re.search(r'\{.*\}', buffer, re.DOTALL)
        if json_match:
            try:
                data = json.loads(json_match.group())
                yield {"event": "parsed", "data": data}
                return
            except json.JSONDecodeError:
                pass

        yield {"event": "error", "data": "AI 返回格式异常，请重试"}

    except Exception as e:
        yield {"event": "error", "data": f"AI 调用失败: {str(e)}"}


# ─── Anthropic 调用 ─────────────────────────────────────

async def _anthropic_stream(prompt: str) -> AsyncGenerator[dict, None]:
    """调用 Anthropic 流式 API"""
    try:
        from anthropic import AsyncAnthropic
    except ImportError:
        yield {"event": "error", "data": "Anthropic SDK 未安装"}
        return

    if not settings.anthropic_api_key:
        yield {"event": "error", "data": "ANTHROPIC_API_KEY 未配置"}
        return

    client = AsyncAnthropic(api_key=settings.anthropic_api_key)

    yield {"event": "thinking", "data": "AI 正在倾听你的故事..."}

    try:
        async with client.messages.stream(
            model=settings.anthropic_model,
            system=SYSTEM_PROMPT,
            messages=[{"role": "user", "content": prompt}],
            max_tokens=4096,
            temperature=0.8,
        ) as stream:
            buffer = ""
            json_started = False

            async for text in stream.text_stream:
                buffer += text

                if not json_started:
                    yield {"event": "thinking", "data": "AI 正在编织平行时空..."}
                    json_started = True

                json_match = re.search(r'\{.*\}', buffer, re.DOTALL)
                if json_match:
                    try:
                        data = json.loads(json_match.group())
                        yield {"event": "parsed", "data": data}
                        return
                    except json.JSONDecodeError:
                        pass

            json_match = re.search(r'\{.*\}', buffer, re.DOTALL)
            if json_match:
                try:
                    data = json.loads(json_match.group())
                    yield {"event": "parsed", "data": data}
                    return
                except json.JSONDecodeError:
                    pass

            yield {"event": "error", "data": "AI 返回格式异常，请重试"}

    except Exception as e:
        yield {"event": "error", "data": f"AI 调用失败: {str(e)}"}


# ─── DeepSeek 调用（OpenAI 兼容协议，使用 httpx 直连） ──

async def _deepseek_stream(prompt: str) -> AsyncGenerator[dict, None]:
    """调用 DeepSeek 流式 API（httpx 直连，无需 OpenAI SDK）"""
    if not settings.deepseek_api_key:
        yield {"event": "error", "data": "DEEPSEEK_API_KEY 未配置"}
        return

    import httpx

    yield {"event": "thinking", "data": "AI 正在倾听你的故事..."}

    try:
        async with httpx.AsyncClient(timeout=60.0) as client:
            async with client.stream(
                "POST",
                f"{settings.deepseek_base_url.rstrip('/')}/chat/completions",
                headers={
                    "Content-Type": "application/json",
                    "Authorization": f"Bearer {settings.deepseek_api_key}",
                },
                json={
                    "model": settings.deepseek_model,
                    "messages": [
                        {"role": "system", "content": SYSTEM_PROMPT},
                        {"role": "user", "content": prompt},
                    ],
                    "temperature": 0.8,
                    "max_tokens": 4096,
                    "stream": True,
                },
            ) as response:
                if response.status_code != 200:
                    error_body = await response.aread()
                    yield {"event": "error", "data": f"DeepSeek API 错误 ({response.status_code}): {error_body.decode('utf-8', errors='replace')[:200]}"}
                    return

                buffer = ""
                json_started = False

                async for line in response.aiter_lines():
                    if not line.startswith("data: "):
                        continue
                    payload_str = line[6:].strip()
                    if payload_str == "[DONE]":
                        break

                    try:
                        chunk = json.loads(payload_str)
                        delta = chunk.get("choices", [{}])[0].get("delta", {}).get("content", "") or ""
                    except json.JSONDecodeError:
                        continue

                    if not delta:
                        continue

                    buffer += delta

                    if not json_started:
                        yield {"event": "thinking", "data": "AI 正在编织平行时空..."}
                        json_started = True

                    # 尝试完整解析 JSON
                    json_match = re.search(r'\{.*\}', buffer, re.DOTALL)
                    if json_match:
                        try:
                            data = json.loads(json_match.group())
                            yield {"event": "parsed", "data": data}
                            return
                        except json.JSONDecodeError:
                            pass  # 继续累积

                # 最后再尝试一次
                json_match = re.search(r'\{.*\}', buffer, re.DOTALL)
                if json_match:
                    try:
                        data = json.loads(json_match.group())
                        yield {"event": "parsed", "data": data}
                        return
                    except json.JSONDecodeError:
                        pass

                yield {"event": "error", "data": "AI 返回格式异常，请重试"}

    except Exception as e:
        yield {"event": "error", "data": f"AI 调用失败: {str(e)}"}


# ─── 统一入口 ───────────────────────────────────────────

async def generate_narrative_stream(prompt: str) -> AsyncGenerator[dict, None]:
    """
    根据配置选择 LLM Provider，返回流式生成结果

    Yields:
        {"event": str, "data": any}
        - event: "thinking" | "parsed" | "done" | "error"
    """
    provider = settings.llm_provider.lower()

    if provider == "anthropic":
        async for event in _anthropic_stream(prompt):
            yield event
    elif provider == "deepseek":
        async for event in _deepseek_stream(prompt):
            yield event
    else:
        # 默认使用 OpenAI
        async for event in _openai_stream(prompt):
            yield event