"""
AI 平行人生 — 全流程集成测试
覆盖：健康检查 → 对话 → 生成 → 故事CRUD → 反馈

运行方式：
  python test_integration.py
  或
  pytest test_integration.py -v
"""

import json
import sys
import time
import urllib.request
import urllib.error

# Windows 控制台 UTF-8 支持
if sys.platform == "win32":
    import io
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8", errors="replace")

BASE_URL = "http://localhost:8000/api"

PASSED = 0
FAILED = 0


def check(name, condition, detail=""):
    global PASSED, FAILED
    if condition:
        PASSED += 1
        print(f"  ✅ {name}")
    else:
        FAILED += 1
        print(f"  ❌ {name}  {detail}")


def post(path, data):
    """发送 POST 请求"""
    url = f"{BASE_URL}{path}"
    body = json.dumps(data, ensure_ascii=False).encode("utf-8")
    req = urllib.request.Request(url, data=body, headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            return resp.status, json.loads(resp.read())
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read()) if e.fp else {}
    except Exception as e:
        return 0, {"error": str(e)}


def get(path):
    """发送 GET 请求"""
    url = f"{BASE_URL}{path}"
    try:
        with urllib.request.urlopen(url, timeout=10) as resp:
            return resp.status, json.loads(resp.read())
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read()) if e.fp else {}
    except Exception as e:
        return 0, {"error": str(e)}


def delete(path):
    """发送 DELETE 请求"""
    url = f"{BASE_URL}{path}"
    req = urllib.request.Request(url, method="DELETE")
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            return resp.status, json.loads(resp.read())
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read()) if e.fp else {}
    except Exception as e:
        return 0, {"error": str(e)}


def test_health_check():
    """测试 1: 健康检查"""
    print("\n📋 测试 1: 健康检查")
    status, data = get("/health")
    check("健康检查返回 200", status == 200, f"got {status}")
    check("返回 status: ok", data.get("status") == "ok", f"got {data}")
    check("返回 version", "version" in data)


def test_chat():
    """测试 2: 对话 API"""
    print("\n📋 测试 2: 对话 API")

    messages = [
        {"role": "user", "content": "2019年夏天，我在北京，面临留在北京 vs 回成都的选择"}
    ]
    status, data = post("/chat", {"messages": messages})
    check("对话返回 200", status == 200, f"got {status}")
    check("返回 reply 字段", "reply" in data, f"got {data}")
    check("返回 fields 字段", "fields" in data)
    check("返回 complete 字段", "complete" in data)


def test_chat_extract():
    """测试 3: 字段提取 API"""
    print("\n📋 测试 3: 字段提取 API")

    messages = [
        {"role": "user", "content": "2019年夏天，我在北京，面临留在北京 vs 回成都的选择。最后我选了留在北京。"},
        {"role": "assistant", "content": "嗯嗯，2019年夏天在北京，面临留在北京还是回成都的选择。最后你选了留在北京，那条路走得怎么样？"},
        {"role": "user", "content": "还不错，工作稳定，但有时候想如果当初回成都了会怎样。"}
    ]
    status, data = post("/chat/extract", {"messages": messages})
    check("提取返回 200", status == 200, f"got {status}")
    check("返回 fields", "fields" in data, f"got {data}")
    fields = data.get("fields", {})
    check("提取到 time", bool(fields.get("time")), f"fields={fields}")
    check("提取到 location", bool(fields.get("location")), f"fields={fields}")


def test_generate_stream():
    """测试 4: 叙事生成 SSE 流"""
    print("\n📋 测试 4: 叙事生成 SSE 流")

    user_input = {
        "time": "2019年夏天",
        "location": "北京",
        "choiceA": "留在北京",
        "choiceB": "回成都",
        "actualChoice": "留在北京",
        "actualOutcome": "工作稳定，但有时想家",
        "imagination": "如果回成都，可能生活更安逸，离家人更近"
    }

    url = f"{BASE_URL}/generate"
    body = json.dumps({"userInput": user_input, "chatMessages": []}, ensure_ascii=False).encode("utf-8")
    req = urllib.request.Request(url, data=body, headers={"Content-Type": "application/json"})

    try:
        with urllib.request.urlopen(req, timeout=180) as resp:
            check("生成 SSE 返回 200", resp.status == 200, f"got {resp.status}")

            events = []
            buffer = ""
            while True:
                chunk = resp.read(1024)
                if not chunk:
                    break
                buffer += chunk.decode("utf-8", errors="replace")
                # 解析 SSE 事件
                lines = buffer.split("\n")
                buffer = lines.pop() or ""
                for line in lines:
                    if line.startswith("event: "):
                        events.append(("event", line[7:].strip()))
                    elif line.startswith("data: "):
                        try:
                            data = json.loads(line[6:].strip())
                            events.append(("data", data))
                        except json.JSONDecodeError:
                            pass

            event_types = [e[1] for e in events if e[0] == "event"]
            check("收到 thinking 事件", "thinking" in event_types, f"events: {event_types}")
            check("收到 done 事件", "done" in event_types, f"events: {event_types}")

            # 检查 done 数据
            done_data = [e[1] for e in events if e[0] == "data" and isinstance(e[1], dict) and "id" in e[1]]
            if done_data:
                story = done_data[0]
                check("包含 id", "id" in story)
                check("包含 title", "title" in story)
                check("包含 narratives", "narratives" in story)
                check("包含 reflection", "reflection" in story)
                return story  # 返回 story 供后续测试使用
    except Exception as e:
        check("SSE 连接成功", False, str(e))
    return None


