#!/usr/bin/env python3
"""AI Pose Gallery · NAS 图片落盘接收 + 结果图中转下载服务（零依赖，仅标准库）。

用途
----
站点为纯前端应用，生成结果原本只在浏览器内展示/下载。
本服务提供两个极简 HTTP 端点：
  1. POST /api/save —— 前端在生成成功后「静默」把图片另存一份到 NAS；
  2. GET  /api/fetch —— 服务端中转下载生成结果图。

为什么需要 /api/fetch
--------------------
阿里云 OSS 结果域名（dashscope-result-*.oss-*.aliyuncs.com 等）只回传
「单张叶子证书、不含中间证书链」（openssl s_client 实测仅 1 张证书）。
浏览器/Windows 原生栈可通过 AIA 自动补链成功访问，但 Node.js / OpenSSL
严格客户端会报 `unable to verify the first certificate`，导致前端取图失败。
由 NAS（Python，已实测 TLS 验证通过）服务端代为下载并回传字节即可绕开。

端点
----
POST /api/save        接收 base64 dataURL 或裸 base64，落盘到 <SAVE_ROOT>/YYYY-MM-DD/
GET  /api/fetch       服务端中转下载图片（域名白名单 + 证书验证失败自动降级重试）
GET  /api/health      健康检查

安全边界（重要）
----------------
站点对公网匿名开放，因此本端点同样是匿名的。为降低被滥用风险，做了：
  1. 仅监听 127.0.0.1，只有同机 nginx 反代能访问，不直接暴露公网；
  2. 单请求体积上限 MAX_BYTES（默认 32MB），超出即拒；
  3. 只接受图片魔数校验通过的 PNG/JPEG/WEBP/GIF/AVIF，拒绝任意文件；
  4. 文件名由服务端生成（时间戳+随机），不接受客户端路径，杜绝路径穿越；
  5. 按来源 IP 做滑动窗口限流（默认 60 次/分钟）；
  6. 磁盘水位保护：当保存目录所在分区剩余空间低于阈值时拒绝写入；
  7. /api/fetch 仅允许下载图片大模型厂商结果域名（白名单），不做通用代理。

配置
----
环境变量（均有默认值）：
  POSE_SAVE_ROOT   保存根目录，默认 /share/Container/aipose/generated
  POSE_SAVE_HOST   监听地址，默认 127.0.0.1
  POSE_SAVE_PORT   监听端口，默认 8136
  POSE_SAVE_MAX_MB 单图上限 MB，默认 32
  POSE_SAVE_MIN_FREE_MB 最低剩余空间 MB，默认 1024
"""
from __future__ import annotations

import base64
import json
import os
import random
import re
import shutil
import ssl
import string
import struct
import threading
import time
import urllib.error
import urllib.request
from datetime import datetime
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlsplit

SAVE_ROOT = os.environ.get("POSE_SAVE_ROOT", "/share/Container/aipose/generated")
HOST = os.environ.get("POSE_SAVE_HOST", "127.0.0.1")
PORT = int(os.environ.get("POSE_SAVE_PORT", "8136"))
MAX_BYTES = int(float(os.environ.get("POSE_SAVE_MAX_MB", "32")) * 1024 * 1024)
MIN_FREE = int(float(os.environ.get("POSE_SAVE_MIN_FREE_MB", "1024")) * 1024 * 1024)

LOG_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "save.log")
RATE_LIMIT = 60          # 每 IP 每分钟最多请求数
RATE_WINDOW = 60.0

# /api/fetch 允许中转下载的域名后缀（图片大模型厂商结果存储域名）
FETCH_ALLOWED_SUFFIXES = (
    ".aliyuncs.com",    # 阿里云 OSS / DashScope 结果
    ".aliyun.com",
    ".volcengine.com",  # 火山方舟 / Doubao 结果
    ".byteimg.com",
    ".zhipuai.cn",      # 智谱 BigModel
    ".bigmodel.cn",
    ".minimaxi.com",    # MiniMax
    ".minimax.chat",
    ".pages.dev",       # Cloudflare Pages：pose 图库源站（参考图跨域中转）
    ".modelscope.cn",
)

_rates: dict[str, list[float]] = {}
_rate_lock = threading.Lock()


def log(msg: str) -> None:
    line = "[%s] %s" % (datetime.now().strftime("%Y-%m-%d %H:%M:%S"), msg)
    try:
        with open(LOG_FILE, "a", encoding="utf-8") as f:
            f.write(line + "\n")
    except Exception:
        pass


