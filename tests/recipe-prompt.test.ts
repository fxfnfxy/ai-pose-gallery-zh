// buildRecipePrompt 无头/无脸逻辑回归测试：
// 旧版「只选服装+姿势」会自动进入无脸模式，被模型执行成无头图（2026-11-23 用户实测）。
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildRecipePrompt } from '../src/services/aiGenerator.ts'
import type { RecipeState } from '../src/types/gallery.ts'

const costume = { id: 'c1', 服装名称: '小香风外套', source: 'gallery', 缩略图: '', 原图: '' } as any
const pose = { id: 'p1', 姿势名称: '坐姿', 角度: '侧面', source: 'gallery', 缩略图: '', 原图: '' } as any

function makeRecipe(patch: Partial<RecipeState> = {}): RecipeState {
  return { portrait: null, costume, pose, ...patch }
}

test('默认（未开无脸开关）：服装+姿势也必须要求完整头部与五官', () => {
  const text = buildRecipePrompt(makeRecipe())
  assert.match(text, /头部、面部与五官完整自然/)
  assert.match(text, /绝不可输出无头、断颈/)
  assert.doesNotMatch(text, /无脸展示/)
  assert.doesNotMatch(text, /脸部无五官/)
})

test('显式开启无脸展示：要求头部完整、仅面部无五官', () => {
  const text = buildRecipePrompt(makeRecipe({ facelessDisplay: true }))
  assert.match(text, /无脸展示/)
  assert.match(text, /头部必须完整出现在画面中/)
  assert.match(text, /禁止输出无头、断颈/)
  assert.match(text, /面部无五官/)
})

test('有人像参考时不注入虚拟模特或无脸条款', () => {
  const portrait = { id: 'u1', source: 'upload', 标题: '上传人物', 缩略图: '', 原图: '' } as any
  const text = buildRecipePrompt(makeRecipe({ portrait, facelessDisplay: true }))
  assert.doesNotMatch(text, /无脸展示/)
  assert.doesNotMatch(text, /头部、面部与五官完整自然/)
  assert.match(text, /保持其脸型、五官、发型和发色一致/)
})

test('无任何参考时不注入人物条款', () => {
  const text = buildRecipePrompt(makeRecipe({ costume: null, pose: null }))
  assert.match(text, /请先选择人像\/服装\/姿势/)
})
