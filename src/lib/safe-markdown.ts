import MarkdownIt from 'markdown-it'

const markdown = new MarkdownIt({
  html: false,
  linkify: false,
  breaks: true,
})

markdown.disable('image')
markdown.validateLink = isSafeMarkdownLink

const defaultLinkOpen = markdown.renderer.rules.link_open
markdown.renderer.rules.link_open = (tokens, index, options, environment, renderer) => {
  const token = tokens[index]
  const href = token?.attrGet('href')
  if (!token || !href || !isSafeMarkdownLink(href)) return ''

  token.attrSet('data-external-url', new URL(href).toString())
  token.attrSet('target', '_blank')
  token.attrSet('rel', 'noopener noreferrer')
  return defaultLinkOpen
    ? defaultLinkOpen(tokens, index, options, environment, renderer)
    : renderer.renderToken(tokens, index, options)
}

export function renderSafeMarkdown(source: string): string {
  return markdown.render(source)
}

export function isSafeMarkdownLink(value: string): boolean {
  try {
    const url = new URL(value)
    return url.protocol === 'https:' && Boolean(url.hostname) && !url.username && !url.password
  } catch {
    return false
  }
}
