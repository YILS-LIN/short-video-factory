/**
 * 无网络单元测试：校验 multipart/form-data 请求体拼装。
 * 运行：node --test --experimental-strip-types electron/twelvelabs/multipart.test.ts
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildMultipartBody } from './multipart.ts'

test('buildMultipartBody 生成合法的 multipart 请求体', () => {
  const { body, contentType } = buildMultipartBody([
    ['index_id', 'idx123'],
    ['query_text', 'a person scoring a goal'],
    ['search_options', 'visual'],
  ])

  const boundaryMatch = contentType.match(/boundary=(.+)$/)
  assert.ok(boundaryMatch, 'Content-Type 应包含 boundary')
  const boundary = boundaryMatch![1]

  const text = body.toString('utf-8')
  // 每个字段都被正确编码
  assert.match(text, /name="index_id"\r\n\r\nidx123\r\n/)
  assert.match(text, /name="query_text"\r\n\r\na person scoring a goal\r\n/)
  assert.match(text, /name="search_options"\r\n\r\nvisual\r\n/)
  // 以收尾边界结束
  assert.ok(text.endsWith(`--${boundary}--\r\n`), '应以收尾 boundary 结束')
})
