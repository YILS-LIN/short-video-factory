import axios from 'axios'
import { createHash } from 'node:crypto'
import { canonicalizeEx } from 'json-canonicalize'
import type { MetadataCache } from './cache'
import { verifyManifest } from './signature'
import type {
  MetadataBuildConfig,
  MetadataCacheRecord,
  MetadataClientContext,
  MetadataState,
} from './types'

const REQUEST_TIMEOUT_MS = 8000
const MAX_RESPONSE_BYTES = 2 * 1024 * 1024

export type ManifestFetcher = (url: string) => Promise<unknown>
export type MetadataStateListener = (state: MetadataState) => void

export interface MetadataServiceOptions {
  config: MetadataBuildConfig
  context: MetadataClientContext
  cache: MetadataCache
  fetchManifest?: ManifestFetcher
  now?: () => Date
}

export class MetadataService {
  private state: MetadataState
  private sequence = 0
  private initialized: Promise<void> | null = null
  private refreshing: Promise<MetadataState> | null = null
  private acceptedPayloadDigest: string | null = null
  private readonly listeners = new Set<MetadataStateListener>()
  private readonly fetchManifest: ManifestFetcher
  private readonly now: () => Date

  constructor(private readonly options: MetadataServiceOptions) {
    this.fetchManifest = options.fetchManifest ?? defaultManifestFetcher
    this.now = options.now ?? (() => new Date())
    this.state = {
      sequence: this.sequence,
      phase: 'idle',
      context: options.context,
      payload: null,
      lastSuccessAt: null,
      error: null,
    }
  }

  subscribe(listener: MetadataStateListener): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  async getState(): Promise<MetadataState> {
    await this.initialize()
    return this.copyState()
  }

  async refresh(): Promise<MetadataState> {
    if (this.refreshing) return this.refreshing
    await this.initialize()
    if (this.refreshing) return this.refreshing
    this.refreshing = this.refreshOnce()
    try {
      return await this.refreshing
    } finally {
      this.refreshing = null
    }
  }

  private async initialize(): Promise<void> {
    if (!this.initialized) {
      this.initialized = this.readCachedManifest()
    }
    await this.initialized
  }

  private async readCachedManifest(): Promise<void> {
    try {
      const value = await this.options.cache.read()
      if (!isRecord(value) || typeof value['lastSuccessAt'] !== 'string') return
      if (!Number.isFinite(Date.parse(value['lastSuccessAt']))) return

      const payload = verifyManifest(value['manifest'], this.getVerificationOptions())
      this.acceptedPayloadDigest = getPayloadDigest(getEnvelopePayload(value['manifest']))
      this.state = {
        ...this.state,
        phase: 'ready',
        payload,
        lastSuccessAt: value['lastSuccessAt'],
        error: null,
      }
      this.publish()
    } catch (error) {
      console.warn(
        '[metadata] Ignoring unavailable or invalid local Manifest cache:',
        getErrorMessage(error),
      )
    }
  }

  private async refreshOnce(): Promise<MetadataState> {
    this.setState({ phase: 'loading', error: null })
    try {
      const response = await this.fetchManifest(this.getManifestUrl())
      const payload = verifyManifest(response, this.getVerificationOptions())
      const digest = getPayloadDigest(getEnvelopePayload(response))
      const oldRevision = this.state.payload?.revision
      const oldDigest = this.acceptedPayloadDigest

      if (oldRevision !== undefined && payload.revision < oldRevision) {
        throw new Error('Manifest revision is older than the locally accepted revision.')
      }
      if (oldRevision === payload.revision && oldDigest !== digest) {
        throw new Error('Manifest content changed without incrementing its revision.')
      }

      const lastSuccessAt = this.now().toISOString()
      const record: MetadataCacheRecord = { manifest: response, lastSuccessAt }
      try {
        await this.options.cache.write(record)
      } catch (error) {
        console.warn('[metadata] Failed to persist the verified Manifest:', getErrorMessage(error))
      }

      this.acceptedPayloadDigest = digest
      this.setState({ phase: 'ready', payload, lastSuccessAt, error: null })
      return this.copyState()
    } catch (error) {
      const message = getErrorMessage(error)
      this.setState({
        phase: this.state.payload ? 'ready' : 'error',
        error: message,
      })
      throw new Error(message)
    }
  }

  private getManifestUrl(): string {
    const base = new URL(this.options.config.apiBaseUrl)
    const basePath = base.pathname.endsWith('/') ? base.pathname : `${base.pathname}/`
    base.pathname = basePath
    const url = new URL(`v1/apps/${this.options.context.apiAppId}/manifest`, base)
    url.searchParams.set('channel', this.options.context.releaseChannel)
    return url.toString()
  }

  private getVerificationOptions() {
    return {
      publicKeys: this.options.config.publicKeys,
      expectedAppId: this.options.context.apiAppId,
      expectedChannel: this.options.context.releaseChannel,
    }
  }

  private setState(update: Partial<Omit<MetadataState, 'sequence' | 'context'>>) {
    this.state = { ...this.state, ...update }
    this.publish()
  }

  private publish() {
    this.sequence += 1
    this.state = { ...this.state, sequence: this.sequence }
    const state = this.copyState()
    for (const listener of this.listeners) {
      try {
        listener(state)
      } catch (error) {
        console.error('[metadata] State listener failed:', error)
      }
    }
  }

  private copyState(): MetadataState {
    return JSON.parse(JSON.stringify(this.state)) as MetadataState
  }
}

async function defaultManifestFetcher(url: string): Promise<unknown> {
  const response = await axios.get<unknown>(url, {
    timeout: REQUEST_TIMEOUT_MS,
    maxContentLength: MAX_RESPONSE_BYTES,
    maxBodyLength: MAX_RESPONSE_BYTES,
    maxRedirects: 0,
    responseType: 'json',
    headers: { Accept: 'application/json' },
    transitional: { forcedJSONParsing: true, silentJSONParsing: false },
  })
  const contentType = String(response.headers['content-type'] ?? '').toLowerCase()
  if (!contentType.includes('application/json')) {
    throw new Error('Metadata API returned a non-JSON response.')
  }
  return response.data
}

function getPayloadDigest(payload: unknown): string {
  return createHash('sha256')
    .update(canonicalizeEx(payload, { strictUndefined: true }), 'utf8')
    .digest('hex')
}

function getEnvelopePayload(value: unknown): unknown {
  if (!isRecord(value) || !('payload' in value)) {
    throw new Error('Metadata API returned an invalid Manifest envelope.')
  }
  return value['payload']
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function getErrorMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    if (error.response) return `Metadata API request failed with HTTP ${error.response.status}.`
    if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
      return 'Metadata API request timed out.'
    }
    return 'Metadata API could not be reached.'
  }
  return error instanceof Error ? error.message : String(error)
}
