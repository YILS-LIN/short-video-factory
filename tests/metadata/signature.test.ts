import { generateKeyPairSync } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { verifyManifest } from '../../electron/metadata/signature'
import { testPublicKey, signManifest, makePayload } from './fixtures'

describe('verifyManifest', () => {
  it('validates a signed Manifest and expected application identity', () => {
    const payload = makePayload()
    const manifest = signManifest(payload)

    const result = verifyManifest(manifest, {
      publicKeys: { 'test-key': testPublicKey },
      expectedAppId: 'short-video-factory',
      expectedChannel: 'stable',
    })

    expect(result.app.id).toBe('short-video-factory')
    expect(result.release).toBeNull()
  })

  it('accepts targeted notices with a valid default translation', () => {
    const payload = makePayload({
      notices: [
        {
          id: 'windows-notice',
          revision: 1,
          kind: 'general',
          severity: 'info',
          publishedAt: '2026-10-09T00:00:00Z',
          defaultLocale: 'en',
          translations: {
            en: { title: 'Notice', summary: 'Summary', bodyMarkdown: 'Content' },
          },
          targets: { platforms: ['windows'] },
        },
      ],
    })

    const result = verifyManifest(signManifest(payload), {
      publicKeys: { 'test-key': testPublicKey },
      expectedAppId: 'short-video-factory',
      expectedChannel: 'stable',
    })

    expect(result.notices).toHaveLength(1)
    expect(result.notices[0]?.targets?.platforms).toEqual(['windows'])
  })

  it('accepts an optional update policy independently of a full Release', () => {
    const payload = makePayload({
      updatePolicy: {
        minSupportedVersion: '1.3.0',
        notesOverride: {
          versionRange: '>=1.3.0 <1.4.0',
          mode: 'prepend',
          severity: 'warning',
          defaultLocale: 'en',
          translations: {
            en: { title: 'Important', bodyMarkdown: 'Read this before updating.' },
          },
        },
      },
    })

    const result = verifyManifest(signManifest(payload), {
      publicKeys: { 'test-key': testPublicKey },
      expectedAppId: 'short-video-factory',
      expectedChannel: 'stable',
    })

    expect(result.release).toBeNull()
    expect(result.updatePolicy?.minSupportedVersion).toBe('1.3.0')
    expect(result.updatePolicy?.notesOverride?.mode).toBe('prepend')
  })

  it('rejects an empty update policy instead of treating it as configured', () => {
    const payload = makePayload({ updatePolicy: {} })

    expect(() =>
      verifyManifest(signManifest(payload), {
        publicKeys: { 'test-key': testPublicKey },
        expectedAppId: 'short-video-factory',
        expectedChannel: 'stable',
      }),
    ).toThrow('Metadata API returned a Manifest with an unsupported or invalid schema.')
  })

  it('rejects payload tampering before schema processing', () => {
    const manifest = signManifest(makePayload())
    const mutablePayload = manifest.payload as { app: { name: string } }
    mutablePayload.app.name = '被篡改'

    expect(() =>
      verifyManifest(manifest, {
        publicKeys: { 'test-key': testPublicKey },
        expectedAppId: 'short-video-factory',
        expectedChannel: 'stable',
      }),
    ).toThrow('Manifest signature verification failed.')
  })

  it('rejects an untrusted key ID', () => {
    const manifest = signManifest(makePayload())
    manifest.signature.keyId = 'unknown-key'

    expect(() =>
      verifyManifest(manifest, {
        publicKeys: { 'test-key': testPublicKey },
        expectedAppId: 'short-video-factory',
        expectedChannel: 'stable',
      }),
    ).toThrow("Manifest signing key 'unknown-key' is not trusted by this build.")
  })

  it('rejects a valid signature for a different expected app ID or channel', () => {
    const manifest = signManifest(makePayload())
    const options = {
      publicKeys: { 'test-key': testPublicKey },
      expectedAppId: 'another-app',
      expectedChannel: 'stable',
    }
    expect(() => verifyManifest(manifest, options)).toThrow(
      'Manifest app ID does not match this application.',
    )

    expect(() =>
      verifyManifest(manifest, {
        ...options,
        expectedAppId: 'short-video-factory',
        expectedChannel: 'beta',
      }),
    ).toThrow('Manifest release channel does not match this build.')
  })

  it('rejects signatures from a different Ed25519 key', () => {
    const otherPair = generateKeyPairSync('ed25519')
    const manifest = signManifest(makePayload(), otherPair.privateKey)

    expect(() =>
      verifyManifest(manifest, {
        publicKeys: { 'test-key': testPublicKey },
        expectedAppId: 'short-video-factory',
        expectedChannel: 'stable',
      }),
    ).toThrow('Manifest signature verification failed.')
  })
})
