"""
AI 平行人生 — 应用入口
FastAPI 应用初始化与启动
"""

from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles

from config import settings
from database import init_db


@asynccontextmanager
async def lifespan(app: FastAPI):
    """应用生命周期：启动时初始化数据库"""
    init_db()
    # 确保上传目录存在
    Path(settings.uploads_dir).mkdir(parents=True, exist_ok=True)
    yield


app = FastAPI(
    title="AI 平行人生 API",
    description="基于 AI 叙事生成的情感体验类 Web 产品后端",
    version="1.0.0",
    lifespan=lifespan,
)

# CORS 配置 — 允许前端跨域访问
origins = [o.strip() for o in settings.cors_origins.split(",") if o.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ─── 全局异常处理 ────────────────────────────────────────

@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    """全局异常处理，统一返回格式"""
    import traceback
    traceback.print_exc()
    return JSONResponse(
        status_code=500,
        content={"detail": "服务器内部错误，请稍后重试", "error": str(exc)},
    )


@app.exception_handler(404)
async def not_found_handler(request: Request, exc):
    return JSONResponse(
        status_code=404,
        content={"detail": "请求的资源不存在"},
    )


@app.exception_handler(405)
async def method_not_allowed_handler(request: Request, exc):
    return JSONResponse(
        status_code=405,
        content={"detail": "不支持的请求方法"},
    )


# ─── 请求日志中间件 ──────────────────────────────────────

@app.middleware("http")
async def request_logger(request: Request, call_next):
    import time
    start = time.time()
    response = await call_next(request)
    duration = time.time() - start
    # 只在非健康检查请求时打印
    if request.url.path != "/api/health":
        print(f"[{request.method}] {request.url.path} — {response.status_code} ({duration:.2f}s)")
    return response


# 挂载上传文件的静态目录
# 关键：加上 Cross-Origin-Resource-Policy: cross-origin 响应头，
# 避免 Chrome 90+ 的 ORB（Opaque Response Blocking）拦截跨源图片加载
uploads_path = Path(settings.uploads_dir)
uploads_path.mkdir(parents=True, exist_ok=True)


class StaticFilesCORP(StaticFiles):
    """支持跨源加载的静态文件服务 — 设置 CORP: cross-origin"""
    async def get_response(self, path, scope):
        response = await super().get_response(path, scope)
        response.headers["Cross-Origin-Resource-Policy"] = "cross-origin"
        response.headers["Access-Control-Allow-Origin"] = "*"
        return response


app.mount("/uploads", StaticFilesCORP(directory=str(uploads_path)), name="uploads")


# ─── 注册路由 ───────────────────────────────────────────

from routers.stories import router as stories_router
from routers.generate import router as generate_router
from routers.chat import router as chat_router
from routers.upload import router as upload_router
from routers.feedback import router as feedback_router

app.include_router(stories_router)
app.include_router(generate_router)
app.include_router(chat_router)
app.include_router(upload_router)
app.include_router(feedback_router)


@app.get("/api/health")
def health_check():
    """健康检查接口"""
    return {"status": "ok", "version": "1.0.0"}


# ─── 启动入口 ───────────────────────────────────────────

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "main:app",
        host=settings.host,
        port=settings.port,
        reload=True,
        reload_excludes=["test_*.py"],
    )