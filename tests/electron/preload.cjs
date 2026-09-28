const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('llmElectronHarness', {
  electronVersion: process.versions.electron,
  report: (result) => ipcRenderer.send('llm-harness-result', result),
})
