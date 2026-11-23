/**
 * 通用「测试连接」服务。
 *
 * 设计原则：
 * 1. **不产生生图费用** —— 只调用元数据接口（/models、/system_stats）判断连通与鉴权，
 *    绝不为测试发起真实的生图请求。
 * 2. **不误报失败** —— 厂商若无轻量探活接口（返回 404/405），结论记为 inconclusive
 *    （中性），而不是 fail，避免用户误以为自己填错了。
 * 3. **不泄露凭据** —— 返回结果中不包含请求头；错误消息里若回显了 API Key，
 *    一律掩码为「前4位****后4位」；文本截断到 300 字符。
 */

import type { ApiConfig, ImageProviderId } from '@/types/gallery'
import { PROVIDER_META, proxyEndpoint, testComfyConnection } from '@/services/aiGenerator'

export type ConnectionTestStatus = 'ok' | 'fail' | 'inconclusive'

export interface ConnectionTestResult {
  status: ConnectionTestStatus
  provider: ImageProviderId
  /** HTTP 状态码（网络层失败时为空） */
  httpStatus?: number
  /** 从点击到出结果的总耗时 */
  latencyMs: number
  /** 面向用户的一句话结论 */
  message: string
  /** 已脱敏的细节：状态码、错误体摘要、探测端点等 */
  detail?: string
  /** 本次探测方式（便于用户判断结论可信度） */
  probe?: string
}

const TIMEOUT_MS = 12_000
const MAX_DETAIL = 300

/** 把密钥掩码为「前4****后4」，短密钥直接全部隐藏 */
function maskSecretValue(secret: string): string {
  if (!secret) return ''
  if (secret.length <= 8) return '****'
  return `${secret.slice(0, 4)}****${secret.slice(-4)}`
}

/** 从任意文本中抹掉出现的密钥（含 URL 编码形态） */
function scrub(text: string, apiKey: string): string {
  if (!text) return ''
  let out = text
  if (apiKey && apiKey.length >= 4) {
    const masked = maskSecretValue(apiKey)
    out = out.split(apiKey).join(masked)
    const encoded = encodeURIComponent(apiKey)
    if (encoded !== apiKey) out = out.split(encoded).join(masked)
    // 兼容 Bearer 拼接后再出现的形态
    out = out.split(`Bearer ${apiKey}`).join(`Bearer ${masked}`)
  }
  // 兜底：形如 sk-xxxx / 长十六进制串的通用密钥特征
  out = out.replace(/\b(sk-[A-Za-z0-9_-]{6,})/g, (m) => maskSecretValue(m))
  return out.length > MAX_DETAIL ? `${out.slice(0, MAX_DETAIL)}…` : out
}

function joinUrl(base: string, path: string): string {
  return `${base.replace(/\/+$/, '')}${path}`
}

function trimBase(baseUrl: string, fallback: string): string {
  return (baseUrl.trim() || fallback).replace(/\/+$/, '')
}

/** 从错误响应体中提取可读消息（不含请求头） */
function extractErrorMessage(body: string): string {
  const text = body.trim()
  if (!text) return ''
  try {
    const json = JSON.parse(text)
    return (
      json?.error?.message ||
      json?.error?.code ||
      json?.message ||
      json?.msg ||
      json?.base_resp?.status_msg ||
      json?.detail ||
      ''
    )
  } catch {
    return text
  }
}

type ProbePlan = {
  url: string
  headers: Record<string, string>
  label: string
}

/**
 * 生成轻量探活计划；返回 null 表示该厂商没有可用的元数据接口。
 */
