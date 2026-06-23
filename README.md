# AI 平行人生

> What If You Had Chosen Differently?

输入你人生中的任何一个关键节点，AI 为你推演另一条岔路上的故事——不是冷冰冰的推演报告，而是一次沉浸式的情感体验，一次与自己的温柔对话。

***

## 概述

AI 平行人生是一款基于 LLM 驱动的情感体验类 Web 应用。用户通过与 AI 引导师自然对话，讲述人生中某个关键选择节点，AI 会生成两条平行的叙事线（真实之路 & 平行时空），以多种媒介卡片（聊天记录、朋友圈、日记、照片、语音消息）呈现，最终生成一张可收藏、可分享的感悟卡片。

**核心理念**：每一条路都有它的风景，重要的是你认真走过了选择的路。

***

## 功能特性

### 核心流程
- **AI 智能对话** — 自然语言引导，像朋友聊天一样收集人生节点信息（支持流式 SSE 实时输出）
- **双线叙事生成** — 真实线（基于实际经历）和平行线（基于"如果当初"的推演），每条线 3-5 个场景
- **时间线沉浸浏览** — 双线分屏展示，支持拖拽分割线调整比例，单线切换
- **感悟卡片** — Canvas 渲染的精美卡片，支持翻转查看关键词对比、收藏、分享

### 多模态内容
- **聊天中插入图片/语音** — 上传后立即在聊天流里显示（像发微信图片/语音一样），同时 LLM 会"看到"你发了图并理解场景
- **照片自动挂到真实线** — 用户上传的真实照片只挂到"真实之路"（用户走过的路），平行时空（没走过的路）不会出现用户照片
- **多张照片自动分配** — 用户上传多张照片时，按真实线里 photo 卡片顺序轮询绑定，不同 photo 卡片挂不同的图
- **失败可重试** — 聊天连接出错 / LLM 调用失败 / 图片上传失败时，均有"重新发送"通道

### 内容质量
- **多媒介卡片** — 聊天截图、朋友圈动态、日记、照片描述、语音消息五种风格
- **关键词精准提取** — 关键词必须是 2~4 字的词（不是句段、不是虚词），结合 LLM 生成 + 文本 n-gram 提取 + 兜底词库三级保障
- **时间线一致性铁律** — 真实线与平行线时间标签对齐，绝不出现"3 年后还刚上大一"的时间错位

### 体验与降级
- **结束语动画** — 随机感言语录，营造沉浸式情感体验
- **历史记录** — 浏览、回看、删除过往生成的故事，支持本地与云端同步
- **降级模式** — 后端不可用时自动切换本地模式，保证核心体验可用
- **头像系统** — AI 用 ✦ 星光，用户用 ☾ 月光 — 图形符号代替文字，沉浸感更强
- **内测反馈** — 内置反馈收集渠道，支持用户提交建议

***

## 技术栈

| 层级         | 技术                                        |
| ---------- | ----------------------------------------- |
| **前端**     | HTML5 / CSS3 / Vanilla JavaScript (SPA)   |
| **路由**     | Hash-based SPA Router                     |
| **样式**     | 自定义设计系统（雾散见光），CSS Variables + 响应式布局       |
| **Canvas** | 原生 Canvas API（感悟卡渲染）                      |
| **后端**     | Python 3.11+ / FastAPI                    |
| **数据库**    | SQLite + SQLAlchemy ORM                   |
| **AI 服务**  | DeepSeek / OpenAI / Anthropic（可切换），流式 SSE |
| **部署**     | Docker + Docker Compose + Nginx           |

***

## 项目结构

