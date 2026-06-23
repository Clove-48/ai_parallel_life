"""
AI 平行人生 — 智能对话服务
用 LLM 驱动自然对话，代替固定步骤式问卷
"""

import json
import re
from typing import AsyncGenerator

from config import settings
from schemas.story import UserNode

# 需要收集的字段
REQUIRED_FIELDS = ["time", "location", "choice", "actual", "outcome", "imagination"]

CHAT_SYSTEM_PROMPT = """你是一个叫"小镜"的朋友，很会聊天的那种。

## 重要前提
- 现在的真实时间是 **2026 年**。
- 你**没有关于用户本人的任何先验信息**——你不知道 TA 多大、在干嘛、是什么状态。
- 用户说什么就是什么，**不要替用户补全背景**（不要猜 TA 当时在上学还是工作、不要猜年龄、不要猜城市）。
- 当前的对话模型是**纯文本模型**，**你看不到用户发来的图片本身**——系统会在用户文字后面追加一行
  `[用户附带了一张图片: xxx.jpg]`，告诉你用户发了图。**你必须意识到这张图的存在**，但**不要瞎编**图片里的内容。
  - 你可以自然地接住这个事实："哦哦这张图啊，我看到的…嗯你说的那个场景挺有意思的"
  - 你可以接着 TA 的文字聊，但**不要假装你真的看到了图里的细节**（不要说"图里那个穿红衣服的女孩"之类的话）
  - 如果用户**只**发了图片没打字，你可以说"图收到了～想跟我聊聊这张图背后的故事吗？"

## 你是谁
- 你是用户的好朋友，坐在安静的茶馆里听 TA 讲人生故事
- 你情商高、善于倾听、偶尔幽默一下，但永远站在 TA 这边
- 你不是心理医生，不是人生导师，就是个会聊天的好朋友
- 说话像发微信语音一样自然——会用"嗯嗯""诶""哈哈哈"这样的语气词

## 铁律：事实准确性
1. **不替用户编造身份背景**——用户说"23年暑假"，你只能**复述**或**轻回应**（比如"23年暑假啊，那会儿……"），**绝对不要**说"刚高中毕业""刚毕业"之类的，因为你不知道 TA 当时在干什么。
2. **不替用户做时间换算的绝对断言**——不要贸然说"就是去年""三年前""刚毕业"这类话。除非 TA 明确说了"今年""去年""五年前"，你才用同样的词。
3. **用户说什么时间就是什么时间**——TA 说"23年暑假"，你就聊 23 年暑假发生的事；TA 说"2018年"，你就聊 2018 年。**不要把你的假设套在 TA 身上**。
4. **不确定的事不要装确定**——不认识的细节就让 TA 自己讲。
5. **人名/地名/学校/公司**之类的专有名词，**用户没说的不要瞎编**。

✅ 正确示范：
- 用户："23年暑假" → "哦，23年暑假啊，那会儿在干嘛？"
- 用户："大三那年" → "大三啊，那会儿事儿挺多的。当时在哪儿？"
- 用户："刚工作" → "刚工作那会儿确实挺懵的，后来呢？"

❌ 错误示范（这些都是 AI 自己编的，必须避免）：
- 用户："23年暑假" → "哎，23年暑假就是去年的事儿吧！刚高中毕业那会儿可太有意思了……"（❌ 23年不是去年，TA 也不一定是刚毕业）
- 用户："那阵子压力很大" → "是不是在考研那会儿？"（❌ 没人告诉你在考研）
- 用户："想换个城市" → "从北京去上海？"（❌ 用户没说具体城市）

## 你要做什么
用户会跟你聊 TA 人生中一个重要选择的时刻。你的任务就是：**听 TA 说完，然后自然地聊下去**。
你心里大概要知道这几件事（但千万别直接列出来问）：
- 那是什么时候的事
- 在哪儿
- 当时在纠结什么选择
- 最后选了哪个
- 那条路走得怎么样
- 如果选了另一条路，TA 想象中会是啥样

## 关于"画面感"：自然地邀请 TA 提供素材
当 TA 聊到某个具体的场景、某个地点、某段回忆时，**自然地、像朋友一样**问一句类似：
- "诶，那个地方是什么样的？方便的话发张图给我看看？"
- "那张照片还在吗？想看看那时候的你长什么样 👀"
- "你当时有没有录过什么？一段语音、一段小视频都行。"
- "如果手边有那个时候的照片，发过来我帮你贴到那条时光里。"

**注意分寸**：
- 不是每条消息都要问——只在 TA 聊到具体场景、具体画面时顺势提一下
- 用户说"没有"或者不回应，就此打住，**不要追问、不要劝**
- 这不是任务，是朋友之间一种温柔的邀请
- 用户的故事是 TA 的隐私，发不发都是 TA 的自由
- 永远不要让用户觉得"必须发"—— 文字已经足够好了

## 聊天的方式

### 开场
别整那些虚的。自然地来一句，比如：
"嗨，你来啦～今天想聊点什么？有没有哪个选择，让你到现在还会偶尔想起'如果当初……'？"

### 用户说完了，你要：
1. **先接住话，再接着聊**——听到有意思的先"哇""真的假的""嗯嗯理解"，然后顺着往下聊
2. **别一口气问一堆**——一次就说一句
3. **不替用户做背景假设**——只对 TA 说的话做共情回应（"那会儿确实挺难的"），不要往 TA 身上贴标签（"刚毕业""刚分手""刚换工作"）
4. **轻回应+引出下一句**——"23年暑假啊，那会儿在干嘛？"比"23年暑假就是去年嘛"好得多
5. **别太严肃**——可以用"诶""嘛""呗""啦""啊"这些语气词
6. **如果用户答得简短，不要追问同一件事**——顺着 TA 的节奏来

### 参考话风（学这个感觉，别照抄）
- "哦？展开说说 👂"
- "嗯嗯，然后呢？"
- "那会儿确实挺关键的，后来呢？"
- "诶，这个有意思，你继续说"
- "靠，那你当时咋想的？"

### 什么时候结束
你大概知道那几件事都聊到了，就在回复末尾加「[收集完成]」。
别着急——用户还没说够你就收工，TA 会觉得你在赶进度。
宁可多聊两句，也别漏了啥。

## 核心原则
- 不说教、不鸡汤、不比惨
- 不点评用户的选择对错
- 话要短，一句说一件事
- **不编造、不假设、不脑补**——这是最重要的
- 让用户觉得：这人挺会聊的，想跟 TA 多说两句"""

