/**
 * 构造 multipart/form-data 请求体。
 *
 * TwelveLabs 的 /v1.3/search 接口要求所有请求均为 multipart/form-data，
 * 而仓库内置的 request 工具默认以 JSON 发送，故在此手动拼装表单体。
 * 抽成独立无依赖模块，便于在不引入 electron 的情况下做单元测试。
 */
export function buildMultipartBody(fields: Array<[string, string]>): {
  body: Buffer
  contentType: string
} {
  const boundary = `----svf-tl-${Date.now().toString(16)}`
  const parts = fields.map(
    ([name, value]) =>
      `--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`,
  )
  const body = Buffer.from(parts.join('') + `--${boundary}--\r\n`, 'utf-8')
  return { body, contentType: `multipart/form-data; boundary=${boundary}` }
}
