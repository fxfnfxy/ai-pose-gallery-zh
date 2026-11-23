import test from 'node:test'
import assert from 'node:assert/strict'

// imageFetch.ts 依赖 import.meta.env.BASE_URL（vite 注入）。
// node:test / tsx 环境下通过测试钩子补齐 base，保证直连→中转的回退逻辑可测。
;(import.meta as any).env = { BASE_URL: '/pose/' }

const OSS_URL = 'https://dashscope-result-sh.oss-cn-shanghai.aliyuncs.com/demo/x.jpeg'

const originalFetch = globalThis.fetch
function mockFetch(handler: (url: string) => Promise<Response> | Response) {
  globalThis.fetch = (async (input: any) => handler(String(input))) as typeof fetch
}

test('直连成功时不走中转', async () => {
  let relayCalled = false
  mockFetch((url) => {
    if (url === OSS_URL) {
      return new Response(new Uint8Array([0x89, 0x50]), { status: 200, headers: { 'Content-Type': 'image/png' } })
    }
    relayCalled = true
    return new Response('{}', { status: 500 })
  })
  try {
    const { fetchRemoteImage } = await import('../src/lib/imageFetch.ts')
    const blob = await fetchRemoteImage(OSS_URL)
    assert.equal(blob.type, 'image/png')
    assert.equal(relayCalled, false)
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('直连抛证书类错误时回退到同源中转端点', async () => {
  const relayBytes = new Uint8Array([0xff, 0xd8, 0xff, 0xe0])
  let relayUrl = ''
  mockFetch((url) => {
    if (url === OSS_URL) {
      throw new Error('unable to verify the first certificate')
    }
    relayUrl = url
    return new Response(relayBytes, { status: 200, headers: { 'Content-Type': 'image/jpeg' } })
  })
  try {
    const { fetchRemoteImage, __setRelayBaseForTests } = await import('../src/lib/imageFetch.ts')
    __setRelayBaseForTests('/pose/')
    const blob = await fetchRemoteImage(OSS_URL)
    assert.equal(blob.type, 'image/jpeg')
    assert.equal(relayUrl, `/pose/api/fetch?url=${encodeURIComponent(OSS_URL)}`)
    assert.equal(blob.size, relayBytes.length)
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('直连与中转都失败时报错含「图片下载失败」与中转诊断', async () => {
  mockFetch((url) => {
    if (url === OSS_URL) throw new Error('unable to verify the first certificate')
    return new Response(JSON.stringify({ error: '上游返回 HTTP 404' }), { status: 502 })
  })
  try {
    const { fetchRemoteImage } = await import('../src/lib/imageFetch.ts')
    await assert.rejects(
      fetchRemoteImage(OSS_URL),
      (err: Error) => err.message.includes('图片下载失败') && err.message.includes('404'),
    )
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('data:/相对路径不触发中转', async () => {
  let calls = 0
  mockFetch(() => {
    calls++
    throw new Error('boom')
  })
  try {
    const { fetchRemoteImage } = await import('../src/lib/imageFetch.ts')
    await assert.rejects(fetchRemoteImage('data:image/png;base64,x'), /boom/)
    await assert.rejects(fetchRemoteImage('/pose/img/a.webp'), /boom/)
    assert.equal(calls, 2)
  } finally {
    globalThis.fetch = originalFetch
  }
})
