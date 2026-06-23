"""带禁用缓存的静态文件服务器 — 用于避免浏览器缓存 JS/CSS

特性：
  - HTTP 响应头禁用缓存（Cache-Control: no-store）
  - 在 HTML 中自动给 <script src=...> / <link href="*.js|css"> 注入 ?v=时间戳
  - 这样浏览器即使有强缓存，只要 HTML 改了，所有 JS/CSS 引用 URL 也变了，强制重新拉取
  - 根路径 /index.html 自动重定向到 /ai-parallel-life.html
"""
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import os
import sys
import re
import time
import threading

os.chdir(os.path.join(os.path.dirname(os.path.abspath(__file__)), "HTML"))

# 全局版本号：进程启动时确定一次，所有 HTML 响应都使用这个版本号
# 这样进程不重启就一致（避免每个请求都不同导致反复失效）
_BUILD_VERSION = str(int(time.time()))
_VER_INJECT_RE = re.compile(
    r'(<(?:script[^>]*?\bsrc|link[^>]*?\bhref)\s*=\s*["\'])(?!https?://|data:|#|mailto:)([^"\']+\.(?:js|css))(["\'])',
    re.IGNORECASE,
)
_lock = threading.Lock()


class NoCacheHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        # 强制禁用所有缓存
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()

    def do_GET(self):
        # 根路径直接重定向到主页面（避免显示目录列表）
        if self.path in ("/", "/index.html"):
            self.send_response(302)
            self.send_header("Location", "/ai-parallel-life.html")
            self.end_headers()
            return

        # HTML 文件：读取内容，注入 ?v=版本号
        if self.path.endswith(".html") or self.path.endswith(".htm"):
            self._serve_html_with_version()
            return

        return super().do_GET()

    def _serve_html_with_version(self):
        # 解析文件路径（去掉 query / fragment）
        from urllib.parse import urlparse, unquote
        parsed = urlparse(self.path)
        rel_path = unquote(parsed.path).lstrip("/")
        full_path = os.path.join(os.getcwd(), rel_path)

        if not os.path.isfile(full_path):
            self.send_error(404, "File not found")
            return

        try:
            with open(full_path, "rb") as f:
                content = f.read()
        except OSError:
            self.send_error(500, "Read error")
            return

        # 注入 ?v=<版本号> 到本地 js/css 引用
        try:
            text = content.decode("utf-8")
            with _lock:
                text = _VER_INJECT_RE.sub(
                    lambda m: f'{m.group(1)}{m.group(2)}?v={_BUILD_VERSION}{m.group(3)}',
                    text,
                )
            content = text.encode("utf-8")
        except UnicodeDecodeError:
            pass  # 非文本文件按原样发送

        # 发送响应
        self.send_response(200)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(content)))
        self.end_headers()
        self.wfile.write(content)

    def log_message(self, format, *args):
        # 简化日志输出
        sys.stderr.write(
            f"[nocache] {self.address_string()} {format % args}\n"
        )


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 5500
    server = ThreadingHTTPServer(("127.0.0.1", port), NoCacheHandler)
    print(f"[nocache] serving HTML on http://127.0.0.1:{port} (no cache, build={_BUILD_VERSION})")
    print(f"[nocache] HTML files will be auto-injected with ?v={_BUILD_VERSION}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        server.shutdown()
