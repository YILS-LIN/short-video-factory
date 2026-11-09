import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  expectedInstallers,
  releaseNotes,
  verifyAssets,
  publishCompleteRelease,
} from './release-utils.mjs'

test('requires all three completed installers with matching sizes', () => {
  const files = expectedInstallers('1.3.0').map((name) => ({ name, size: 123 }))
  const assets = files.map((file) => ({ ...file, state: 'uploaded' }))
  assert.doesNotThrow(() => verifyAssets({ assets }, files))
  assert.throws(() => verifyAssets({ assets: assets.slice(1) }, files))
  assert.throws(() => verifyAssets({ assets: assets.map((a) => ({ ...a, state: 'new' })) }, files))
  assert.throws(() => verifyAssets({ assets: assets.map((a) => ({ ...a, size: 1 })) }, files))
})

test('extracts the exact tag without leaking adjacent versions', () => {
  const text = '# Changelog\n## [v1.3.0] - date\nNew\n## [v1.2.2] - date\nOld'
  assert.equal(releaseNotes(text, 'v1.3.0'), '## [v1.3.0] - date\nNew')
  assert.throws(() => releaseNotes(text, 'v1.3'))
})

function scenario({
  existing = false,
  draft = false,
  incomplete = false,
  publishFails = false,
} = {}) {
  const installers = expectedInstallers('1.3.0').map((name) => ({
    name,
    size: 123,
    path: `artifacts/${name}`,
  }))
  let release =
    existing || draft
      ? {
          id: 123,
          tag_name: 'v1.3.0',
          published_at: draft ? null : 'date',
          draft,
          assets: installers.map((f) => ({ ...f, state: 'uploaded' })),
        }
      : null
  const calls = []
  const gh = (...args) => {
    calls.push(args)
    if (args[0] === 'api') {
      if (args.includes('--slurp')) return JSON.stringify([[], release ? [release] : []])
      if (!release || (args[1].includes('/tags/') && release.draft))
        throw Object.assign(new Error('Not Found'), { stderr: 'HTTP 404' })
      assert.ok(args[1].endsWith('/tags/v1.3.0') || args[1].endsWith(`/releases/${release.id}`))
      return JSON.stringify(release)
    }
    if (args[1] === 'create') release = { id: 123, tag_name: 'v1.3.0', draft: true, assets: [] }
    if (args[1] === 'upload')
      release.assets = installers
        .slice(incomplete ? 1 : 0)
        .map((f) => ({ ...f, state: 'uploaded' }))
    if (args.includes('--draft=false') && !publishFails)
      Object.assign(release, { draft: false, published_at: 'date' })
    return ''
  }
  return {
    calls,
    run: () =>
      publishCompleteRelease({
        tag: 'v1.3.0',
        repo: 'owner/repo',
        installers,
        notesPath: 'notes.md',
        gh,
      }),
  }
}

test('publishes only after uploaded installers are verified', () => {
  const state = scenario()
  assert.equal(state.run().draft, false)
  assert.ok(
    state.calls.findIndex((args) => args[1] === 'upload') <
      state.calls.findIndex((args) => args.includes('--draft=false')),
  )
})

test('incomplete uploads cannot publish and unsuccessful publication cannot notify docs', () => {
  const state = scenario({ incomplete: true })
  assert.throws(state.run, /missing or incomplete/)
  assert.equal(
    state.calls.some((args) => args.includes('--draft=false')),
    false,
  )
  assert.throws(scenario({ publishFails: true }).run, /not fully published/)
})

test('retries verify public releases without modifying them', () => {
  const state = scenario({ existing: true })
  state.run()
  assert.equal(
    state.calls.every((args) => args[0] === 'api'),
    true,
  )
})

test('verifies a newly created draft by ID when tag lookup returns 404', () => {
  const state = scenario()
  assert.equal(state.run().draft, false)
  assert.ok(state.calls.some((args) => args[1] === 'repos/owner/repo/releases/123'))
})

test('resumes an existing draft found on a later page without creating another release', () => {
  const state = scenario({ draft: true })
  assert.equal(state.run().draft, false)
  assert.equal(
    state.calls.some((args) => args[1] === 'create'),
    false,
  )
  assert.ok(state.calls.some((args) => args.includes('--paginate') && args.includes('--slurp')))
  assert.ok(state.calls.some((args) => args[1] === 'repos/owner/repo/releases/123'))
})

test('does not fall back to listing on authentication or other API errors', () => {
  const calls = []
  const error = Object.assign(new Error('Forbidden'), { stderr: 'HTTP 403' })
  assert.throws(
    () =>
      publishCompleteRelease({
        tag: 'v1.3.0',
        repo: 'owner/repo',
        installers: [],
        notesPath: 'notes.md',
        gh: (...args) => {
          calls.push(args)
          throw error
        },
      }),
    (actual) => actual === error,
  )
  assert.equal(calls.length, 1)
})
