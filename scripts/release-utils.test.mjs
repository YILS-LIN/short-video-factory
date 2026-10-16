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

function scenario({ existing = false, incomplete = false, publishFails = false } = {}) {
  const installers = expectedInstallers('1.3.0').map((name) => ({
    name,
    size: 123,
    path: `artifacts/${name}`,
  }))
  let release = existing
    ? {
        tag_name: 'v1.3.0',
        published_at: 'date',
        draft: false,
        assets: installers.map((f) => ({ ...f, state: 'uploaded' })),
      }
    : null
  const calls = []
  const gh = (...args) => {
    calls.push(args)
    if (args[0] === 'api') {
      if (!release) throw Object.assign(new Error('Not Found'), { stderr: 'HTTP 404' })
      return JSON.stringify(release)
    }
    if (args[1] === 'create') release = { tag_name: 'v1.3.0', draft: true, assets: [] }
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
