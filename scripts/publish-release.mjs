import { execFileSync } from 'node:child_process'
import {
  createReadStream,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
  mkdtempSync,
} from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { expectedInstallers, releaseNotes, publishCompleteRelease } from './release-utils.mjs'

const tag = process.env.GITHUB_REF_NAME
const repo = process.env.GITHUB_REPOSITORY
const version = JSON.parse(readFileSync('package.json', 'utf8')).version
if (!/^\d+\.\d+\.\d+$/.test(version) || tag !== `v${version}` || !repo) {
  throw new Error(
    'Stable release tag must match package.json version and GITHUB_REPOSITORY must be set',
  )
}
const gh = (...args) =>
  execFileSync('gh', args, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] })
const files = readdirSync('release-artifacts', { recursive: true })
  .map((name) => join('release-artifacts', name))
  .filter((path) => statSync(path).isFile())
const installers = expectedInstallers(version).map((name) => {
  const matches = files.filter((path) => path.replace(/\\/g, '/').endsWith(`/${name}`))
  if (matches.length !== 1 || statSync(matches[0]).size <= 0)
    throw new Error(`Expected exactly one nonempty installer: ${name}`)
  return { name, path: matches[0], size: statSync(matches[0]).size }
})
const notes = releaseNotes(readFileSync('CHANGELOG.md', 'utf8'), tag)
const notesPath = join(mkdtempSync(join(tmpdir(), 'release-notes-')), 'notes.md')
writeFileSync(notesPath, notes)

async function upload(uploadUrl, file) {
  const url = new URL(uploadUrl.replace(/\{.*$/, ''))
  if (url.origin !== 'https://uploads.github.com' || url.username || url.password) {
    throw new Error(`Unexpected GitHub upload URL for ${file.name}`)
  }
  const token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN
  if (!token) throw new Error('GH_TOKEN or GITHUB_TOKEN is required to upload installers')
  url.searchParams.set('name', file.name)
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/octet-stream',
      'Content-Length': String(file.size),
    },
    body: createReadStream(file.path),
    duplex: 'half',
    redirect: 'error',
    signal: AbortSignal.timeout(5 * 60 * 1000),
  })
  if (!response.ok) {
    throw new Error(
      `Failed to upload ${file.name} (HTTP ${response.status}): ${await response.text()}`,
    )
  }
  await response.body?.cancel()
}

await publishCompleteRelease({ tag, repo, installers, notesPath, gh, upload })
console.log(`Complete stable release verified: ${tag}`)