function buildProbe(provider: ImageProviderId, baseUrl: string, apiKey: string): ProbePlan | null {
  const bearer = { Authorization: `Bearer ${apiKey}` }
  switch (provider) {
    case 'gemini': {
      const root = baseUrl.replace(/\/v1(?:beta)?$/, '')
      return { url: `${root}/v1beta/models`, headers: { 'x-goog-api-key': apiKey }, label: 'GET /v1beta/models' }
    }
    case 'gpt':
    case 'openai_compat': {
      const v1 = /\/v\d+$/.test(baseUrl) ? baseUrl : `${baseUrl}/v1`
      return { url: `${v1}/models`, headers: bearer, label: 'GET /v1/models' }
    }
    case 'qwen': {
      const root = baseUrl.replace(/\/api\/v1$/, '')
      const url = root.includes('/compatible-mode')
        ? joinUrl(root, '/models')
        : `${root}/compatible-mode/v1/models`
      return { url, headers: bearer, label: 'GET /compatible-mode/v1/models（仅验证 Key，生成走原生 API）' }
    }
    case 'zhipu':
      return { url: joinUrl(baseUrl, '/models'), headers: bearer, label: 'GET /models' }
    case 'minimax': {
      const v1 = /\/v\d+$/.test(baseUrl) ? baseUrl : `${baseUrl}/v1`
      return { url: `${v1}/models`, headers: bearer, label: 'GET /v1/models' }
    }
    case 'doubao': {
      const root = baseUrl.replace(/\/api\/v3$/, '')
      const url = /\/api\/v3$/.test(baseUrl) ? `${baseUrl}/models` : `${root}/api/v3/models`
      return { url, headers: bearer, label: 'GET /api/v3/models' }
    }
    default:
      // pixai：未确认存在公开的模型列表接口，保持中性结论
      return null
  }
}

/** 必填项校验：返回缺失字段的中文名列表 */
export function validateProviderConfig(provider: ImageProviderId, config: ApiConfig): string[] {
  const p = config.providers[provider]
  const missing: string[] = []
  if (!p.baseUrl.trim()) missing.push('接口地址 (Base URL)')
  if (provider !== 'comfyui' && !p.apiKey.trim()) missing.push('API Key')
  if (provider !== 'comfyui') {
    const model = p.model === 'custom' ? p.customModel.trim() : p.model.trim()
    if (!model) missing.push('模型名称')
  }
  return missing
}