```
ai-parallel-life/
├── HTML/                          # 前端 SPA
│   ├── ai-parallel-life.html      # 入口 HTML
│   ├── css/
│   │   └── style.css              # 全局样式（视觉系统 v3.0）
│   ├── js/
│   │   ├── app.js                 # 应用入口，全局 Toast & 错误处理
│   │   ├── router.js              # Hash 路由管理器
│   │   ├── api.js                 # 后端 API 调用（含重试 & 降级）
│   │   ├── store.js               # 本地状态管理 + localStorage 持久化
│   │   ├── pages/
│   │   │   ├── home.js            # 首页（欢迎引导）
│   │   │   ├── chat.js            # 对话采集（LLM 智能对话 + 媒体上传 + 失败重试）
│   │   │   ├── generating.js      # 生成过渡（SSE 流式加载）
│   │   │   ├── timeline.js        # 时间线展示（双线分屏 + 真实线独占照片）
│   │   │   ├── card.js            # 感悟卡片（翻转/收藏/分享/反馈/关键词）
│   │   │   └── history.js         # 历史记录
│   │   ├── components/
│   │   │   ├── CardFactory.js     # 多媒介卡片渲染（含真实线图片轮询绑定）
│   │   │   ├── CanvasCard.js      # Canvas 感悟卡绘制
│   │   │   ├── ShareSheet.js      # 分享面板
│   │   │   └── EntryAnimation.js  # 入场动画
│   │   └── utils/
│   │       └── helpers.js         # 工具函数（防抖/节流/校验/存储）
│   └── assets/                    # 静态资源
│
├── backend/                       # 后端 API
│   ├── main.py                    # FastAPI 入口，中间件 & 全局异常处理
│   ├── config.py                  # 配置管理（Pydantic Settings）
│   ├── database.py                # SQLite 连接 & 自动迁移
│   ├── models/
│   │   └── story.py               # SQLAlchemy 数据模型
│   ├── schemas/
│   │   └── story.py               # Pydantic 请求/响应模型（含 attachments 字段）
│   ├── routers/
│   │   ├── chat.py                # 对话 API（流式 SSE + 字段提取 + attachments 透传）
│   │   ├── generate.py            # 叙事生成 API（SSE 流式）
│   │   ├── stories.py             # 故事 CRUD API
│   │   ├── upload.py              # 文件上传 API
│   │   └── feedback.py            # 反馈收集 API
│   ├── services/
│   │   ├── llm_service.py         # LLM 调用封装（DeepSeek/OpenAI/Anthropic）
│   │   ├── chat_service.py        # 智能对话 Prompt + 流式 + attachments 注入
│   │   └── narrative.py           # 叙事生成逻辑 + 关键词兜底 + 媒体约束
│   ├── requirements.txt
│   ├── Dockerfile
│   ├── .env.example
│   └── test_integration.py        # 全流程集成测试
│
├── docker-compose.yml             # Docker 编排
├── nginx.conf                     # Nginx 配置（静态托管 + API 代理）
├── .dockerignore
├── serve_nocache.py               # 开发用静态服务器（禁用缓存）
└── README.md
```

***

## 快速开始

### 前置要求

- Python 3.11+
- Node.js（可选，用于前端开发服务器）
- DeepSeek API Key（或其他 LLM 提供商）

### 1. 克隆 & 安装

```bash
git clone https://github.com/Clove-48/ai_parallel_life.git
cd ai_parallel_life
```

### 2. 配置后端

```bash
cd backend
cp .env.example .env
```

编辑 `.env`，填入你的 API Key：

```env
DEEPSEEK_API_KEY=sk-your-deepseek-api-key
LLM_PROVIDER=deepseek
```

安装依赖：

```bash
pip install -r requirements.txt
```

### 3. 启动后端

```bash
uvicorn main:app --host 127.0.0.1 --port 8000 --reload
```

后端运行在 `http://127.0.0.1:8000`，API 文档自动生成在 `http://127.0.0.1:8000/docs`。

### 4. 启动前端

**方式 A：开发服务器（推荐）**

```bash
# 在项目根目录
python serve_nocache.py 5500
```

访问 <http://localhost:5500>。

**方式 B：直接打开**

用浏览器打开 `HTML/ai-parallel-life.html`（注意：需要后端 CORS 已配置）。

***

## Docker 部署

```bash
# 在项目根目录
docker-compose up -d
```

- 前端：`http://localhost`（端口 80）
- 后端 API：`http://localhost:8000/api`
- Nginx 自动处理静态文件托管和 API 反向代理

