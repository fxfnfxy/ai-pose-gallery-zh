/**
 * 「测试连接」服务的单元测试。
 *
 * 覆盖三条硬要求：
 * 1. 测试前校验必填项（且不发请求）
 * 2. 测试结果三态清晰（ok / fail / inconclusive）
 * 3. 结果不暴露敏感凭据（密钥一律掩码）
 */
import assert from 'node:assert/strict'
import test from 'node:test'

import { testProviderConnection, validateProviderConfig } from '../src/services/connectionTest'
import { DEFAULT_API_CONFIG } from '../src/store/studioConfig'
import type { ApiConfig, ImageProviderId } from '../src/types/gallery'

const SECRET = 'sk-test-abcd1234efgh5678'

function configWith(provider: ImageProviderId, patch: Record<string, string> = {}): ApiConfig {
  return {
    ...DEFAULT_API_CONFIG,
    activeProvider: provider,
    providers: {
      ...DEFAULT_API_CONFIG.providers,
      [provider]: { ...DEFAULT_API_CONFIG.providers[provider], apiKey: SECRET, ...patch },
    },
  }
}

/** 临时替换全局 fetch，返回固定响应；调用结束后恢复 */
async function withFetch(
  impl: (url: string) => Promise<Response>,
  run: () => Promise<void>
): Promise<void> {
  const original = globalThis.fetch
  let calls = 0
  globalThis.fetch = (async (input: any) => {
    calls += 1
    return impl(String(input))
  }) as typeof fetch
  try {
    await run()
    assert.ok(calls >= 0)
  } finally {
    globalThis.fetch = original
  }
}

test('必填校验：缺少 API Key 时直接返回失败且不发起请求', async () => {
  const cfg = configWith('zhipu', { apiKey: '' })
  let fetchCalled = false
  const original = globalThis.fetch
  globalThis.fetch = (async () => {
    fetchCalled = true
    return new Response('{}', { status: 200 })
  }) as typeof fetch
  try {
    const r = await testProviderConnection('zhipu', cfg)
    assert.equal(r.status, 'fail')
    assert.match(r.message, /API Key/)
    assert.equal(fetchCalled, false, '必填项缺失时不应发起网络请求')
  } finally {
    globalThis.fetch = original
  }
})

test('必填校验：缺少模型名称时给出提示', () => {
  const cfg = configWith('minimax', { model: 'custom', customModel: '' })
  const missing = validateProviderConfig('minimax', cfg)
  assert.ok(missing.some((m) => m.includes('模型')))
})

test('ComfyUI 的 API Key 为可选项，不参与必填校验', () => {
  const cfg = configWith('comfyui', { apiKey: '' })
  assert.deepEqual(validateProviderConfig('comfyui', cfg), [])
})

test('无轻量探活接口的厂商返回 inconclusive（不误判为失败）', async () => {
  const r = await testProviderConnection('pixai', configWith('pixai'))
  assert.equal(r.status, 'inconclusive')
  assert.match(r.detail || '', /实际生成一次/)
})

test('鉴权失败（401）判定为 fail，且回显的密钥被掩码', async () => {
  await withFetch(
    async () =>
      new Response(JSON.stringify({ error: { message: `Invalid API key: ${SECRET}` } }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      }),
    async () => {
      const r = await testProviderConnection('zhipu', configWith('zhipu'))
      assert.equal(r.status, 'fail')
      assert.equal(r.httpStatus, 401)
      assert.match(r.message, /鉴权失败/)
      const merged = `${r.message} ${r.detail || ''}`
      assert.ok(!merged.includes(SECRET), '结果中不得出现完整密钥')
      assert.ok(merged.includes('sk-t****5678'), '应以掩码形式呈现')
    }
  )
})

test('服务端可达（200）判定为 ok 并统计模型数量', async () => {
  await withFetch(
    async () =>
      new Response(JSON.stringify({ data: [{ id: 'a' }, { id: 'b' }, { id: 'c' }] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    async () => {
      const r = await testProviderConnection('openai_compat', configWith('openai_compat'))
      assert.equal(r.status, 'ok')
      assert.match(r.message, /3 个模型/)
    }
  )
})

test('模型列表接口不存在（404）判定为 inconclusive 而非失败', async () => {
  await withFetch(
    async () => new Response('not found', { status: 404 }),
    async () => {
      const r = await testProviderConnection('qwen', configWith('qwen'))
      assert.equal(r.status, 'inconclusive')
      assert.equal(r.httpStatus, 404)
    }
  )
})

test('网络层异常提示可能为跨域拦截，且不泄露密钥', async () => {
  await withFetch(
    async () => {
      throw new TypeError(`Failed to fetch ${SECRET}`)
    },
    async () => {
      const r = await testProviderConnection('openai_compat', configWith('openai_compat'))
      assert.equal(r.status, 'fail')
      assert.match(r.message, /网络请求失败/)
      assert.ok(!`${r.message}${r.detail || ''}`.includes(SECRET))
    }
  )
})
