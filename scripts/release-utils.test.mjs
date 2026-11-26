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
  conflict = false,
  hiddenReads = 0,
  hiddenIdReads = 0,
  missingTag = false,
  partialDraft = false,
} = {}) {
  const installers = expectedInstallers('1.3.0').map((name) => ({
    name,
    size: 123,
    path: `artifacts/${name}`,
  }))
  const uploadUrl = 'https://uploads.github.com/repos/owner/repo/releases/123/assets{?name,label}'
  const seed = () => ({
    id: 123,
    tag_name: 'v1.3.0',
    published_at: draft ? null : 'date',
    draft,
    upload_url: uploadUrl,
    assets: installers.map((f) => ({ ...f, state: 'uploaded' })),
  })
  let release = existing || draft ? seed() : null
  if (partialDraft)
    release.assets = [
      release.assets[0],
      { id: 42, name: installers[1].name, state: 'starter', size: 0 },
    ]
  const calls = []
  const waits = []
  const notFound = () => Object.assign(new Error('Not Found'), { stderr: 'HTTP 404' })
  const createConflict = Object.assign(new Error('Already exists'), { stderr: 'HTTP 422' })
  const gh = (...args) => {
    calls.push(args)
    const [, endpoint] = args
    assert.equal(args[0], 'api')
    if (args.includes('--slurp')) {
      return JSON.stringify([[], release && hiddenReads-- <= 0 ? [release] : []])
    }
    if (endpoint === 'repos/owner/repo/git/ref/tags/v1.3.0') {
      if (missingTag) throw notFound()
      return ''
    }
    if (args.includes('POST')) {
      assert.equal(endpoint, 'repos/owner/repo/releases')
      assert.ok(args.includes('tag_name=v1.3.0') && args.includes('draft=true'))
      assert.ok(args.includes('body=@notes.md'))
      release = { ...seed(), draft: true, published_at: null, assets: [] }
      if (conflict) throw createConflict
      return JSON.stringify(release)
    }
    if (endpoint.endsWith('/tags/v1.3.0')) {
      if (!release || release.draft) throw notFound()
      return JSON.stringify(release)
    }
    if (args.includes('DELETE')) {
      assert.equal(endpoint, 'repos/owner/repo/releases/assets/42')
      release.assets = release.assets.filter((asset) => asset.id !== 42)
      return ''
    }
    assert.equal(endpoint, 'repos/owner/repo/releases/123')
    if (args.length === 2 && hiddenIdReads-- > 0) throw notFound()
    if (args.includes('draft=false') && !publishFails)
      Object.assign(release, { draft: false, published_at: 'date' })
    return JSON.stringify(release)
  }
  const upload = async (url, file) => {
    assert.equal(url, uploadUrl)
    calls.push(['upload', file.name])
    if (!incomplete || file !== installers[0]) release.assets.push({ ...file, state: 'uploaded' })
  }
  return {
    calls,
    waits,
    createConflict,
    run: () =>
      publishCompleteRelease({
        tag: 'v1.3.0',
        repo: 'owner/repo',
        installers,
        notesPath: 'notes.md',
        gh,
        upload,
        wait: async (ms) => waits.push(ms),
        log: () => {},
      }),
  }
}

test('publishes only after uploaded installers are verified', async () => {
  const state = scenario()
  assert.equal((await state.run()).draft, false)
  assert.ok(
    state.calls.findLastIndex((args) => args[0] === 'upload') <
      state.calls.findIndex((args) => args.includes('draft=false')),
  )
})

test('incomplete uploads cannot publish and unsuccessful publication cannot notify docs', async () => {
  const state = scenario({ incomplete: true })
  await assert.rejects(state.run, /missing or incomplete/)
  assert.equal(
    state.calls.some((args) => args.includes('draft=false')),
    false,
  )
  await assert.rejects(scenario({ publishFails: true }).run, /not fully published/)
})

test('retries verify public releases without modifying them', async () => {
  const state = scenario({ existing: true })
  await state.run()
  assert.deepEqual(state.calls, [['api', 'repos/owner/repo/releases/tags/v1.3.0']])
})

test('uses the create response even while the new draft is absent from the list', async () => {
  const state = scenario({ hiddenReads: Infinity })
  assert.equal((await state.run()).draft, false)
  assert.equal(state.calls.filter((args) => args.includes('--slurp')).length, 1)
  assert.equal(state.calls.filter((args) => args.includes('POST')).length, 1)
  assert.ok(state.calls.some((args) => args[1] === 'repos/owner/repo/releases/123'))
})

test('retries a temporarily invisible release by ID without repeating uploads', async () => {
  const state = scenario({ hiddenIdReads: 1 })
  assert.equal((await state.run()).draft, false)
  assert.deepEqual(state.waits, [1000])
  assert.equal(state.calls.filter((args) => args[0] === 'upload').length, 3)
})

test('resumes a partial draft found on a later page without replacing the completed asset', async () => {
  const state = scenario({ draft: true, partialDraft: true })
  assert.equal((await state.run()).draft, false)
  assert.equal(
    state.calls.some((args) => args.includes('POST')),
    false,
  )
  assert.ok(state.calls.some((args) => args.includes('--paginate') && args.includes('--slurp')))
  assert.ok(state.calls.some((args) => args[1] === 'repos/owner/repo/releases/123'))
  assert.equal(state.calls.filter((args) => args.includes('DELETE')).length, 1)
  assert.equal(state.calls.filter((args) => args[0] === 'upload').length, 2)
})

test('recovers from a create conflict with bounded reads and no second create', async () => {
  const state = scenario({ conflict: true, hiddenReads: 2 })
  assert.equal((await state.run()).draft, false)
  assert.deepEqual(state.waits, [1000, 2000])
  assert.equal(state.calls.filter((args) => args.includes('POST')).length, 1)
})

test('preserves the create error if the draft remains invisible', async () => {
  const state = scenario({ conflict: true, hiddenReads: Infinity })
  await assert.rejects(state.run, (error) => error === state.createConflict)
  assert.deepEqual(state.waits, [1000, 2000, 4000])
  assert.equal(state.calls.filter((args) => args.includes('POST')).length, 1)
  assert.ok(!state.calls.some((args) => args[0] === 'upload'))
})

test('does not create a release for a missing tag', async () => {
  const state = scenario({ missingTag: true })
  await assert.rejects(state.run, /Not Found/)
  assert.ok(!state.calls.some((args) => args.includes('POST')))
})

test('does not fall back to listing on authentication or other API errors', async () => {
  const calls = []
  const error = Object.assign(new Error('Forbidden'), { stderr: 'HTTP 403' })
  await assert.rejects(
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
