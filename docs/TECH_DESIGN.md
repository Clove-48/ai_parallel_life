# AI 平行人生 — 技术方案设计

> **版本**: v1.0  
> **日期**: 2026-06-18  
> **状态**: 草案  

---

## 目录

1. [技术架构总览](#1-技术架构总览)
2. [前端方案](#2-前端方案)
3. [后端方案](#3-后端方案)
4. [AI 集成方案](#4-ai-集成方案)
5. [数据方案](#5-数据方案)
6. [部署方案](#6-部署方案)
7. [关键技术决策](#7-关键技术决策)

---

## 1. 技术架构总览

### 1.1 架构图

```
┌─────────────────────────────────────────────────────┐
│                   客户端 (Browser)                     │
│  ┌─────────────────────────────────────────────────┐ │
│  │              纯静态前端 (SPA)                    │ │
│  │  首页 → 对话采集 → 生成页 → 时间线 → 感悟卡 → 分享 │ │
│  │          ↑                          ↑            │ │
│  │     localStorage ← → 后端 API ← → Canvas 渲染     │ │
│  └─────────────────────────────────────────────────┘ │
└────────────────────────┬────────────────────────────┘
                         │ HTTP / JSON
┌────────────────────────▼────────────────────────────┐
│                 轻量后端服务                          │
│  ┌──────────┐  ┌──────────┐  ┌──────────────────┐  │
│  │ REST API │  │ LLM Gateway │  │ SQLite DB       │  │
│  │ (FastAPI)│  │ (OpenAI SDK)│  │ (用户故事记录)   │  │
│  └──────────┘  └──────────┘  └──────────────────┘  │
└────────────────────────┬────────────────────────────┘
                         │
              ┌──────────▼──────────┐
              │  LLM API (Claude/GPT) │
              └─────────────────────┘
```

### 1.2 技术栈

| 层次 | 技术选型 | 理由 |
|------|----------|------|
| **前端** | 纯 HTML + CSS + JavaScript (无框架) | 轻量、无需构建、快速开发 |
| **后端** | Python + FastAPI | 快速开发、原生异步支持 |
| **数据库** | SQLite (通过 SQLAlchemy) | 零配置、轻量、适合小规模 |
| **AI** | OpenAI API / Claude API | 成熟的 LLM 接口 |
| **部署** | 前端 → 静态托管 / 后端 → 简单服务器 | 低运维成本 |

---

## 2. 前端方案

### 2.1 页面路由（SPA 单页应用）

采用前端 hash 路由实现单页切换：

| 路由 | 页面 | 说明 |
|------|------|------|
| `#/` | 首页 | 欢迎引导页 |
| `#/chat` | 对话采集 | AI 引导对话 |
| `#/generating` | 生成过渡 | 加载动画 |
| `#/timeline/:id` | 时间线展示 | 双线叙事 |
| `#/card/:id` | 感悟卡片 + 分享 | 最终页 |
| `#/history` | 历史记录 | 过往故事列表 |

### 2.2 核心模块划分

```
/HTML
├── ai-parallel-life.html    # 主页面（SPA 容器）
├── _shared/
│   └── fonts/               # 字体文件
├── css/
│   └── style.css            # 全局样式
├── js/
│   ├── app.js               # 应用入口 + 路由
│   ├── router.js            # Hash 路由管理
│   ├── api.js               # 后端 API 调用
│   ├── store.js             # 本地状态管理 (localStorage)
│   ├── pages/
│   │   ├── home.js          # 首页逻辑
│   │   ├── chat.js          # 对话采集页逻辑
│   │   ├── generating.js    # 生成过渡页逻辑
│   │   ├── timeline.js      # 时间线展示页逻辑
│   │   ├── card.js          # 感悟卡片页逻辑
│   │   └── history.js       # 历史记录页逻辑
│   ├── components/
│   │   ├── CardFactory.js   # 多媒介卡片渲染工厂
│   │   ├── CanvasCard.js    # Canvas 感悟卡生成
│   │   ├── ChatBubble.js    # 聊天气泡组件
│   │   └── ShareSheet.js    # 分享面板组件
│   └── utils/
│       ├── animations.js    # 动画工具
│       └── format.js        # 格式化工具
└── assets/
    └── *.jpg                # 静态图片资源
```

### 2.3 多媒介卡片渲染

每种卡片类型是一个独立的渲染函数，接收场景数据返回 DOM 元素：

| 卡片类型 | 视觉风格 | 渲染方式 |
|----------|----------|----------|
| `chat` | 模拟即时通讯对话截图 | CSS + DOM |
| `moment` | 模拟朋友圈时间线 | CSS + DOM |
| `photo` | 场景照片（文字 + 占位插画） | CSS + SVG 占位 |
| `voicenote` | 模拟语音消息卡片 | CSS + DOM |
| `diary` | 模拟手写日记风格 | CSS + 衬线字体 |

### 2.4 感悟卡片生成（Canvas）

- 使用 HTML5 Canvas 渲染感悟卡片
- 支持自定义背景色、文字排版
- 输出为 PNG 图片供用户保存
- 方案：先用 CSS 布局展示，再通过 `canvas` 绘制导出

### 2.5 动效方案

- CSS `@keyframes` 实现卡片渐入动画
- CSS `transition` 实现页面切换过渡
- 不使用第三方动画库，保持轻量

---

## 3. 后端方案

### 3.1 API 设计

```
POST  /api/stories              # 创建故事（提交用户输入）
GET   /api/stories/:id          # 获取故事详情
GET   /api/stories              # 获取历史故事列表
DELETE /api/stories/:id         # 删除故事
POST  /api/generate             # 触发 AI 叙事生成
```

### 3.2 FastAPI 服务结构

```
backend/
├── main.py              # 应用入口
├── config.py            # 配置管理
├── database.py          # 数据库连接
├── models/
│   └── story.py         # SQLAlchemy 模型
├── schemas/
│   └── story.py         # Pydantic 数据模型
├── routers/
│   └── stories.py       # API 路由
├── services/
│   ├── llm_service.py   # LLM 调用封装
│   └── narrative.py     # 叙事生成逻辑
└── requirements.txt     # 依赖清单
```

### 3.3 LLM 调用封装

- 支持 OpenAI 和 Anthropic 两种 API
- 通过环境变量配置 API Key 和模型选择
- 流式响应支持（SSE），实现打字机效果
- Prompt 模板管理（中文情感叙事引导）

### 3.4 Prompt 设计方案

**系统提示词核心要素：**
- 角色设定：温暖、共情、有文学素养的叙事者
- 输出格式：结构化的 JSON（包含两条叙事线 + 多媒介场景）
- 风格要求：中文文学化表达，避免 AI 腔调，注重情感细节
- 安全约束：不生成负面/有害内容，保持积极导向

---

## 4. AI 集成方案

### 4.1 叙事生成流程

```
用户输入（关键节点描述）
        │
        ▼
Prompt 组装（系统提示词 + 用户输入）
        │
        ▼
调用 LLM API（流式响应）
        │
        ▼
解析返回的 JSON 结构
        │
        ▼
存入数据库 → 返回给前端渲染
```

### 4.2 输出格式约定

LLM 返回的叙事数据格式：

```json
{
  "title": "如果当初去了北京",
  "realLine": [
    { "type": "diary", "scene": "毕业那天的决定", "content": "2019年6月，我坐在宿舍里...", "emotion": "犹豫" },
    { "type": "chat", "scene": "和妈妈的对话", "content": "妈：你真的想好了吗？\n我：嗯，成都挺好的...", "emotion": "安心" },
    { "type": "photo", "scene": "成都的第一份工作", "content": "写字楼下的银杏树，金黄色的秋天...", "emotion": "平静" }
  ],
  "parallelLine": [
    { "type": "chat", "scene": "机场告别", "content": "我：北京，我来了。\n朋友：加油！", "emotion": "兴奋" },
    { "type": "moment", "scene": "入职第一天", "content": "新工牌、新电脑、新城市...一切都很陌生却让人期待", "emotion": "紧张而期待" },
    { "type": "voicenote", "scene": "深夜加班后的语音", "content": "今天又加班到十点，但项目终于上线了...", "emotion": "疲惫但满足" }
  ],
  "reflection": {
    "insight": "你一直渴望的，不是远方，而是选择的勇气",
    "message": "无论选择哪条路，你都在认真生活。这本身就值得骄傲。"
  }
}
```

---

## 5. 数据方案

### 5.1 数据库模型（SQLite）

```python
class Story(Base):
    __tablename__ = "stories"
    
    id = Column(String, primary_key=True)  # UUID
    created_at = Column(DateTime, default=datetime.utcnow)
    title = Column(String)
    user_input = Column(JSON)        # 用户输入的节点信息
    narratives = Column(JSON)        # LLM 返回的叙事数据
    reflection = Column(JSON)        # 感悟卡片数据
```

### 5.2 前端存储

- **localStorage**: 缓存用户的历史故事列表（减少 API 调用）
- **sessionStorage**: 暂存当前正在生成的故事数据

---

## 6. 部署方案

### 6.1 前端部署

- 纯静态文件，可部署到任意静态托管服务
- 推荐：GitHub Pages / Vercel / Netlify
- 无构建步骤，直接上传 HTML/CSS/JS 文件

### 6.2 后端部署

- 轻量部署：单台云服务器即可
- 使用 `uvicorn` 运行 FastAPI
- 可选：使用 `gunicorn` + `uvicorn` 多进程
- 环境变量管理 API Key

### 6.3 开发环境

```bash
# 前端
直接在浏览器打开 HTML 文件即可开发

# 后端
cd backend
pip install -r requirements.txt
uvicorn main:app --reload
```

---

## 7. 关键技术决策

| 决策项 | 选择 | 替代方案 | 理由 |
|--------|------|----------|------|
| 前端框架 | 无框架 | React/Vue | 页面逻辑简单，无需构建工具链 |
| 后端框架 | FastAPI | Flask/Django | 原生异步性能好，自动 API 文档 |
| 数据库 | SQLite | PostgreSQL | 小规模场景，零运维成本 |
| AI API | 多 Provider 支持 | 单一 | 灵活切换，避免依赖锁定 |
| 流式输出 | 是 | 否 | 提升用户体验，减少等待焦虑 |
| 前端状态管理 | localStorage | IndexedDB | 简单够用，开发成本低 |