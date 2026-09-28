const { app, BrowserWindow, ipcMain } = require('electron')
const { createServer } = require('node:http')
const path = require('node:path')

const appDirectory = __dirname
const sockets = new Set()
const server = createServer()
let windowInstance
let finished = false
let timeoutId

app.setName('short-video-factory-llm-test')
app.setPath('userData', path.join(appDirectory, '.user-data'))
app.disableHardwareAcceleration()

server.on('connection', (socket) => {
  sockets.add(socket)
  socket.on('close', () => sockets.delete(socket))
})

const corsHeaders = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'POST, OPTIONS',
  'access-control-allow-headers':
    'authorization, content-type, anthropic-version, x-api-key, x-requested-with',
  'access-control-max-age': '600',
}

const writeSse = (response, events) => {
  response.writeHead(200, {
    ...corsHeaders,
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

const chatEvents = [
  {
    data: {
      id: 'chatcmpl-electron',
      object: 'chat.completion.chunk',
      choices: [{ index: 0, delta: { content: 'Hello from Electron' }, finish_reason: null }],
    },
  },
  {
    data: {
      id: 'chatcmpl-electron',
      object: 'chat.completion.chunk',
      choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
    },
  },
  { data: '[DONE]' },
]

const responsesEvents = [
  {
    event: 'response.created',
    data: {
      type: 'response.created',
      response: { id: 'resp-electron', created_at: 0, model: 'electron-test-model' },
    },
  },
  {
    event: 'response.output_item.added',
    data: {
      type: 'response.output_item.added',
      output_index: 0,
      item: { type: 'message', id: 'msg-electron', phase: 'final_answer' },
    },
  },
  {
    event: 'response.output_text.delta',
    data: {
      type: 'response.output_text.delta',
      item_id: 'msg-electron',
      output_index: 0,
      delta: 'Hello from Electron',
    },
  },
  {
    event: 'response.output_item.done',
    data: {
      type: 'response.output_item.done',
      output_index: 0,
      item: {
        type: 'message',
        id: 'msg-electron',
        status: 'completed',
        role: 'assistant',
        content: [{ type: 'output_text', text: 'Hello from Electron', annotations: [] }],
      },
    },
  },
  {
    event: 'response.completed',
    data: {
      type: 'response.completed',
      response: {
        usage: { input_tokens: 1, output_tokens: 3, total_tokens: 4 },
      },
    },
  },
]

const anthropicEvents = [
  {
    event: 'message_start',
    data: {
      type: 'message_start',
      message: {
        id: 'msg-electron',
        type: 'message',
        role: 'assistant',
        content: [],
        model: 'electron-test-model',
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
      delta: { type: 'text_delta', text: 'Hello from Electron' },
    },
  },
  { event: 'content_block_stop', data: { type: 'content_block_stop', index: 0 } },
  {
    event: 'message_delta',
    data: {
      type: 'message_delta',
      delta: { stop_reason: 'end_turn', stop_sequence: null },
      usage: { output_tokens: 3 },
    },
  },
  { event: 'message_stop', data: { type: 'message_stop' } },
]

server.on('request', (request, response) => {
  const requestUrl = new URL(request.url || '/', 'http://127.0.0.1')
  if (request.method === 'OPTIONS') {
    response.writeHead(204, corsHeaders)
    response.end()
    return
  }

  const requestChunks = []
  request.on('data', (chunk) => requestChunks.push(chunk))
  request.on('end', () => {
    if (requestUrl.pathname.includes('/cancel/')) {
      response.writeHead(200, {
        ...corsHeaders,
        'content-type': 'text/event-stream; charset=utf-8',
        connection: 'keep-alive',
      })
      response.write(
        `data: ${JSON.stringify({
          id: 'chatcmpl-cancel',
          object: 'chat.completion.chunk',
          choices: [{ index: 0, delta: { content: 'partial' }, finish_reason: null }],
        })}\n\n`,
      )
      return
    }

    if (requestUrl.pathname.includes('/timeout/')) {
      response.writeHead(200, {
        ...corsHeaders,
        'content-type': 'text/event-stream; charset=utf-8',
        connection: 'keep-alive',
      })
      return
    }

    if (requestUrl.pathname.endsWith('/responses')) {
      writeSse(response, responsesEvents)
      return
    }
    if (requestUrl.pathname.endsWith('/messages')) {
      writeSse(response, anthropicEvents)
      return
    }
    writeSse(response, chatEvents)
  })
})

const closeServer = () => {
  for (const socket of sockets) socket.destroy()
  if (server.listening) server.close()
}

const finish = (ok, message) => {
  if (finished) return
  finished = true
  clearTimeout(timeoutId)
  if (ok) console.log(`Electron ${process.versions.electron} renderer checks passed: ${message}`)
  else console.error(`Electron renderer checks failed: ${message}`)
  closeServer()
  if (windowInstance && !windowInstance.isDestroyed()) windowInstance.destroy()
  app.exit(ok ? 0 : 1)
}

ipcMain.on('llm-harness-result', (event, result) => {
  if (!windowInstance || event.sender !== windowInstance.webContents) return
  finish(Boolean(result?.ok), JSON.stringify(result?.details ?? result?.error ?? 'No details'))
})

app.whenReady().then(() => {
  timeoutId = setTimeout(() => finish(false, 'Timed out waiting for renderer results'), 45000)
  server.listen(0, '127.0.0.1', async () => {
    const address = server.address()
    if (!address || typeof address === 'string') {
      finish(false, 'Could not start the local mock server')
      return
    }

    windowInstance = new BrowserWindow({
      show: false,
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        preload: path.join(appDirectory, 'preload.cjs'),
        sandbox: false,
      },
    })
    windowInstance.webContents.on('console-message', (_event, level, message) => {
      if (level >= 2) console.error(`Renderer console: ${message}`)
    })
    windowInstance.webContents.on('did-fail-load', (_event, code, description) => {
      finish(false, `Renderer failed to load (${code}): ${description}`)
    })
    await windowInstance.loadFile(path.join(appDirectory, 'index.html'), {
      query: { baseUrl: `http://127.0.0.1:${address.port}/v1` },
    })
  })
})

app.on('window-all-closed', () => {
  if (!finished) finish(false, 'Renderer window closed before reporting results')
})