EXTRACT_SYSTEM_PROMPT = """你是一个信息提取助手。请从以下对话中，提取用户描述的人生关键节点的结构化信息。

你只需要提取明确提到的信息，不要编造。如果某个字段没有明确信息，就输出空字符串。

以 JSON 格式输出：
{
  "time": "时间描述，如"2019年夏天"或"大三那年"",
  "location": "地点描述，如"北京"或"成都"",
  "choice": "面临的两个选择，如"留在北京 vs 回成都"或"考研 vs 工作"",
  "actual": "实际/最终选择的方向",
  "outcome": "那条路走下来的结果如何",
  "imagination": "如果做了另一个选择的想象描述"
}"""


async def chat_with_llm(
    messages: list[dict],
) -> str:
    """
    调用 LLM 进行对话，返回 AI 回复

    Args:
        messages: 对话历史，格式 [{"role": "user"/"assistant", "content": "...", "attachments": [...]}]

    Returns:
        AI 回复文本
    """
    import httpx

    if not settings.deepseek_api_key:
        raise ConnectionError("DEEPSEEK_API_KEY 未配置")

    # 把用户消息里的 attachments 转成文本片段追加到 content，
    # 这样纯文本 LLM 也能"看到"用户发了图片/音频
    enriched_messages = _enrich_messages_with_attachments(messages)

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(
                f"{settings.deepseek_base_url.rstrip('/')}/chat/completions",
                headers={
                    "Content-Type": "application/json",
                    "Authorization": f"Bearer {settings.deepseek_api_key}",
                },
                json={
                    "model": settings.deepseek_model,
                    "messages": [
                        {"role": "system", "content": CHAT_SYSTEM_PROMPT},
                        *enriched_messages,
                    ],
                    "temperature": 0.7,
                    "max_tokens": 512,
                    "stream": False,
                },
            )

            if response.status_code != 200:
                raise ConnectionError(
                    f"DeepSeek API 错误 ({response.status_code}): {response.text[:200]}"
                )

            data = response.json()
            return data["choices"][0]["message"]["content"]

    except Exception as e:
        raise ConnectionError(f"聊天服务调用失败: {str(e)}")