def sniff_image(data: bytes) -> tuple[str, str] | None:
    """按魔数识别图片类型，返回 (mime, ext)；无法识别返回 None。"""
    if data[:8] == b"\x89PNG\r\n\x1a\n":
        return "image/png", "png"
    if data[:3] == b"\xff\xd8\xff":
        return "image/jpeg", "jpg"
    if data[:6] in (b"GIF87a", b"GIF89a"):
        return "image/gif", "gif"
    if data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return "image/webp", "webp"
    if data[4:8] == b"ftyp" and re.search(rb"avif|avis", data[8:16] or b""):
        return "image/avif", "avif"
    return None


def check_rate(ip: str) -> bool:
    now = time.time()
    with _rate_lock:
        bucket = _rates.setdefault(ip, [])
        # 丢弃窗口外记录
        bucket[:] = [t for t in bucket if now - t < RATE_WINDOW]
        if len(bucket) >= RATE_LIMIT:
            return False
        bucket.append(now)
        return True


def free_space_ok() -> bool:
    try:
        return shutil.disk_usage(SAVE_ROOT).free >= MIN_FREE
    except FileNotFoundError:
        os.makedirs(SAVE_ROOT, exist_ok=True)
        return True


def decode_payload(body: bytes) -> bytes | None:
    """支持两种入参：JSON{dataUrl|base64} 或原始二进制图片。"""
    # 1) 尝试 JSON
    try:
        obj = json.loads(body.decode("utf-8"))
        if isinstance(obj, dict):
            raw = obj.get("dataUrl") or obj.get("data_url") or obj.get("base64") or ""
            if isinstance(raw, str) and raw:
                if raw.startswith("data:"):
                    raw = raw.split(",", 1)[-1]
                return base64.b64decode(raw, validate=False)
    except Exception:
        pass
    # 2) 已是二进制
    if sniff_image(body):
        return body
    return None


def atomic_write(path: str, data: bytes) -> None:
    part = path + ".part"
    with open(part, "wb") as f:
        f.write(data)
        f.flush()
        os.fsync(f.fileno())
    os.replace(part, path)


def fetch_allowed(url: str) -> bool:
    try:
        host = (urlsplit(url).hostname or "").lower()
    except ValueError:
        return False
    if not host:
        return False
    return any(host == s.lstrip(".") or host.endswith(s) for s in FETCH_ALLOWED_SUFFIXES)


def relay_download(url: str, limit: int = MAX_BYTES) -> tuple[bytes, str]:
    """服务端下载图片字节，返回 (data, note)。

    note 用于日志：ok=证书验证通过，insecure=证书验证失败后降级重试成功。
    下载后仍要做魔数校验，防止白名单域名上的非图片内容被中转。
    """
    req = urllib.request.Request(
        url,
        headers={
            "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/126 Safari/537.36",
            "Accept": "image/*,*/*;q=0.8",
        },
        method="GET",
    )
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            data = r.read(limit + 1)
            if len(data) > limit:
                raise ValueError("图片超过体积上限")
            return data, "ok"
    except urllib.error.URLError as e:
        reason = getattr(getattr(e, "reason", None), "__str__", lambda: "")()
        if not isinstance(getattr(e, "reason", None), ssl.SSLCertVerificationError) \
                and "CERTIFICATE_VERIFY_FAILED" not in reason and "certificate" not in reason.lower():
            raise
        # 仅在「证书验证失败」时降级：结果图 URL 由大模型厂商返回、内容短时效，
        # 下载后仍做魔数校验，风险可控。
        log("relay: cert verify failed (%s), retry without verification" % reason[:120])
        ctx = ssl._create_unverified_context()
        with urllib.request.urlopen(req, timeout=60, context=ctx) as r:
            data = r.read(limit + 1)
            if len(data) > limit:
                raise ValueError("图片超过体积上限")
            return data, "insecure"