环境变量通过 `.env` 文件或命令行传入：

```bash
DEEPSEEK_API_KEY=sk-xxx docker-compose up -d
```

***

## API 概览

| 方法       | 路径                  | 说明                                      |
| -------- | ------------------- | --------------------------------------- |
| `GET`    | `/api/health`       | 健康检查                                    |
| `POST`   | `/api/chat`         | AI 对话（非流式，attachments 透传）              |
| `POST`   | `/api/chat/stream`  | AI 对话（SSE 流式，attachments 透传）            |
| `POST`   | `/api/chat/extract` | 从对话提取结构化字段                              |
| `POST`   | `/api/generate`     | 生成叙事（SSE 流式）                            |
| `GET`    | `/api/stories`      | 故事列表                                    |
| `POST`   | `/api/stories`      | 创建故事                                    |
| `GET`    | `/api/stories/{id}` | 故事详情                                    |
| `DELETE` | `/api/stories/{id}` | 删除故事                                    |
| `POST`   | `/api/upload`       | 上传文件（图片/音频）                             |
| `POST`   | `/api/feedback`     | 提交反馈                                    |

### Chat 消息格式（支持附件）

```json
{
  "messages": [
    {
      "role": "user",
      "content": "这是我毕业那年的照片",
      "attachments": [
        {
          "url": "/uploads/images/xxx.jpg",
          "type": "image",
          "filename": "graduation.jpg"
        }
      ]
    }
  ]
}
```

后端会把 `attachments` 转成自然语言描述（如 `[用户附带了一张图片: graduation.jpg]`）注入到 user content 发送给 LLM，让纯文本模型也能"看到"用户发了图。

***

## 配置项

| 环境变量                | 默认值                            | 说明                                          |
| ------------------- | ------------------------------ | ------------------------------------------- |
| `LLM_PROVIDER`      | `deepseek`                     | LLM 提供商：`deepseek` / `openai` / `anthropic` |
| `DEEPSEEK_API_KEY`  | —                              | DeepSeek API Key                            |
| `DEEPSEEK_MODEL`    | `deepseek-chat`                | DeepSeek 模型名                                |
| `DEEPSEEK_BASE_URL` | `https://api.deepseek.com`     | DeepSeek API 地址                             |
| `OPENAI_API_KEY`    | —                              | OpenAI API Key                              |
| `OPENAI_MODEL`      | `gpt-4o-mini`                  | OpenAI 模型名                                  |
| `ANTHROPIC_API_KEY` | —                              | Anthropic API Key                           |
| `ANTHROPIC_MODEL`   | `claude-3-haiku-20240307`      | Anthropic 模型名                               |
| `DATABASE_URL`      | `sqlite:///./parallel_life.db` | 数据库连接                                       |
| `HOST`              | `0.0.0.0`                      | 服务监听地址                                      |
| `PORT`              | `8000`                         | 服务端口                                        |
| `CORS_ORIGINS`      | `http://localhost:8765,...`    | 允许的跨域来源                                     |

***

## 测试

```bash
cd backend
# 先启动后端服务
uvicorn main:app --host 127.0.0.1 --port 8000 &

# 运行集成测试
python test_integration.py
```

测试覆盖：健康检查 → 对话 API（含 attachments）→ 字段提取 → SSE 叙事生成 → 故事 CRUD → 反馈提交 → 404 处理。

***

## 设计理念

- **视觉系统**：雾散见光（Fog → Warm → Light），三层情绪色调递进
- **双线叙事**：暖黄色（真实之路）与淡紫色（平行时空）的色彩区分
- **照片归属**：用户的真实照片只属于"真实之路"——平行时空是用户没走过的路，那里没有用户的记忆
- **多图布局**：多张照片按真实线 photo 卡片顺序轮询分配，避免堆叠重复
- **降级优先**：后端不可用时自动切换本地模式，核心体验不出走
- **失败可重试**：任何一步出错都给出重试通道（对话、生成、上传），不让用户卡住
- **移动优先**：响应式布局，触摸友好的交互设计

***

## 许可

MIT License
