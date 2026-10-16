import { execFileSync } from 'node:child_process'
import { readFileSync, readdirSync, statSync, writeFileSync, mkdtempSync } from 'node:fs'
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
publishCompleteRelease({ tag, repo, installers, notesPath, gh })
console.log(`Complete stable release verified: ${tag}`)
