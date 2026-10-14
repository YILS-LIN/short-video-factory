import { generateKeyPairSync, sign } from 'node:crypto'
import { canonicalizeEx } from 'json-canonicalize'
import type { MetadataBuildConfig, MetadataClientContext } from '../../electron/metadata/types'

export const testKeyPair = generateKeyPairSync('ed25519')
export const testPublicKey = testKeyPair.publicKey
  .export({ type: 'spki', format: 'pem' })
  .toString()

export const testConfig: MetadataBuildConfig = {
  environment: 'test',
  apiBaseUrl: 'http://127.0.0.1:3000',
  appId: 'short-video-factory',
  releaseChannel: 'stable',
  distributionChannel: 'official',
  buildId: 'test-build',
  publicKeys: { 'test-key': testPublicKey },
}

export const testContext: MetadataClientContext = {
  environment: 'test',
  apiAppId: 'short-video-factory',
  version: '1.2.2',
  buildId: 'test-build',
  releaseChannel: 'stable',
  distributionChannel: 'official',
  platform: 'windows',
  architecture: 'x64',
  capabilities: ['markdown-v1', 'announcement-actions-v1'],
}

export function makePayload(overrides: Record<string, unknown> = {}) {
  const requestedRevision = typeof overrides['revision'] === 'number' ? overrides['revision'] : 1
  const appOverrides =
    typeof overrides['app'] === 'object' && overrides['app'] !== null
      ? (overrides['app'] as Record<string, unknown>)
      : {}
  const { app: _app, revision: _revision, ...payloadOverrides } = overrides
  return {
    schemaVersion: 1,
    revision: requestedRevision,
    channel: 'stable',
    app: {
      id: 'short-video-factory',
      name: '短视频工厂',
      description: '测试应用元数据',
      authorId: 'yils',
      status: 'active',
      defaultChannel: 'stable',
      platforms: ['windows', 'macos', 'linux'],
      updatedAt: '2026-10-09T00:00:00Z',
      manifestRevision:
        typeof appOverrides['manifestRevision'] === 'number'
          ? appOverrides['manifestRevision']
          : requestedRevision,
      homepage: 'https://short-video-factory.yils.blog/',
      docs: 'https://short-video-factory.yils.blog/',
      ...appOverrides,
    },
    release: null,
    notices: [],
    tips: [],
    remoteConfig: { features: {}, limits: {}, endpoints: {} },
    commercial: { enabled: false, plans: [] },
    author: { id: 'yils', name: 'Yils', displayName: 'Yils', homepage: 'https://yils.blog/' },
    ...payloadOverrides,
  }
}

export function signManifest(payload: unknown, revisionKey = testKeyPair.privateKey) {
  const value = sign(
    null,
    Buffer.from(canonicalizeEx(payload, { strictUndefined: true }), 'utf8'),
    revisionKey,
  ).toString('base64url')
  return {
    payload,
    signature: { alg: 'Ed25519', keyId: 'test-key', value },
  }
}
