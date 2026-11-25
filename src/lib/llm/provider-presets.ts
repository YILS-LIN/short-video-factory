import { defaultLlmConfig } from './config'
import type { LlmConfig, LlmProtocol } from './types'

export interface ProviderPreset {
  id: string
  name: string
  nameZh?: string
  aliases?: string
  apiUrl: string
  modelName: string
  suggestedModels?: readonly string[]
  keysUrl?: string
  modelsUrl?: string
  protocol?: LlmProtocol
}

const shengsuan: ProviderPreset = {
  id: 'shengsuanyun',
  name: 'ShengsuanYun',
  nameZh: '胜算云',
  apiUrl: 'https://router.shengsuanyun.com/api/v1',
  modelName: 'deepseek/deepseek-v4-flash',
  suggestedModels: ['deepseek/deepseek-v4-flash', 'deepseek/deepseek-v4-pro'],
  keysUrl: 'https://console.shengsuanyun.com/user/keys',
  modelsUrl: 'https://lean.shengsuanyun.com/apidocs/guides/quick-start',
}

const commonProviders: readonly ProviderPreset[] = [
  {
    id: 'zhipu',
    name: 'Zhipu (GLM)',
    nameZh: '智谱 GLM',
    aliases: 'bigmodel 智谱清言',
    apiUrl: 'https://open.bigmodel.cn/api/paas/v4',
    modelName: 'glm-4.5-flash',
    suggestedModels: ['glm-4.7-flash', 'glm-4.5-flash', 'glm-4-flash-250414'],
    modelsUrl: 'https://docs.bigmodel.cn/cn/guide/start/model-overview',
    keysUrl: 'https://open.bigmodel.cn/apikey/platform',
  },
  {
    id: 'deepseek',
    name: 'DeepSeek',
    nameZh: 'DeepSeek（深度求索）',
    apiUrl: 'https://api.deepseek.com',
    modelName: 'deepseek-v4-flash',
    keysUrl: 'https://platform.deepseek.com/api_keys',
  },
  {
    id: 'dashscope',
    name: 'Alibaba Cloud Model Studio (Qwen)',
    nameZh: '阿里云百炼（通义千问）',
    aliases: 'DashScope qwen',
    apiUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    modelName: 'qwen-plus',
    keysUrl: 'https://bailian.console.aliyun.com/?tab=model#/api-key',
  },
  {
    id: 'ark',
    name: 'Volcano Engine Ark (Doubao)',
    nameZh: '火山方舟（豆包）',
    aliases: 'volcengine 火山引擎 字节跳动',
    apiUrl: 'https://ark.cn-beijing.volces.com/api/v3',
    modelName: '',
    keysUrl: 'https://console.volcengine.com/ark/region:ark+cn-beijing/apiKey',
    modelsUrl: 'https://www.volcengine.com/docs/82379/1330310',
  },
  {
    id: 'moonshot',
    name: 'Moonshot AI (Kimi)',
    nameZh: '月之暗面（Kimi）',
    apiUrl: 'https://api.moonshot.cn/v1',
    modelName: 'moonshot-v1-8k',
    keysUrl: 'https://platform.moonshot.cn/console/api-keys',
  },
  {
    id: 'minimax',
    name: 'MiniMax',
    nameZh: 'MiniMax（稀宇科技）',
    aliases: '海螺',
    apiUrl: 'https://api.minimaxi.com/v1',
    modelName: 'MiniMax-M2.7',
    keysUrl: 'https://platform.minimaxi.com/user-center/basic-information/interface-key',
  },
  {
    id: 'stepfun',
    name: 'StepFun',
    nameZh: '阶跃星辰（StepFun）',
    apiUrl: 'https://api.stepfun.com/v1',
    modelName: 'step-3.5-flash',
    keysUrl: 'https://platform.stepfun.com/interface-key',
  },
  {
    id: 'qianfan',
    name: 'Baidu Qianfan',
    nameZh: '百度智能云千帆',
    aliases: '文心 ernie',
    apiUrl: 'https://qianfan.baidubce.com/v2',
    modelName: 'ernie-4.5-turbo-32k',
    keysUrl: 'https://console.bce.baidu.com/iam/#/iam/apikey/list',
  },
  {
    id: 'hunyuan',
    name: 'Tencent Hunyuan',
    nameZh: '腾讯混元',
    apiUrl: 'https://api.hunyuan.cloud.tencent.com/v1',
    modelName: 'hunyuan-turbo-latest',
    keysUrl: 'https://console.cloud.tencent.com/hunyuan/api-key',
  },
  {
    id: 'huaweicloud',
    name: 'Huawei Cloud ModelArts Studio',
    nameZh: '华为云 ModelArts Studio',
    aliases: 'MaaS 华为',
    apiUrl: 'https://api.modelarts-maas.com/openai/v1',
    modelName: '',
    keysUrl: 'https://console.huaweicloud.com/modelarts/?#/model-studio/authmanage',
    modelsUrl: 'https://support.huaweicloud.com/modelarts/',
  },
  {
    id: 'mimo',
    name: 'Xiaomi MiMo',
    nameZh: '小米 MiMo',
    apiUrl: 'https://api.xiaomimimo.com/v1',
    modelName: 'mimo-v2-flash',
    keysUrl: 'https://platform.xiaomimimo.com/',
  },
  {
    id: 'longcat',
    name: 'LongCat',
    nameZh: '美团 LongCat',
    apiUrl: 'https://api.longcat.chat/openai/v1',
    modelName: 'LongCat-Flash-Chat',
    keysUrl: 'https://longcat.chat/platform/api_keys',
  },
  {
    id: 'spark',
    name: 'iFLYTEK Spark',
    nameZh: '讯飞星火',
    apiUrl: 'https://spark-api-open.xf-yun.com/v1',
    modelName: 'lite',
    keysUrl: 'https://console.xfyun.cn/services/bm35',
  },
  {
    id: 'openai',
    name: 'OpenAI',
    aliases: 'ChatGPT GPT',
    apiUrl: 'https://api.openai.com/v1',
    modelName: 'gpt-5-mini',
    keysUrl: 'https://platform.openai.com/api-keys',
    protocol: 'openai-responses',
  },
  {
    id: 'anthropic',
    name: 'Anthropic (Claude)',
    apiUrl: 'https://api.anthropic.com/v1',
    modelName: 'claude-haiku-4-5',
    keysUrl: 'https://console.anthropic.com/settings/keys',
    protocol: 'anthropic-messages',
  },
  {
    id: 'gemini',
    name: 'Google Gemini',
    nameZh: '谷歌 Gemini',
    apiUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    modelName: 'gemini-2.5-flash',
    keysUrl: 'https://aistudio.google.com/app/apikey',
    modelsUrl: 'https://ai.google.dev/gemini-api/docs/openai',
  },
  {
    id: 'xai',
    name: 'xAI (Grok)',
    apiUrl: 'https://api.x.ai/v1',
    modelName: 'grok-4-1-fast-non-reasoning',
    keysUrl: 'https://console.x.ai/',
  },
  {
    id: 'mistral',
    name: 'Mistral AI',
    apiUrl: 'https://api.mistral.ai/v1',
    modelName: 'mistral-small-latest',
    keysUrl: 'https://console.mistral.ai/api-keys/',
  },
  {
    id: 'perplexity',
    name: 'Perplexity',
    apiUrl: 'https://api.perplexity.ai',
    modelName: 'sonar',
    keysUrl: 'https://www.perplexity.ai/settings/api',
  },
  {
    id: 'siliconflow',
    name: 'SiliconFlow',
    nameZh: '硅基流动',
    apiUrl: 'https://api.siliconflow.cn/v1',
    modelName: '',
    keysUrl: 'https://cloud.siliconflow.cn/account/ak',
    modelsUrl: 'https://cloud.siliconflow.cn/models',
  },
  {
    id: 'modelscope',
    name: 'ModelScope',
    nameZh: '魔搭社区（ModelScope）',
    apiUrl: 'https://api-inference.modelscope.cn/v1',
    modelName: '',
    keysUrl: 'https://modelscope.cn/my/myaccesstoken',
    modelsUrl: 'https://modelscope.cn/models',
  },
  {
    id: 'ppio',
    name: 'PPIO',
    nameZh: '派欧云 PPIO',
    apiUrl: 'https://api.ppinfra.com/v3/openai',
    modelName: '',
    keysUrl: 'https://ppio.com/settings/key-management',
    modelsUrl: 'https://ppio.com/models',
  },
  {
    id: 'openrouter',
    name: 'OpenRouter',
    apiUrl: 'https://openrouter.ai/api/v1',
    modelName: 'openrouter/auto',
    keysUrl: 'https://openrouter.ai/settings/keys',
    modelsUrl: 'https://openrouter.ai/models',
  },
  {
    id: 'aihubmix',
    name: 'AiHubMix',
    apiUrl: 'https://aihubmix.com/v1',
    modelName: '',
    keysUrl: 'https://aihubmix.com/token',
    modelsUrl: 'https://aihubmix.com/models',
  },
  {
    id: 'groq',
    name: 'Groq',
    apiUrl: 'https://api.groq.com/openai/v1',
    modelName: 'llama-3.1-8b-instant',
    keysUrl: 'https://console.groq.com/keys',
    modelsUrl: 'https://console.groq.com/docs/models',
  },
  {
    id: 'together',
    name: 'Together AI',
    apiUrl: 'https://api.together.ai/v1',
    modelName: '',
    keysUrl: 'https://api.together.ai/settings/projects/~current/api-keys',
    modelsUrl: 'https://docs.together.ai/docs/serverless-models',
  },
  {
    id: 'fireworks',
    name: 'Fireworks AI',
    apiUrl: 'https://api.fireworks.ai/inference/v1',
    modelName: '',
    keysUrl: 'https://fireworks.ai/account/api-keys',
    modelsUrl: 'https://fireworks.ai/models',
  },
  {
    id: 'nvidia',
    name: 'NVIDIA NIM',
    nameZh: '英伟达 NVIDIA NIM',
    apiUrl: 'https://integrate.api.nvidia.com/v1',
    modelName: '',
    keysUrl: 'https://build.nvidia.com/',
    modelsUrl: 'https://build.nvidia.com/explore/discover',
  },
  {
    id: 'ollama',
    name: 'Ollama',
    aliases: '本地 local',
    apiUrl: 'http://localhost:11434/v1',
    modelName: '',
    modelsUrl: 'https://ollama.com/search',
  },
  {
    id: 'lmstudio',
    name: 'LM Studio',
    aliases: '本地 local',
    apiUrl: 'http://localhost:1234/v1',
    modelName: '',
    modelsUrl: 'https://lmstudio.ai/docs/developer/openai-compat',
  },
]

export function getProviderGroups(demoEnabled: boolean) {
  return {
    partners: demoEnabled ? [shengsuan] : [],
    common: commonProviders,
  }
}

const normalizeBaseUrl = (url: string | null | undefined) => url?.trim().replace(/\/+$/, '')

export function matchesProvider(config: LlmConfig, preset: ProviderPreset): boolean {
  return (
    config.protocol === (preset.protocol ?? 'openai-compatible') &&
    normalizeBaseUrl(config.apiUrl) === preset.apiUrl
  )
}

export function applyProviderPreset(config: LlmConfig, preset?: ProviderPreset): LlmConfig {
  const defaults = defaultLlmConfig()
  return {
    ...config,
    protocol: preset?.protocol ?? defaults.protocol,
    apiUrl: preset?.apiUrl ?? defaults.apiUrl,
    modelName: preset?.modelName ?? defaults.modelName,
    apiKey: defaults.apiKey,
    anthropicAuthMode: defaults.anthropicAuthMode,
    customHeaders: defaults.customHeaders,
  }
}
