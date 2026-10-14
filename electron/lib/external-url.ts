export function validateExternalHttpsUrl(value: unknown): string {
  if (typeof value !== 'string' || value.length > 2048 || value.trim() !== value) {
    throw new Error('Only valid HTTPS URLs can be opened externally.')
  }

  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw new Error('Only valid HTTPS URLs can be opened externally.')
  }

  if (url.protocol !== 'https:' || !url.hostname || url.username || url.password) {
    throw new Error('Only credential-free HTTPS URLs can be opened externally.')
  }

  return url.toString()
}
