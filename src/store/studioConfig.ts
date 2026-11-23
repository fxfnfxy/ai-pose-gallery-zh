import type { ApiConfig, ImageProviderId } from '@/types/gallery'
import { PROVIDER_META, DEFAULT_COMFY_PRESET, COMFYUI_WORKFLOW_TEMPLATES } from '@/services/aiGenerator'
import { DEFAULT_PIXAI_PARAMS, PIXAI_MODEL, PIXAI_MODELS } from '@/services/pixai'

const COMFY_CONFIG_VERSION = 3

// qwen（dashscope）与 doubao（火山方舟）经实测均支持浏览器 CORS 直连（预检放行），
// 自动开代理反而在未部署代理端点的环境（如自托管 NAS）导致生成收到 HTML 错误页 → 仅 pixai 保留
export const shouldEnableProxyByDefault = (provider?: ImageProviderId) => provider === 'pixai'

export const DEFAULT_API_CONFIG: ApiConfig = {
  activeProvider: 'gemini',
  // base64 为默认：URL 模式要求 API 服务端能公网访问参考图地址，实测中
  // pages.dev 源站域名失效、阿里云服务端下载自签证书站均会导致生成失败
  imagePassMode: 'base64',
  useProxy: false,
  stylePreset: 'realistic',
  sendStitchedSheet: false,
  providers: {
    pixai: { baseUrl: PROVIDER_META.pixai.defaultBaseUrl, apiKey: '', model: PIXAI_MODEL, customModel: '' },
    gemini: {
      baseUrl: PROVIDER_META.gemini.defaultBaseUrl,
      apiKey: '',
      model: PROVIDER_META.gemini.models[0].value,
      customModel: '',
    },
    gpt: {
      baseUrl: PROVIDER_META.gpt.defaultBaseUrl,
      apiKey: '',
      model: PROVIDER_META.gpt.models[0].value,
      customModel: '',
    },
    qwen: {
      baseUrl: PROVIDER_META.qwen.defaultBaseUrl,
      apiKey: '',
      model: PROVIDER_META.qwen.models[0].value,
      customModel: '',
    },
    doubao: {
      baseUrl: PROVIDER_META.doubao.defaultBaseUrl,
      apiKey: '',
      model: PROVIDER_META.doubao.models[0].value,
      customModel: '',
    },
    zhipu: {
      baseUrl: PROVIDER_META.zhipu.defaultBaseUrl,
      apiKey: '',
      model: PROVIDER_META.zhipu.models[0].value,
      customModel: '',
    },
    minimax: {
      baseUrl: PROVIDER_META.minimax.defaultBaseUrl,
      apiKey: '',
      model: PROVIDER_META.minimax.models[0].value,
      customModel: '',
    },
    openai_compat: {
      baseUrl: PROVIDER_META.openai_compat.defaultBaseUrl,
      apiKey: '',
      model: PROVIDER_META.openai_compat.models[0].value,
      customModel: '',
    },
    comfyui: {
      baseUrl: PROVIDER_META.comfyui.defaultBaseUrl,
      apiKey: '',
      model: PROVIDER_META.comfyui.models[0].value,
      customModel: '',
    },
  },
  pixaiParams: { ...DEFAULT_PIXAI_PARAMS },
  gptParams: {
    endpointMode: 'images_edits_json',
    size: '1024x1536',
    quality: 'high',
    inputFidelity: 'high',
    background: 'auto',
    outputFormat: 'png',
    moderation: 'auto',
  },
  geminiParams: {
    endpointMode: 'native',
    aspectRatio: '3:4',
    imageSize: '2K',
  },
  qwenParams: {
    size: '1024*1536',
    promptExtend: true,
    watermark: false,
    negativePrompt: '',
    n: 1,
  },
  doubaoParams: {
    size: '2K',
    sequentialImageGeneration: 'disabled',
    watermark: false,
    responseFormat: 'b64_json',
  },
  zhipuParams: {
    size: '720x1440',
    quality: 'hd',
  },
  minimaxParams: {
    aspectRatio: '3:4',
    responseFormat: 'url',
    promptOptimizer: true,
    useSubjectReference: false,
  },
  openaiCompatParams: {
    size: 'auto',
    n: 1,
    responseFormat: 'url',
    negativePrompt: '',
    sendReferenceImage: true,
  },
  comfyuiParams: {
    workflowPreset: DEFAULT_COMFY_PRESET,
    workflowJson: JSON.stringify(COMFYUI_WORKFLOW_TEMPLATES[DEFAULT_COMFY_PRESET].workflow, null, 2),
    ...COMFYUI_WORKFLOW_TEMPLATES[DEFAULT_COMFY_PRESET].defaults,
    randomizeSeed: true,
    timeoutSec: 600,
    configVersion: COMFY_CONFIG_VERSION,
  },
}

// v1 → v2：旧版默认的 Qwen 2.1 预设引用了本机通常不存在的模型，自动切换为 Qwen Image Edit 2509
const LEGACY_COMFY_BASE_URLS = ['http://127.0.0.1:8188', 'http://localhost:8188']