class Handler(BaseHTTPRequestHandler):
    server_version = "PoseSave/1.1"

    def _send(self, code: int, obj: dict) -> None:
        payload = json.dumps(obj, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(payload)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        try:
            self.wfile.write(payload)
        except Exception:
            pass

    def _send_bytes(self, code: int, mime: str, data: bytes) -> None:
        self.send_response(code)
        self.send_header("Content-Type", mime)
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        try:
            self.wfile.write(data)
        except Exception:
            pass

    def log_message(self, fmt, *args):  # 覆盖默认 stderr 噪声，写入自己的日志
        log("%s - %s" % (self.address_string(), fmt % args))

    def do_GET(self) -> None:
        path = self.path.split("?")[0]
        if path in ("/api/health", "/health"):
            self._send(200, {"ok": True, "root": SAVE_ROOT})
            return
        if path in ("/api/fetch", "/fetch"):
            self._do_fetch()
            return
        self._send(404, {"ok": False, "error": "not found"})

    def _do_fetch(self) -> None:
        ip = self.client_address[0]
        if not check_rate(ip):
            self._send(429, {"ok": False, "error": "请求过于频繁，请稍后再试"})
            return
        qs = parse_qs(urlsplit(self.path).query)
        target = (qs.get("url") or [""])[0].strip()
        if not target:
            self._send(400, {"ok": False, "error": "缺少 url 参数"})
            return
        if not re.match(r"^https?://", target, re.I):
            self._send(400, {"ok": False, "error": "仅支持 http(s) 地址"})
            return
        if not fetch_allowed(target):
            self._send(403, {"ok": False, "error": "该域名不在中转白名单内（仅支持图片大模型厂商结果域名）"})
            return
        try:
            data, note = relay_download(target)
        except ValueError as e:
            self._send(413, {"ok": False, "error": str(e)})
            return
        except urllib.error.HTTPError as e:
            self._send(502, {"ok": False, "error": "上游返回 HTTP %d" % e.code})
            return
        except Exception as e:
            self._send(502, {"ok": False, "error": "下载失败: %s" % str(e)[:200]})
            return

        kind = sniff_image(data)
        if not kind:
            self._send(415, {"ok": False, "error": "上游内容不是受支持的图片格式"})
            return
        mime, _ext = kind
        log("fetched %s (%s, %d bytes, %s) for %s" % (target[:120], mime, len(data), note, ip))
        self._send_bytes(200, mime, data)

    def do_POST(self) -> None:
        if self.path.split("?")[0] not in ("/api/save", "/save"):
            self._send(404, {"ok": False, "error": "not found"})
            return

        ip = self.client_address[0]
        if not check_rate(ip):
            self._send(429, {"ok": False, "error": "请求过于频繁，请稍后再试"})
            return

        try:
            length = int(self.headers.get("Content-Length") or 0)
        except ValueError:
            length = 0
        if length <= 0:
            self._send(400, {"ok": False, "error": "empty body"})
            return
        if length > MAX_BYTES:
            self._send(413, {"ok": False, "error": "图片超过 %dMB 上限" % (MAX_BYTES // (1024 * 1024))})
            return

        body = self.rfile.read(length)
        data = decode_payload(body)
        if not data:
            self._send(400, {"ok": False, "error": "无法解析图片数据"})
            return

        kind = sniff_image(data)
        if not kind:
            self._send(415, {"ok": False, "error": "不是受支持的图片格式"})
            return
        mime, ext = kind

        if len(data) > MAX_BYTES:
            self._send(413, {"ok": False, "error": "图片超过体积上限"})
            return
        if not free_space_ok():
            self._send(507, {"ok": False, "error": "NAS 存储空间不足，已跳过保存"})
            return

        day = datetime.now().strftime("%Y-%m-%d")
        folder = os.path.join(SAVE_ROOT, day)
        try:
            os.makedirs(folder, exist_ok=True)
        except Exception as e:
            self._send(500, {"ok": False, "error": "创建目录失败: %s" % e})
            return

        stamp = datetime.now().strftime("%H%M%S")
        rand = "".join(random.choices(string.ascii_lowercase + string.digits, k=6))
        name = "%s-%s.%s" % (stamp, rand, ext)
        path = os.path.join(folder, name)

        try:
            atomic_write(path, data)
        except Exception as e:
            self._send(500, {"ok": False, "error": "写入失败: %s" % e})
            return

        rel = os.path.relpath(path, SAVE_ROOT)
        log("saved %s (%s, %d bytes) from %s" % (rel, mime, len(data), ip))
        self._send(200, {"ok": True, "path": rel, "bytes": len(data), "mime": mime})


def main() -> None:
    os.makedirs(SAVE_ROOT, exist_ok=True)
    srv = ThreadingHTTPServer((HOST, PORT), Handler)
    log("listening on %s:%d, root=%s, max=%dMB" % (HOST, PORT, SAVE_ROOT, MAX_BYTES // (1024 * 1024)))
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        srv.server_close()


if __name__ == "__main__":
    main()
