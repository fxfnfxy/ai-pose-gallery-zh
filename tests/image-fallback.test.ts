// fallbackCandidatesFor：失效域名参考图 → 本站图库候选路径
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { fallbackCandidatesFor } from '../src/services/aiGenerator.ts'

test('dead-domain URL yields basename-based site candidates', () => {
  const cands = fallbackCandidatesFor('https://ai-crafture-gallery.pages.dev/img/costumes/SUM-0258.webp')
  assert.deepEqual(cands, [
    'img/costume/sum-0258.webp',
    'thumbs/costume/sum-0258.webp',
    'img/sum-0258.webp',
    'thumbs/sum-0258.webp',
  ])
})

test('uppercase extension is normalized to lowercase candidates', () => {
  const cands = fallbackCandidatesFor('https://example.com/img/O001.WEBP')
  assert.ok(cands.every((c) => c.endsWith('.webp')))
  assert.equal(cands[0], 'img/costume/o001.webp')
})

test('relative paths and non-image URLs yield no candidates', () => {
  assert.deepEqual(fallbackCandidatesFor('img/costume/SUM-0258.webp'), [])
  assert.deepEqual(fallbackCandidatesFor('https://example.com/api/data.json'), [])
  assert.deepEqual(fallbackCandidatesFor('data:image/png;base64,xxx'), [])
})

test('non-URL garbage does not throw', () => {
  assert.deepEqual(fallbackCandidatesFor('not a url'), [])
})
