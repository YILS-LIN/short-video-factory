import type {
  DistributionChannel,
  MetadataArchitecture,
  MetadataBuildConfig,
  MetadataClientContext,
  MetadataEnvironment,
  MetadataPlatform,
  ReleaseChannel,
} from './types'

declare const __APP_METADATA_CONFIG__: MetadataBuildConfig

export function getMetadataBuildConfig(): MetadataBuildConfig {
  try {
    return __APP_METADATA_CONFIG__
  } catch {
    return {
      environment: 'test',
      apiBaseUrl: 'http://127.0.0.1:3000',
      appId: 'short-video-factory',
      releaseChannel: 'stable',
      distributionChannel: 'unknown',
      buildId: 'test',
      publicKeys: {},
    }
  }
}

export function createMetadataClientContext(
  config: MetadataBuildConfig,
  version: string,
  platform: NodeJS.Platform,
  arch: string,
): MetadataClientContext {
  return {
    environment: config.environment,
    apiAppId: config.appId,
    version,
    buildId: config.buildId,
    releaseChannel: config.releaseChannel,
    distributionChannel: parseDistributionChannel(config.distributionChannel),
    platform: normalizePlatform(platform),
    architecture: normalizeArchitecture(arch),
    capabilities: ['markdown-v1', 'announcement-actions-v1'],
  }
}

export function normalizePlatform(platform: NodeJS.Platform): MetadataPlatform {
  switch (platform) {
    case 'win32':
      return 'windows'
    case 'darwin':
      return 'macos'
    case 'linux':
      return 'linux'
    default:
      throw new Error(`Unsupported metadata platform: ${platform}`)
  }
}

export function normalizeArchitecture(architecture: string): MetadataArchitecture {
  switch (architecture) {
    case 'x64':
    case 'arm64':
      return architecture
    case 'ia32':
    case 'x86':
      return 'x86'
    default:
      throw new Error(`Unsupported metadata architecture: ${architecture}`)
  }
}

export function parseMetadataEnvironment(value: string): MetadataEnvironment {
  if (value === 'development' || value === 'production' || value === 'test') return value
  throw new Error(`Unsupported metadata environment: ${value}`)
}

export function parseReleaseChannel(value: string): ReleaseChannel {
  if (value === 'stable' || value === 'beta' || value === 'nightly') return value
  throw new Error(`Unsupported release channel: ${value}`)
}

export function parseDistributionChannel(value: string): DistributionChannel {
  if (value === 'official' || value === 'partner' || value === 'self_build') return value
  return 'unknown'
}
