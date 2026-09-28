const { spawn } = require('node:child_process')
const fs = require('node:fs/promises')
const path = require('node:path')
const { pathToFileURL } = require('node:url')

const projectRoot = path.resolve(__dirname, '../..')
const tempRoot = path.join(
  process.env.LOCALAPPDATA || path.join(process.env.USERPROFILE, 'AppData', 'Local'),
  'Temp',
  'opencode',
)

const copyHarnessFiles = async (appDirectory) => {
  for (const fileName of ['main.cjs', 'preload.cjs', 'index.html']) {
    await fs.copyFile(path.join(__dirname, fileName), path.join(appDirectory, fileName))
  }
  await fs.writeFile(
    path.join(appDirectory, 'package.json'),
    JSON.stringify({ name: 'short-video-factory-llm-test', version: '1.0.0', main: 'main.cjs' }),
  )
}

const buildRenderer = async (bundleDirectory) => {
  const { build } = await import(
    pathToFileURL(path.join(projectRoot, 'node_modules', 'vite', 'dist', 'node', 'index.js')).href
  )
  await build({
    configFile: false,
    logLevel: 'warn',
    root: projectRoot,
    build: {
      emptyOutDir: true,
      minify: false,
      outDir: bundleDirectory,
      chunkSizeWarningLimit: 4000,
      sourcemap: true,
      rollupOptions: {
        input: path.join(__dirname, 'renderer.ts'),
        output: {
          entryFileNames: 'renderer.js',
          format: 'iife',
          inlineDynamicImports: true,
        },
      },
      target: 'chrome108',
    },
  })
}

const launchElectron = (appDirectory) =>
  new Promise((resolve, reject) => {
    const electronPath = require('electron')
    const child = spawn(electronPath, [appDirectory], {
      env: { ...process.env, ELECTRON_ENABLE_LOGGING: '1' },
      stdio: 'inherit',
    })
    const timeout = setTimeout(() => {
      child.kill()
      reject(new Error('Electron test process exceeded its 60 second limit'))
    }, 60000)
    child.once('error', (error) => {
      clearTimeout(timeout)
      reject(error)
    })
    child.once('exit', (code, signal) => {
      clearTimeout(timeout)
      if (code === 0) resolve()
      else reject(new Error(`Electron exited with ${signal || code}`))
    })
  })

async function main() {
  await fs.mkdir(tempRoot, { recursive: true })
  const appDirectory = await fs.mkdtemp(path.join(tempRoot, 'short-video-factory-electron22-'))
  let succeeded = false
  try {
    await copyHarnessFiles(appDirectory)
    await buildRenderer(path.join(appDirectory, 'bundle'))
    await launchElectron(appDirectory)
    succeeded = true
  } finally {
    if (succeeded) {
      await fs.rm(appDirectory, { recursive: true, force: true })
    } else if (process.env.KEEP_ELECTRON_TEST_TEMP === '1') {
      console.error(`Electron diagnostic files retained at ${appDirectory}`)
    } else {
      await fs.rm(appDirectory, { recursive: true, force: true })
    }
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