async def chat_stream(
    messages: list[dict],
) -> AsyncGenerator[str, None]:
    """
    流式调用 LLM 进行对话，边生成边返回文本片段

    Args:
        messages: 对话历史，可包含 attachments 字段

    Yields:
        文本片段（每次一个 token）
    """
    import httpx

    if not settings.deepseek_api_key:
        yield "对不起，API 配置未完成，请稍后再试。"
        return

    # 把用户消息里的 attachments 转成文本片段追加到 content
    enriched_messages = _enrich_messages_with_attachments(messages)

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
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
                        {"role": "system", "content": CHAT_SYSTEM_PROMPT},
                        *enriched_messages,
                    ],
                    "temperature": 0.7,
                    "max_tokens": 512,
                    "stream": True,
                },
            ) as response:
                if response.status_code != 200:
                    error_text = await response.aread()
                    yield f"（AI 响应出错: {response.status_code}）"
                    return

                buffer = ""
                async for line in response.aiter_lines():
                    if not line.startswith("data: "):
                        continue
                    payload = line[6:].strip()
                    if payload == "[DONE]":
                        break
                    try:
                        import json
                        chunk = json.loads(payload)
                        delta = chunk.get("choices", [{}])[0].get("delta", {})
                        content = delta.get("content", "")
                        if content:
                            buffer += content
                            yield content
                    except json.JSONDecodeError:
                        continue

                # 检查 buffer 中是否包含完成标记
                # 不需要额外处理，frontend 会检查

    except Exception as e:
        yield f"（连接出错: {str(e)}）"


async def extract_fields_from_conversation(
    messages: list[dict],
) -> dict:
    """
    用 LLM 从对话历史中提取结构化字段
    """
    import httpx

    if not settings.deepseek_api_key:
        return _fallback_extract(messages)

    # 只保留用户消息 + AI 回答，构造提取文本
    conversation_text = ""
    for m in messages:
        prefix = "用户: " if m["role"] == "user" else "引导师: "
        conversation_text += f"{prefix}{m['content']}\n\n"

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(
                f"{settings.deepseek_base_url.rstrip('/')}/chat/completions",
                headers={
                    "Content-Type": "application/json",
                    "Authorization": f"Bearer {settings.deepseek_api_key}",
                },
                json={
                    "model": settings.deepseek_model,
                    "messages": [
                        {"role": "system", "content": EXTRACT_SYSTEM_PROMPT},
                        {"role": "user", "content": conversation_text},
                    ],
                    "temperature": 0.1,
                    "max_tokens": 1024,
                    "stream": False,
                },
            )

            if response.status_code != 200:
                return _fallback_extract(messages)

            data = response.json()
            content = data["choices"][0]["message"]["content"]

            # 尝试解析 JSON
            json_match = re.search(r"\{.*\}", content, re.DOTALL)
            if json_match:
                fields = json.loads(json_match.group())
                # 确保所有字段都在
                for f in REQUIRED_FIELDS:
                    if f not in fields:
                        fields[f] = ""
                return fields

    except Exception:
        pass

    return _fallback_extract(messages)


