import request from '../lib/request'
import { buildMultipartBody } from './multipart'
import {
  TwelveLabsAnalyzeParams,
  TwelveLabsAnalyzeResult,
  TwelveLabsMatchFootageParams,
  TwelveLabsMatchFootageResult,
} from './types'

const DEFAULT_API_URL = 'https://api.twelvelabs.io/v1.3'
const DEFAULT_ANALYZE_PROMPT =
  'List the most engaging highlight moments in this video and briefly describe each one.'
// Pegasus 1.5 要求 max_tokens 介于 512-98304 之间
const MIN_ANALYZE_MAX_TOKENS = 512

function resolveBaseUrl(apiUrl?: string) {
  return (apiUrl || DEFAULT_API_URL).replace(/\/+$/, '')
}

function ensureApiKey(apiKey?: string) {
  if (!apiKey) {
    throw new Error('TwelveLabs API Key 未配置')
  }
}

/**
 * 使用 Pegasus 1.5 分析公开 URL 视频，返回亮点/摘要文本。
 *
 * 注意：Pegasus 不接受裸 video_id，必须提供可公开访问的 URL（最大 4GB）
 * 或已上传的 asset_id；本地直传 asset 上限为 200MB。
 */
export async function twelvelabsAnalyzeHighlights(
  params: TwelveLabsAnalyzeParams,
): Promise<TwelveLabsAnalyzeResult> {
  ensureApiKey(params.apiKey)
  if (!params.videoUrl) {
    throw new Error('视频 URL 不能为空')
  }

  const maxTokens = Math.max(params.maxTokens ?? MIN_ANALYZE_MAX_TOKENS, MIN_ANALYZE_MAX_TOKENS)
  const response = await request.post(
    `${resolveBaseUrl(params.apiUrl)}/analyze`,
    {
      model_name: 'pegasus1.5',
      video: { type: 'url', url: params.videoUrl },
      prompt: params.prompt || DEFAULT_ANALYZE_PROMPT,
      max_tokens: maxTokens,
      stream: false,
    },
    {
      headers: { 'x-api-key': params.apiKey, 'Content-Type': 'application/json' },
      // Pegasus 分析为长耗时操作，放宽超时
      timeout: 5 * 60 * 1000,
    },
  )

  const result = response.json<{ data?: string }>()
  return { text: result.data ?? '' }
}

/**
 * 通过 Marengo 语义检索，将索引内的素材按与文案的相关性排序，返回文件名列表。
 *
 * 前置条件：用户需先把素材库视频上传到一个 TwelveLabs 索引（Marengo embedding）。
 * 检索结果按 video_id 返回，这里再用索引视频列表把 video_id 映射为文件名，
 * 以便与本地素材库（按文件名）对齐。
 */
export async function twelvelabsMatchFootage(
  params: TwelveLabsMatchFootageParams,
): Promise<TwelveLabsMatchFootageResult> {
  ensureApiKey(params.apiKey)
  if (!params.indexId) {
    throw new Error('TwelveLabs 索引 ID 未配置')
  }
  if (!params.query) {
    throw new Error('检索文本不能为空')
  }

  const baseUrl = resolveBaseUrl(params.apiUrl)

  // 1) 语义检索，按相关性返回 video_id（rank 越小越相关）
  const { body, contentType } = buildMultipartBody([
    ['index_id', params.indexId],
    ['query_text', params.query],
    ['search_options', 'visual'],
    ['group_by', 'video'],
  ])
  const searchResponse = await request.post(`${baseUrl}/search`, body, {
    headers: { 'x-api-key': params.apiKey, 'Content-Type': contentType },
  })
  const searchResult = searchResponse.json<{
    data?: Array<{ id?: string; video_id?: string; clips?: Array<{ rank?: number }> }>
  }>()
  const rankedVideoIds = (searchResult.data ?? [])
    .map((item) => item.id || item.video_id)
    .filter((id): id is string => Boolean(id))

  if (!rankedVideoIds.length) {
    return { rankedFilenames: [] }
  }

  // 2) 拉取索引视频列表，建立 video_id -> filename 映射
  const videosResponse = await request.get(
    `${baseUrl}/indexes/${params.indexId}/videos?page_limit=50`,
    { headers: { 'x-api-key': params.apiKey } },
  )
  const videosResult = videosResponse.json<{
    data?: Array<{ _id?: string; system_metadata?: { filename?: string } }>
  }>()
  const idToFilename = new Map<string, string>()
  for (const video of videosResult.data ?? []) {
    if (video._id && video.system_metadata?.filename) {
      idToFilename.set(video._id, video.system_metadata.filename)
    }
  }

  const rankedFilenames = rankedVideoIds
    .map((id) => idToFilename.get(id))
    .filter((filename): filename is string => Boolean(filename))

  return { rankedFilenames }
}