function migrateComfy(
  provider: ApiConfig['providers']['comfyui'],
  params: ApiConfig['comfyuiParams']
): { provider: ApiConfig['providers']['comfyui']; params: ApiConfig['comfyuiParams'] } {
  if ((params.configVersion ?? 1) >= COMFY_CONFIG_VERSION) return { provider, params }
  const nextParams = { ...params, configVersion: COMFY_CONFIG_VERSION }
  if (params.workflowPreset === 'qwen21_3img' || params.workflowPreset === 'qwen21_2img') {
    Object.assign(nextParams, {
      workflowPreset: DEFAULT_COMFY_PRESET,
      workflowJson: JSON.stringify(COMFYUI_WORKFLOW_TEMPLATES[DEFAULT_COMFY_PRESET].workflow, null, 2),
      ...COMFYUI_WORKFLOW_TEMPLATES[DEFAULT_COMFY_PRESET].defaults,
    })
  }
  const nextProvider = { ...provider }
  if (!nextProvider.baseUrl.trim() || LEGACY_COMFY_BASE_URLS.includes(nextProvider.baseUrl.trim())) {
    nextProvider.baseUrl = PROVIDER_META.comfyui.defaultBaseUrl
  }
  if (!PROVIDER_META.comfyui.models.some((m) => m.value === nextProvider.model)) {
    nextProvider.model = PROVIDER_META.comfyui.models[0].value
  }
  return { provider: nextProvider, params: nextParams }
}

export function mergeStoredConfig(raw: unknown): ApiConfig {
  if (!raw || typeof raw !== 'object') return DEFAULT_API_CONFIG
  const obj = raw as Partial<ApiConfig>
  const storedVer = obj.comfyuiParams?.configVersion ?? 1
  const comfy = migrateComfy(
    { ...DEFAULT_API_CONFIG.providers.comfyui, ...obj.providers?.comfyui },
    { ...DEFAULT_API_CONFIG.comfyuiParams, configVersion: 1, ...obj.comfyuiParams }
  )
  const activeProvider = obj.activeProvider ?? DEFAULT_API_CONFIG.activeProvider
  // 一次性迁移：历史版本默认 'url' 被写进 localStorage，但 URL 模式在真实环境中
  // 频繁失败（参考图 URL 域名失效 / API 服务端无法下载）。统一迁回 base64，
  // 设置页仍可手动切回 URL 模式。
  const imagePassMode = 'base64' as const
  // v3 起服务端 CORS 代理默认关闭；qwen/doubao 支持 CORS 直连不再自动开启，仅 pixai 保留自动开启
  const useProxy =
    storedVer < 3
      ? shouldEnableProxyByDefault(activeProvider)
      : (obj.useProxy ?? shouldEnableProxyByDefault(activeProvider))
  return {
    ...DEFAULT_API_CONFIG,
    ...obj,
    activeProvider,
    useProxy,
    imagePassMode,
    providers: {
      gemini: { ...DEFAULT_API_CONFIG.providers.gemini, ...obj.providers?.gemini },
      gpt: { ...DEFAULT_API_CONFIG.providers.gpt, ...obj.providers?.gpt },
      qwen: { ...DEFAULT_API_CONFIG.providers.qwen, ...obj.providers?.qwen },
      doubao: { ...DEFAULT_API_CONFIG.providers.doubao, ...obj.providers?.doubao },
      zhipu: { ...DEFAULT_API_CONFIG.providers.zhipu, ...obj.providers?.zhipu },
      minimax: { ...DEFAULT_API_CONFIG.providers.minimax, ...obj.providers?.minimax },
      openai_compat: { ...DEFAULT_API_CONFIG.providers.openai_compat, ...obj.providers?.openai_compat },
      pixai: { ...DEFAULT_API_CONFIG.providers.pixai, ...obj.providers?.pixai, model: PIXAI_MODELS.some((entry) => entry.value === obj.providers?.pixai?.model) ? obj.providers!.pixai.model : PIXAI_MODEL, customModel: '' },
      comfyui: comfy.provider,
    },
    gptParams: { ...DEFAULT_API_CONFIG.gptParams, ...obj.gptParams },
    geminiParams: { ...DEFAULT_API_CONFIG.geminiParams, ...obj.geminiParams },
    qwenParams: { ...DEFAULT_API_CONFIG.qwenParams, ...obj.qwenParams },
    doubaoParams: { ...DEFAULT_API_CONFIG.doubaoParams, ...obj.doubaoParams },
    zhipuParams: { ...DEFAULT_API_CONFIG.zhipuParams, ...obj.zhipuParams },
    minimaxParams: { ...DEFAULT_API_CONFIG.minimaxParams, ...obj.minimaxParams },
    openaiCompatParams: { ...DEFAULT_API_CONFIG.openaiCompatParams, ...obj.openaiCompatParams },
    pixaiParams: { ...DEFAULT_PIXAI_PARAMS, ...obj.pixaiParams, mode: obj.providers?.pixai?.model !== '2050048243034896798' && ['default', 'pro', 'ultra'].includes(obj.pixaiParams?.mode || '') ? obj.pixaiParams!.mode : 'default' },
    comfyuiParams: comfy.params,
  }
}