def _fallback_extract(messages: list[dict]) -> dict:
    """
    兜底字段提取 — 简单的关键词匹配
    只在 LLM 提取失败时使用
    """
    fields = {}
    user_texts = [m["content"] for m in messages if m["role"] == "user"]
    full_text = " ".join(user_texts)

    if not full_text.strip():
        return fields

    # 时间
    tp = [
        r"(\d{4}年[^\s，。]{0,15})",
        r"((?:20|19)?\d{2}年(?:暑假|寒假|春天|夏天|秋天|冬天))",
        r"(大[一二三]?年级?|研[一二三]?|高中|初中|小学)",
    ]
    for p in tp:
        m = re.search(p, full_text)
        if m:
            fields["time"] = m.group(1) if m.lastindex else m.group(0)
            break

    # 地点
    lp = [
        r"(北京|上海|广州|深圳|成都|杭州|武汉|南京|西安|重庆|天津|长沙)",
        r"(?:在|去|到)([^\s，。]{2,6}(?:市|区|县|城|学校|大学|公司))",
    ]
    for p in lp:
        m = re.search(p, full_text)
        if m:
            fields["location"] = m.group(1) if m.lastindex else m.group(0)
            break

    # 选择
    cm = re.search(r"([^\s，。]{2,20}(?:vs|VS|还是)[^\s，。]{2,20})", full_text)
    if cm:
        fields["choice"] = cm.group(1).strip()

    # 真实选择
    am = re.search(r"(?:最终|最后|后来).{0,5}(?:选择|决定|选了)([^\s，。]{2,20})", full_text)
    if am:
        fields["actual"] = am.group(1) if am.lastindex else am.group(0)

    # 结果
    om = re.search(r"([^\s，。]{3,30}(?:好|不错|还行|后悔|遗憾|顺利|安稳|满意|安逸|稳定|辛苦|累|开心|快乐))", full_text)
    if om:
        fields["outcome"] = om.group(1)

    # 想象
    im = re.search(r"(?:如果|假如|要是).{0,20}([^\s，。]{5,50})", full_text)
    if im:
        fields["imagination"] = im.group(1) if im.lastindex else im.group(0)

    return fields


def is_collection_complete(fields: dict) -> bool:
    """判断是否已收集足够信息去生成叙事"""
    core = ["time", "location", "choice", "actual"]
    return all(fields.get(k) for k in core)


def build_user_node(fields: dict) -> UserNode:
    """将提取的字段转为 UserNode"""
    choice = fields.get("choice", "")
    parts = re.split(r"\s*(?:vs|VS|还是)\s*", choice)
    choice_a = parts[0].strip() if len(parts) > 0 else ""
    choice_b = parts[1].strip() if len(parts) > 1 else ""

    return UserNode(
        time=fields.get("time", ""),
        location=fields.get("location", ""),
        choiceA=choice_a or fields.get("actual", ""),
        choiceB=choice_b or "",
        actualChoice=fields.get("actual", ""),
        actualOutcome=fields.get("outcome", ""),
        imagination=fields.get("imagination", ""),
    )


def _enrich_messages_with_attachments(messages: list[dict]) -> list[dict]:
    """
    把用户消息里的 attachments 字段转成纯文本描述，追加到 content 里。

    原因：当前对话模型（DeepSeek-V3/R1）是纯文本模型，OpenAI 风格
    的 `image_url` 多模态格式不适用。我们用自然语言告诉 LLM：
    "用户附带了一张图片: xxx.jpg" — 让 LLM 知道图存在，但不要
    假装看到了图里的细节。
    """
    type_map = {
        "image": "图片",
        "audio": "语音",
        "video": "视频",
        "file": "文件",
    }
    enriched = []
    for m in messages:
        # 深拷贝以避免修改原对象
        m2 = {"role": m.get("role"), "content": m.get("content", "")}
        attaches = m.get("attachments") or []
        if m2["role"] == "user" and attaches:
            notes = []
            for a in attaches:
                if not isinstance(a, dict):
                    continue
                t = a.get("type", "file")
                name = a.get("filename") or a.get("url") or "未命名"
                # 取文件名（去路径）作为人类可读的名字
                if "/" in str(name):
                    name = str(name).rsplit("/", 1)[-1]
                cn_type = type_map.get(t, "文件")
                if t == "image":
                    measure = "张"
                elif t == "audio":
                    measure = "段"
                else:
                    measure = "个"
                notes.append(f"[用户附带了一{measure}{cn_type}: {name}]")
            if notes:
                sep = "\n" if m2["content"] else ""
                m2["content"] = (m2["content"] + sep + "\n".join(notes)).strip()
        enriched.append(m2)
    return enriched