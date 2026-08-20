/**
 * TwelveLabs 集成相关类型定义
 *
 * 本模块为可选（opt-in）能力：仅当用户在设置中填写了 TwelveLabs API Key
 * 时才会生效，否则应用行为与未集成时完全一致。
 *
 * 文档：https://docs.twelvelabs.io
 */

/** TwelveLabs 接口通用配置 */
export interface TwelveLabsConfig {
  /** TwelveLabs API Key（从控制台获取） */
  apiKey: string
  /** 用于素材匹配的索引 ID（Marengo 嵌入检索） */
  indexId?: string
  /** 接口基础地址，默认 https://api.twelvelabs.io/v1.3 */
  apiUrl?: string
}

/** Pegasus 视频亮点分析参数 */
export interface TwelveLabsAnalyzeParams extends TwelveLabsConfig {
  /** 公开可访问的视频 URL（最大 4GB） */
  videoUrl: string
  /** 引导分析的提示词，默认提取视频亮点 */
  prompt?: string
  /** 最大输出 token 数，Pegasus 1.5 区间为 512-98304，默认 512 */
  maxTokens?: number
}

/** Pegasus 分析结果 */
export interface TwelveLabsAnalyzeResult {
  /** 模型生成的文本（亮点/摘要等） */
  text: string
}

/** Marengo 素材匹配参数 */
export interface TwelveLabsMatchFootageParams extends TwelveLabsConfig {
  /** 查询文本（通常为短视频文案/旁白） */
  query: string
}

/**
 * 素材匹配结果：按相关性升序的文件名列表
 *
 * 与本地素材库的文件名（不含路径）对应，可据此对随机素材排序，
 * 让与文案最相关的镜头优先入选。
 */
export interface TwelveLabsMatchFootageResult {
  /** 按相关性从高到低排序的视频文件名 */
  rankedFilenames: string[]
}
