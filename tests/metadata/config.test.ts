import { describe, expect, it } from 'vitest'
import {
  createMetadataClientContext,
  normalizeArchitecture,
  normalizePlatform,
  parseDistributionChannel,
} from '../../electron/metadata/config'
import { testConfig } from './fixtures'

describe('metadata client context', () => {
  it('normalizes desktop OS and architecture values for API targeting', () => {
    expect(normalizePlatform('win32')).toBe('windows')
    expect(normalizePlatform('darwin')).toBe('macos')
    expect(normalizeArchitecture('ia32')).toBe('x86')
    expect(normalizeArchitecture('arm64')).toBe('arm64')
  })

  it('keeps unsupported distribution labels non-targetable as unknown', () => {
    const context = createMetadataClientContext(testConfig, '1.2.2', 'win32', 'x64')

    expect(parseDistributionChannel('ci')).toBe('unknown')
    expect(context.apiAppId).toBe('short-video-factory')
    expect(context.distributionChannel).toBe('official')
    expect(context.platform).toBe('windows')
    expect(context.architecture).toBe('x64')
  })
})