def test_stories_crud(story_id=None):
    """测试 5: 故事 CRUD"""
    print("\n📋 测试 5: 故事 CRUD")

    # 创建故事
    user_input = {
        "time": "2020年",
        "location": "上海",
        "choiceA": "考研",
        "choiceB": "工作",
        "actualChoice": "考研",
        "actualOutcome": "上岸了",
        "imagination": "如果工作了可能更早经济独立"
    }
    status, data = post("/stories", {"userInput": user_input})
    check("创建故事返回 200", status == 200, f"got {status}")
    check("创建返回 id", "id" in data, f"got {data}")
    created_id = data.get("id")

    # 列表
    status, data = get("/stories")
    check("列表返回 200", status == 200, f"got {status}")
    check("列表包含 stories", "stories" in data, f"got {data}")
    check("列表非空", len(data.get("stories", [])) > 0, f"count={len(data.get('stories', []))}")

    # 详情
    if created_id:
        status, data = get(f"/stories/{created_id}")
        check("详情返回 200", status == 200, f"got {status}")
        check("详情包含 narratives", "narratives" in data, f"got {data}")

        # 删除
        status, data = delete(f"/stories/{created_id}")
        check("删除返回 200", status == 200, f"got {status}")

        # 确认已删除
        status, data = get(f"/stories/{created_id}")
        check("已删除返回 404", status == 404, f"got {status}")


def test_feedback():
    """测试 6: 反馈 API"""
    print("\n📋 测试 6: 反馈 API")

    status, data = post("/feedback", {
        "content": "自动测试反馈：产品体验很好！",
        "version": "1.0.0-beta"
    })
    check("反馈返回 200", status == 200, f"got {status}")
    check("反馈返回 message", "message" in data, f"got {data}")

    # 空内容应被拒绝
    status, data = post("/feedback", {"content": "", "version": "1.0.0-beta"})
    check("空反馈被拒绝", status == 422, f"got {status}")


def test_404():
    """测试 7: 404 处理"""
    print("\n📋 测试 7: 404 异常处理")

    status, data = get("/nonexistent")
    check("不存在路由返回 404", status == 404, f"got {status}")


def main():
    global PASSED, FAILED

    print("=" * 60)
    print("🧪 AI 平行人生 — 全流程集成测试")
    print("=" * 60)

    # 先检查后端是否运行
    print("\n🔍 检查后端服务...")
    try:
        status, data = get("/health")
        if status == 200:
            print(f"  ✅ 后端运行中 (version: {data.get('version', 'unknown')})")
        else:
            print(f"  ❌ 后端返回异常状态码: {status}")
            print("\n请先启动后端服务: cd backend && uvicorn main:app --reload")
            sys.exit(1)
    except Exception as e:
        print(f"  ❌ 无法连接后端: {e}")
        print("\n请先启动后端服务: cd backend && uvicorn main:app --reload")
        sys.exit(1)

    # 运行测试
    test_health_check()
    test_chat()
    test_chat_extract()
    test_generate_stream()
    test_stories_crud()
    test_feedback()
    test_404()

    # 结果汇总
    print("\n" + "=" * 60)
    print(f"📊 测试结果: {PASSED} 通过 / {FAILED} 失败 / {PASSED + FAILED} 总计")
    if FAILED == 0:
        print("🎉 全部测试通过！")
    else:
        print(f"⚠️  有 {FAILED} 个测试失败，请检查")
    print("=" * 60)

    return FAILED == 0


if __name__ == "__main__":
    success = main()
    sys.exit(0 if success else 1)