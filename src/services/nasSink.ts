/**
 * 生成结果静默归档到 NAS。
 *
 * 设计约束（对齐需求）：
 * - **不打扰用户**：不弹 toast、不阻塞生成流程、失败只在控制台留痕；
 * - **默认执行**：成功后自动调用，无需用户选择；
 * - **不改动原有生成链路**：本模块只在生成成功后被「顺带」调用一次，
 *   不参与结果展示、历史记录与下载逻辑；
 * - **失败可忽略**：NAS 不可达、磁盘满、体积超限等一律静默放弃，
 *   绝不把异常抛回调用方，避免影响预览图展示。
 *
 * 端点由同源反代提供：`<base>api/save`（生产即 `/pose/api/save`），
 * 由 NAS 上 `aipose/nas_save_server.py` 接收并落盘。
 */

const MAX_BYTES = 32 * 1024 * 1024;

/** 简单去重：同一张图（按长度+头尾指纹）在短时间内不重复上传。 */
const recentlySaved = new Set<string>();

function fingerprint(url: string): string {
  return `${url.length}:${url.slice(0, 48)}:${url.slice(-48)}`;
}

function endpoint(): string {
  const base = import.meta.env.BASE_URL || '/';
  return `${base.replace(/\/+$/, '')}/api/save`;
}

async function toDataUrl(url: string): Promise<string | null> {
  if (url.startsWith('data:')) return url;
  try {
    const res = await fetch(url, { mode: 'cors', credentials: 'omit' });
    if (!res.ok) return null;
    const blob = await res.blob();
    if (!blob.type.startsWith('image/')) return null;
    return await new Promise<string | null>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : null);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

/**
 * 静默保存一张生成图到 NAS。调用方无需 await，也不应因失败中断流程。
 * @param imageUrl 生成结果的 dataURL 或可访问图片地址
 * @param meta     可选元信息（模型、服务商、提示词），仅用于服务端日志追溯
 */
export function saveGeneratedImage(imageUrl: string, meta?: Record<string, string>): void {
  void (async () => {
    try {
      if (!imageUrl) return;
      const key = fingerprint(imageUrl);
      if (recentlySaved.has(key)) return;
      recentlySaved.add(key);
      if (recentlySaved.size > 200) recentlySaved.clear();

      const dataUrl = await toDataUrl(imageUrl);
      if (!dataUrl) return;

      // dataURL base64 体积约为原始字节约 1.37 倍，换算后粗略限流
      const approxBytes = Math.floor((dataUrl.length * 3) / 4);
      if (approxBytes > MAX_BYTES) return;

      const body = JSON.stringify({ dataUrl, ...(meta || {}) });
      // keepalive 让请求在用户切页/关闭时仍尽量完成；不 await 结果
      void fetch(endpoint(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
        keepalive: body.length < 60_000,
      }).then(
        (res) => {
          if (!res.ok) console.debug('[nas-save] skipped', res.status);
        },
        (err) => console.debug('[nas-save] failed', err?.message || err),
      );
    } catch (err) {
      // 任何异常都静默，绝不影响生成主流程
      console.debug('[nas-save] error', err);
    }
  })();
}
