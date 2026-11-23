/**
 * 远程图片统一取图入口：直连失败自动回退到 NAS 服务端中转。
 *
 * 背景：阿里云 OSS 结果域名（dashscope-result-*.oss-*.aliyuncs.com 等）
 * 只回单张叶子证书、不含中间证书链。浏览器（AIA 补链）能访问，
 * 但 Node.js / OpenSSL 严格客户端会报
 * `unable to verify the first certificate`，导致「测试连接成功、
 * 生成成功、取结果图失败」。因此直连失败时改由
 * `<base>api/fetch?url=...`（NAS nas_save_server.py 提供）服务端下载。
 */

const CERT_ERROR_RE = /certificate|CERTIFICATE|TLS|SSL/i;

let relayBaseOverride: string | undefined;

/** 仅测试用：覆盖中转端点的 base（生产走 import.meta.env.BASE_URL） */
export function __setRelayBaseForTests(base: string | undefined): void {
  relayBaseOverride = base;
}

function relayEndpoint(): string {
  const base = relayBaseOverride ?? ((import.meta as any).env?.BASE_URL || '/');
  return `${base.replace(/\/+$/, '')}/api/fetch`;
}

async function readBlob(res: Response): Promise<Blob> {
  const blob = await res.blob();
  if (!blob.size) throw new Error('响应内容为空');
  return blob;
}

function isImageBlob(blob: Blob): boolean {
  // 某些代理/网关不回 Content-Type，此处对空类型放宽，交由调用方魔数/展示兜底
  return !blob.type || blob.type.startsWith('image/');
}

/**
 * 获取一张远程图片。
 * 顺序：直连 → 同源中转端点（`/api/fetch`）。
 * @param url 图片地址（data:/blob: 之外的 http/https 或站内相对路径）
 */
export async function fetchRemoteImage(url: string, signal?: AbortSignal): Promise<Blob> {
  let directError: unknown;

  try {
    const res = await fetch(url, { signal, credentials: 'omit' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const blob = await readBlob(res);
    if (isImageBlob(blob)) return blob;
    throw new Error(`响应不是图片 (Content-Type: ${blob.type || '空'})`);
  } catch (err) {
    if (signal?.aborted) throw err;
    // data:/blob:/站内相对路径没有中转意义，直接抛出
    if (!/^https:\/\//i.test(url)) throw err;
    directError = err;
  }

  const relayUrl = `${relayEndpoint()}?url=${encodeURIComponent(url)}`;
  try {
    const res = await fetch(relayUrl, { signal, credentials: 'omit' });
    if (!res.ok) {
      let detail = `HTTP ${res.status}`;
      try {
        const j = await res.json();
        if (j?.error) detail = `${detail}：${String(j.error).slice(0, 120)}`;
      } catch { /* 忽略非 JSON 响应体 */ }
      throw new Error(`中转下载失败 (${detail})`);
    }
    const blob = await readBlob(res);
    if (!isImageBlob(blob)) throw new Error(`中转响应不是图片 (Content-Type: ${blob.type || '空'})`);
    return blob;
  } catch (err) {
    if (signal?.aborted) throw err;
    const msg = err instanceof Error ? err.message : String(err);
    const certHint = directError instanceof Error && CERT_ERROR_RE.test(directError.message)
      ? '；直连报证书链错误（该域名只回单张证书，浏览器可补链而本环境不能）'
      : '';
    throw new Error(`图片下载失败：${msg}${certHint}`);
  }
}
