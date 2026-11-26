import { setTimeout as delay } from 'node:timers/promises'

export function expectedInstallers(version) {
  return [
    `short-video-factory-${version}-win-x64-setup.exe`,
    `short-video-factory-${version}-mac-universal-installer.dmg`,
    `short-video-factory-${version}-linux-x86_64.AppImage`,
  ]
}

export function releaseNotes(changelog, tag) {
  const blocks = changelog.replace(/\r\n/g, '\n').split(/(?=^## \[)/m)
  const notes = blocks.find((block) => block.startsWith(`## [${tag}]`))?.trim()
  if (!notes) throw new Error(`Missing CHANGELOG entry for ${tag}`)
  return notes
}

export function verifyAssets(release, installers) {
  for (const file of installers) {
    const asset = release.assets?.find((item) => item.name === file.name)
    if (!asset || asset.state !== 'uploaded' || asset.size !== file.size || asset.size <= 0) {
      throw new Error(`Release installer missing or incomplete: ${file.name}`)
    }
  }
}

const hasStatus = (error, status) => new RegExp(`\\bHTTP ${status}\\b`).test(error.stderr ?? '')

export async function publishCompleteRelease({
  tag,
  repo,
  installers,
  notesPath,
  gh,
  upload,
  wait = delay,
  log = console.log,
}) {
  const releases = `repos/${repo}/releases`
  const tagRelease = `${releases}/tags/${encodeURIComponent(tag)}`
  const request = (...args) => JSON.parse(gh('api', ...args))
  // Tag lookup can miss drafts. The list is for recovery, not for locating a newly created draft.
  const findRelease = () =>
    request('--paginate', '--slurp', `${releases}?per_page=100`)
      .flat()
      .find((item) => item.tag_name === tag)
  const retryRead = async (read, description) => {
    let value = read()
    for (const ms of [1000, 2000, 4000]) {
      if (value) break
      log(`${tag}: ${description}; retrying in ${ms} ms`)
      await wait(ms)
      value = read()
    }
    return value
  }
  let release
  try {
    release = request(tagRelease)
  } catch (error) {
    if (!hasStatus(error, 404)) throw error
    release = findRelease()
  }
  let created = false
  if (!release) {
    // Keep the old --verify-tag behavior: POST /releases can otherwise create a missing tag.
    gh('api', `repos/${repo}/git/ref/tags/${encodeURIComponent(tag)}`, '--silent')
    try {
      release = request(
        releases,
        '--method',
        'POST',
        '-f',
        `tag_name=${tag}`,
        '-f',
        `name=${tag}`,
        '-F',
        `body=@${notesPath}`,
        '-F',
        'draft=true',
      )
      created = true
    } catch (error) {
      // A conflict/validation response may mean that an existing release was not yet visible.
      // Recover by reading only; never repeat the creation request.
      if (!hasStatus(error, 409) && !hasStatus(error, 422)) throw error
      release = await retryRead(findRelease, 'existing release not visible after create conflict')
      if (!release) throw error
    }
  }
  if (
    !Number.isSafeInteger(release?.id) ||
    release.id <= 0 ||
    release.tag_name !== tag ||
    typeof release.draft !== 'boolean' ||
    (created && !release.draft)
  ) {
    throw new Error(`Unexpected release returned for ${tag}`)
  }
  const releaseId = release.id
  const releasePath = `${releases}/${releaseId}`
  const assertTarget = (current) => {
    if (
      current?.id !== releaseId ||
      current.tag_name !== tag ||
      typeof current.draft !== 'boolean'
    ) {
      throw new Error(`Unexpected release returned for ${tag} (#${releaseId})`)
    }
  }
  log(
    `${tag}: ${created ? 'created' : 'found'} ${release.draft ? 'draft' : 'release'} #${release.id}`,
  )
  // Retries must never rewrite a public release.
  if (release.draft) {
    if (!created) release = request(releasePath, '--method', 'PATCH', '-F', `body=@${notesPath}`)
    assertTarget(release)
    for (const file of release.draft ? installers : []) {
      const asset = release.assets?.find((item) => item.name === file.name)
      if (asset?.state === 'uploaded' && asset.size === file.size && asset.size > 0) continue
      if (asset) gh('api', `${releases}/assets/${asset.id}`, '--method', 'DELETE', '--silent')
      await upload(release.upload_url, file)
    }
    release = await retryRead(() => {
      try {
        return request(releasePath)
      } catch (error) {
        if (!hasStatus(error, 404)) throw error
      }
    }, `release #${release.id} not visible by ID`)
    if (!release) throw new Error(`Release not visible at ${releasePath} after upload`)
    assertTarget(release)
    verifyAssets(release, installers)
    if (release.draft) {
      release = request(
        releasePath,
        '--method',
        'PATCH',
        '-F',
        'draft=false',
        '-F',
        'prerelease=false',
        '-f',
        'make_latest=true',
      )
    }
  }
  assertTarget(release)
  verifyAssets(release, installers)
  if (release.draft || release.prerelease || !release.published_at) {
    throw new Error('Release is not fully published; documentation hook must not run')
  }
  return release
}
