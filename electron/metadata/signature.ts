import { createPublicKey, verify } from 'node:crypto'
import { canonicalizeEx } from 'json-canonicalize'
import { ManifestEnvelopeSchema, ManifestPayloadSchema, type ManifestPayload } from './schema'

export interface ManifestVerificationOptions {
  publicKeys: Record<string, string>
  expectedAppId: string
  expectedChannel: string
}

export function verifyManifest(
  value: unknown,
  options: ManifestVerificationOptions,
): ManifestPayload {
  const envelopeResult = ManifestEnvelopeSchema.safeParse(value)
  if (!envelopeResult.success) {
    throw new Error('Metadata API returned an invalid Manifest envelope.')
  }

  const { payload, signature } = envelopeResult.data
  const publicKeyPem = options.publicKeys[signature.keyId]
  if (!publicKeyPem) {
    throw new Error(`Manifest signing key '${signature.keyId}' is not trusted by this build.`)
  }

  let publicKey
  let canonicalPayload: string
  try {
    publicKey = createPublicKey(publicKeyPem)
    if (publicKey.asymmetricKeyType !== 'ed25519') {
      throw new Error('The configured Manifest key is not Ed25519.')
    }
    canonicalPayload = canonicalizeEx(payload, { strictUndefined: true })
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error)
    throw new Error(`Manifest signature could not be validated: ${detail}`)
  }

  const validSignature = verify(
    null,
    Buffer.from(canonicalPayload, 'utf8'),
    publicKey,
    Buffer.from(signature.value, 'base64url'),
  )
  if (!validSignature) throw new Error('Manifest signature verification failed.')

  const payloadResult = ManifestPayloadSchema.safeParse(payload)
  if (!payloadResult.success) {
    throw new Error('Metadata API returned a Manifest with an unsupported or invalid schema.')
  }

  const parsedPayload = payloadResult.data
  if (parsedPayload.app.id !== options.expectedAppId) {
    throw new Error('Manifest app ID does not match this application.')
  }
  if (parsedPayload.channel !== options.expectedChannel) {
    throw new Error('Manifest release channel does not match this build.')
  }
  if (parsedPayload.revision !== parsedPayload.app.manifestRevision) {
    throw new Error('Manifest revision does not match the app metadata revision.')
  }
  if (parsedPayload.release && parsedPayload.release.channel !== parsedPayload.channel) {
    throw new Error('Manifest release does not match the requested channel.')
  }

  const noticeIds = new Set<string>()
  for (const notice of parsedPayload.notices) {
    if (noticeIds.has(notice.id)) throw new Error('Manifest contains duplicate announcement IDs.')
    noticeIds.add(notice.id)
  }

  return parsedPayload
}
