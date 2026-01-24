export function formatErrorForCopy(message: string, detail: string): string {
  const errorObj = {
    message,
    detail,
    timestamp: new Date().toISOString(),
  }

  const formattedJson = JSON.stringify(errorObj, null, 2)

  return ['```json', formattedJson, '```'].join('\n')
}

export async function copyErrorToClipboard(message: string, detail: string): Promise<void> {
  const content = formatErrorForCopy(message, detail)
  await navigator.clipboard.writeText(content)
}
