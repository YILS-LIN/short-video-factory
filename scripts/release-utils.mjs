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

export function publishCompleteRelease({ tag, repo, installers, notesPath, gh }) {
  const api = `repos/${repo}/releases/tags/${encodeURIComponent(tag)}`
  // Tag lookup only exposes published releases. Listing also finds authenticated drafts,
  // so retries can resume the same release without creating another draft.
  const findDraft = () =>
    JSON.parse(gh('api', '--paginate', '--slurp', `repos/${repo}/releases?per_page=100`))
      .flat()
      .find((item) => item.tag_name === tag && item.draft)
  let release
  try {
    release = JSON.parse(gh('api', api))
  } catch (error) {
    if (!String(error.stderr).includes('HTTP 404')) throw error
    release = findDraft()
  }
  // Retries must never rewrite a public release.
  if (!release || release.draft) {
    if (!release) {
      gh(
        'release',
        'create',
        tag,
        '--repo',
        repo,
        '--verify-tag',
        '--draft',
        '--title',
        tag,
        '--notes-file',
        notesPath,
      )
      release = findDraft()
      if (!release) throw new Error('Created release draft could not be found')
    } else {
      gh('release', 'edit', tag, '--repo', repo, '--notes-file', notesPath)
    }
    gh(
      'release',
      'upload',
      tag,
      ...installers.map((file) => file.path),
      '--repo',
      repo,
      '--clobber',
    )
    release = JSON.parse(gh('api', `repos/${repo}/releases/${release.id}`))
    verifyAssets(release, installers)
    gh('release', 'edit', tag, '--repo', repo, '--draft=false', '--prerelease=false', '--latest')
  }
  release = JSON.parse(gh('api', `repos/${repo}/releases/${release.id}`))
  verifyAssets(release, installers)
  if (release.draft || release.prerelease || !release.published_at || release.tag_name !== tag) {
    throw new Error('Release is not fully published; documentation hook must not run')
  }
  return release
}
