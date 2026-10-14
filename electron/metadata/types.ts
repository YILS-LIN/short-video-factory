import type { ManifestPayloadSchema } from './schema'

export type MetadataEnvironment = 'development' | 'production' | 'test'
export type ReleaseChannel = 'stable' | 'beta' | 'nightly'
export type DistributionChannel = 'official' | 'partner' | 'self_build' | 'unknown'
export type MetadataPlatform = 'windows' | 'macos' | 'linux'
export type MetadataArchitecture = 'x64' | 'arm64' | 'x86'

export interface MetadataBuildConfig {
  environment: MetadataEnvironment
  apiBaseUrl: string
  appId: 'short-video-factory'
  releaseChannel: ReleaseChannel
  distributionChannel: string
  buildId: string
  publicKeys: Record<string, string>
}

export interface MetadataClientContext {
  environment: MetadataEnvironment
  apiAppId: 'short-video-factory'
  version: string
  buildId: string
  releaseChannel: ReleaseChannel
  distributionChannel: DistributionChannel
  platform: MetadataPlatform
  architecture: MetadataArchitecture
  capabilities: string[]
}

export interface MetadataState {
  sequence: number
  phase: 'idle' | 'loading' | 'ready' | 'error'
  context: MetadataClientContext
  payload: import('./schema').ManifestPayload | null
  lastSuccessAt: string | null
  error: string | null
}

export interface MetadataCacheRecord {
  manifest: unknown
  lastSuccessAt: string
}

export type MetadataPayload = import('./schema').ManifestPayload
export type MetadataSchema = typeof ManifestPayloadSchema
