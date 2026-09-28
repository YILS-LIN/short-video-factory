import { createServer, type IncomingHttpHeaders, type ServerResponse } from 'node:http'

export interface CapturedRequest {
  method: string
  url: string
  headers: IncomingHttpHeaders
  body: Record<string, unknown>
}

export type SseServerHandler = (request: CapturedRequest, response: ServerResponse) => void

export async function startSseServer(handler: SseServerHandler) {
  const requests: CapturedRequest[] = []
  const requestWaiters: Array<{
    index: number
    resolve: (request: CapturedRequest) => void
  }> = []
  const server = createServer((request, response) => {
    const chunks: Buffer[] = []
    request.on('data', (chunk: Buffer | string) => {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
    })
    request.on('end', () => {
      const text = Buffer.concat(chunks).toString('utf8')
      const captured: CapturedRequest = {
        method: request.method ?? '',
        url: request.url ?? '',
        headers: request.headers,
        body: text ? (JSON.parse(text) as Record<string, unknown>) : {},
      }
      const index = requests.push(captured) - 1
      for (let waiterIndex = requestWaiters.length - 1; waiterIndex >= 0; waiterIndex -= 1) {
        if (requestWaiters[waiterIndex].index === index) {
          requestWaiters.splice(waiterIndex, 1)[0].resolve(captured)
        }
      }
      handler(captured, response)
    })
  })

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      server.off('error', reject)
      resolve()
    })
  })
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('The test server failed to start')

  return {
    baseUrl: `http://127.0.0.1:${address.port}/v1`,
    requests,
    waitForRequest(index = 0) {
      const existing = requests[index]
      if (existing) return Promise.resolve(existing)
      return new Promise<CapturedRequest>((resolve) => requestWaiters.push({ index, resolve }))
    },
    async close() {
      server.closeAllConnections()
      if (!server.listening) return
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()))
      })
    },
  }
}

export function writeSse(
  response: ServerResponse,
  events: Array<{ event?: string; data: unknown }>,
) {
  response.writeHead(200, {
    'cache-control': 'no-cache',
    connection: 'keep-alive',
    'content-type': 'text/event-stream; charset=utf-8',
  })
  for (const { event, data } of events) {
    if (event) response.write(`event: ${event}\n`)
    response.write(`data: ${typeof data === 'string' ? data : JSON.stringify(data)}\n\n`)
  }
  response.end()
}

export function createOpenAiEvents(finishReason = 'stop') {
  return [
    {
      data: {
        id: 'chatcmpl-test',
        object: 'chat.completion.chunk',
        choices: [{ index: 0, delta: { content: '你好' }, finish_reason: null }],
      },
    },
    {
      data: {
        id: 'chatcmpl-test',
        object: 'chat.completion.chunk',
        choices: [{ index: 0, delta: {}, finish_reason: finishReason }],
      },
    },
    { data: '[DONE]' },
  ]
}

export function createResponsesEvents() {
  const message = {
    id: 'msg-test',
    type: 'message',
    status: 'completed',
    role: 'assistant',
    content: [{ type: 'output_text', text: '你好', annotations: [] }],
  }
  return [
    {
      event: 'response.created',
      data: {
        type: 'response.created',
        response: { id: 'resp-test', created_at: 0, model: 'test-model' },
      },
    },
    {
      event: 'response.output_item.added',
      data: {
        type: 'response.output_item.added',
        output_index: 0,
        item: { type: 'reasoning', id: 'reasoning-test' },
      },
    },
    {
      event: 'response.reasoning_summary_part.added',
      data: {
        type: 'response.reasoning_summary_part.added',
        item_id: 'reasoning-test',
        summary_index: 0,
      },
    },
    {
      event: 'response.reasoning_summary_text.delta',
      data: {
        type: 'response.reasoning_summary_text.delta',
        item_id: 'reasoning-test',
        summary_index: 0,
        delta: 'private reasoning',
      },
    },
    {
      event: 'response.output_item.added',
      data: {
        type: 'response.output_item.added',
        output_index: 1,
        item: { type: 'message', id: 'msg-test', phase: 'final_answer' },
      },
    },
    {
      event: 'response.output_text.delta',
      data: {
        type: 'response.output_text.delta',
        item_id: 'msg-test',
        output_index: 1,
        delta: '你好',
      },
    },
    {
      event: 'response.output_item.done',
      data: { type: 'response.output_item.done', output_index: 1, item: message },
    },
    {
      event: 'response.completed',
      data: {
        type: 'response.completed',
        response: {
          id: 'resp-test',
          object: 'response',
          status: 'completed',
          output: [message],
          usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 },
        },
      },
    },
  ]
}

export function createAnthropicEvents(stopReason = 'end_turn') {
  return [
    {
      event: 'message_start',
      data: {
        type: 'message_start',
        message: {
          id: 'msg-test',
          type: 'message',
          role: 'assistant',
          content: [],
          model: 'test-model',
          stop_reason: null,
          stop_sequence: null,
          usage: { input_tokens: 1, output_tokens: 0 },
        },
      },
    },
    {
      event: 'content_block_start',
      data: { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
    },
    {
      event: 'content_block_delta',
      data: {
        type: 'content_block_delta',
        index: 0,
        delta: { type: 'text_delta', text: '你好' },
      },
    },
    { event: 'content_block_stop', data: { type: 'content_block_stop', index: 0 } },
    {
      event: 'message_delta',
      data: {
        type: 'message_delta',
        delta: { stop_reason: stopReason, stop_sequence: null },
        usage: { output_tokens: 1 },
      },
    },
    { event: 'message_stop', data: { type: 'message_stop' } },
  ]
}