export async function testProviderConnection(
  provider: ImageProviderId,
  config: ApiConfig
): Promise<ConnectionTestResult> {
  const started = performance.now()
  const p = config.providers[provider]
  const meta = PROVIDER_META[provider]
  const apiKey = p.apiKey.trim()
  const baseUrl = trimBase(p.baseUrl, meta.defaultBaseUrl)
  const elapsed = () => Math.round(performance.now() - started)

  // ---- 1) 必填校验（不发请求）----
  const missing = validateProviderConfig(provider, config)
  if (missing.length) {
    return {
      status: 'fail',
      provider,
      latencyMs: elapsed(),
      message: `请先填写：${missing.join('、')}`,
      detail: '未发起网络请求；补齐必填项后重试。',
    }
  }

  // ---- 2) ComfyUI 走专用探活 ----
  if (provider === 'comfyui') {
    try {
      const info = await testComfyConnection(baseUrl, apiKey)
      return {
        status: 'ok',
        provider,
        latencyMs: elapsed(),
        message: 'ComfyUI 连接成功',
        detail: scrub(info, apiKey),
        probe: 'GET /system_stats',
      }
    } catch (err: any) {
      return {
        status: 'fail',
        provider,
        latencyMs: elapsed(),
        message: 'ComfyUI 连接失败',
        detail: scrub(err?.message || String(err), apiKey),
        probe: 'GET /system_stats',
      }
    }
  }

  // ---- 3) 无轻量探活接口的厂商 ----
  const plan = buildProbe(provider, baseUrl, apiKey)
  if (!plan) {
    return {
      status: 'inconclusive',
      provider,
      latencyMs: elapsed(),
      message: '该服务商未提供可探测的模型列表接口，无法在不产生费用的前提下判定',
      detail: `地址格式与必填项已校验通过。请在合成台实际生成一次以确认；若 Key 有误，生成时会返回 401/403。`,
      probe: '无（未发起请求）',
    }
  }

  // ---- 4) 发起轻量请求（与生成请求同一条传输路径：开启代理时经代理端点转发） ----
  const useProxy = !!config.useProxy
  let fetchUrl = plan.url
  let fetchHeaders: Record<string, string> = plan.headers
  if (useProxy) {
    fetchUrl = proxyEndpoint()
    fetchHeaders = { ...plan.headers, 'x-target-url': plan.url }
  }
  const probeLabel = useProxy ? `${plan.label}（经代理）` : plan.label
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort('timeout'), TIMEOUT_MS)
  try {
    const res = await fetch(fetchUrl, { method: 'GET', headers: fetchHeaders, signal: controller.signal })
    const body = await res.text().catch(() => '')
    const latencyMs = elapsed()

    if (res.ok) {
      // 代理不可用 / 网关错误时常返回 HTML 错误页：如实判为失败并给出指引
      let json: any = null
      try {
        json = JSON.parse(body)
      } catch {
        return {
          status: 'fail',
          provider,
          httpStatus: res.status,
          latencyMs,
          message: useProxy
            ? '代理端点不可用：代理返回了非 JSON 响应'
            : '接口返回了非 JSON 响应',
          detail: useProxy
            ? `代理端点（${fetchUrl}）返回 HTTP ${res.status} 但响应不是 JSON。若本部署未提供代理服务，请关闭下方「服务端 CORS 代理」开关后重试（多数国内厂商支持浏览器直连）。`
            : '目标地址返回了 HTML 或空响应，请核对接口地址。',
          probe: probeLabel,
        }
      }
      let hint = ''
      const list = json?.data ?? json?.models ?? json?.data?.models
      if (Array.isArray(list)) hint = `，可见 ${list.length} 个模型`
      return {
        status: 'ok',
        provider,
        httpStatus: res.status,
        latencyMs,
        message: `连接成功（HTTP ${res.status}${hint}）`,
        detail: '鉴权通过，接口地址可达。',
        probe: probeLabel,
      }
    }

    // 404 / 405：厂商没有该列表接口 → 中性结论；但若经代理收到，则代理本身不可用
    if (res.status === 404 || res.status === 405) {
      if (useProxy) {
        return {
          status: 'fail',
          provider,
          httpStatus: res.status,
          latencyMs,
          message: `代理端点不可用（HTTP ${res.status}）`,
          detail: '经代理探测失败，说明代理服务未部署或不可达。请关闭下方「服务端 CORS 代理」开关后重试。',
          probe: probeLabel,
        }
      }
      return {
        status: 'inconclusive',
        provider,
        httpStatus: res.status,
        latencyMs,
        message: `接口可达，但 HTTP ${res.status}：该服务商未提供模型列表接口`,
        detail: '地址与鉴权未发现明显错误；请在合成台实际生成一次以最终确认。',
        probe: probeLabel,
      }
    }

    const reason = extractErrorMessage(body)
    return {
      status: 'fail',
      provider,
      httpStatus: res.status,
      latencyMs,
      message:
        res.status === 401 || res.status === 403
          ? `鉴权失败（HTTP ${res.status}）：API Key 无效或无权限`
          : `连接失败（HTTP ${res.status}）`,
      detail: scrub(reason, apiKey) || '服务端未返回错误说明',
      probe: probeLabel,
    }
  } catch (err: any) {
    const aborted = err?.name === 'AbortError' || controller.signal.reason === 'timeout'
    const isNetwork = err instanceof TypeError
    return {
      status: 'fail',
      provider,
      latencyMs: elapsed(),
      message: aborted ? `请求超时（>${TIMEOUT_MS / 1000}s）` : isNetwork ? '网络请求失败' : '请求异常',
      detail: isNetwork
        ? useProxy
          ? '浏览器未能完成请求。当前经代理转发：若本部署未提供代理服务，请关闭「服务端 CORS 代理」开关后重试。'
          : '浏览器未能完成请求，常见原因：接口地址有误、目标不可达，或被跨域 (CORS) 策略拦截。'
        : scrub(err?.message || String(err), apiKey),
      probe: probeLabel,
    }
  } finally {
    clearTimeout(timer)
  }
}
