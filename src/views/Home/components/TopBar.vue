<template>
  <v-sheet class="w-full h-[52px] flex items-center justify-between bg-transparent" elevation="0">
    <div
      class="flex items-center gap-1.5 bg-surface backdrop-blur-md border border-slate-200/60 dark:border-slate-700/60 rounded-full px-2 py-1.5"
    >
      <div
        class="flex items-center gap-1.5 px-3 py-1.5 rounded-full cursor-pointer transition-colors hover:bg-slate-100 dark:hover:bg-slate-800"
        :title="t('topBar.poweredByHint')"
        @click="openExternal('https://yils.blog/')"
        v-ripple
      >
        <v-icon size="small" color="primary">mdi-code-tags</v-icon>
        <span class="text-sm font-semibold text-slate-600 dark:text-slate-300"
          >Powered by YILS</span
        >
      </div>

      <div class="w-px h-5 bg-slate-200 dark:bg-slate-700 mx-1"></div>

      <div
        class="flex items-center gap-1 px-3 py-1.5 rounded-full cursor-pointer transition-colors hover:bg-slate-100 dark:hover:bg-slate-800"
        @click="openExternal('https://short-video-factory.yils.blog/')"
        v-ripple
      >
        <v-icon size="small" color="grey-darken-1">mdi-book-open-variant-outline</v-icon>
        <span class="text-sm text-slate-500 dark:text-slate-400">{{
          t('topBar.documentation')
        }}</span>
      </div>

      <div class="w-px h-5 bg-slate-200 dark:bg-slate-700 mx-1"></div>

      <div
        class="flex items-center gap-1 px-3 py-1.5 rounded-full cursor-pointer transition-colors hover:bg-slate-100 dark:hover:bg-slate-800"
        @click="handleExportDiagnostics"
        v-ripple
      >
        <v-icon size="small" color="grey-darken-1">mdi-file-export-outline</v-icon>
        <span class="text-sm text-slate-500 dark:text-slate-400">{{
          t('topBar.exportDiagnostics')
        }}</span>
      </div>
    </div>

    <div class="topbar-connector" aria-hidden="true"></div>

    <div
      class="flex items-center gap-1.5 bg-surface backdrop-blur-md border border-slate-200/60 dark:border-slate-700/60 rounded-full px-2 py-1.5"
    >
      <div class="flex items-center gap-1.5 px-3 py-1.5">
        <v-icon size="small" color="grey-darken-1">mdi-information-outline</v-icon>
        <span class="text-sm font-medium text-slate-500 dark:text-slate-400">v{{ version }}</span>
      </div>

      <div class="w-px h-5 bg-slate-200 dark:bg-slate-700 mx-1"></div>

      <div
        class="flex items-center gap-1 px-3 py-1.5 rounded-full cursor-pointer transition-colors hover:bg-slate-100 dark:hover:bg-slate-800"
        @click="copyVersion"
        v-ripple
      >
        <v-icon size="small" color="grey-darken-1">mdi-content-copy</v-icon>
        <span class="text-sm text-slate-500 dark:text-slate-400">{{ t('version.copy') }}</span>
      </div>

      <div
        class="flex items-center gap-1 px-3 py-1.5 rounded-full cursor-pointer transition-colors hover:bg-slate-100 dark:hover:bg-slate-800"
        @click="handleCheckUpdate"
        v-ripple
      >
        <v-icon size="small" color="grey-darken-1">mdi-update</v-icon>
        <span class="text-sm text-slate-500 dark:text-slate-400">{{
          t('version.checkUpdate')
        }}</span>
      </div>
    </div>

    <UpdateDialog v-if="updateInfo" v-model="showUpdateDialog" :update-info="updateInfo" />

    <v-dialog :model-value="!!diagnosticsExportPhase" persistent width="360">
      <v-card class="diagnostics-progress-card px-6 py-5">
        <div class="text-center text-body-1 font-weight-medium">
          {{
            diagnosticsExportPhase === 'archiving'
              ? t('topBar.diagnosticsArchiving')
              : t('topBar.diagnosticsCollecting')
          }}
        </div>
        <v-progress-linear indeterminate color="primary" height="4" rounded class="mt-5" />
      </v-card>
    </v-dialog>
  </v-sheet>
</template>

<script lang="ts" setup>
import { onMounted, onUnmounted, ref } from 'vue'
import { useTranslation } from 'i18next-vue'
import { useToast } from 'vue-toastification'
import UpdateDialog from '@/components/UpdateDialog.vue'
import type { UpdateInfo } from '~/electron/updater'

const version = __APP_VERSION__
const { t } = useTranslation()
const toast = useToast()
const showUpdateDialog = ref(false)
const updateInfo = ref<UpdateInfo | null>(null)
const diagnosticsExporting = ref(false)
const diagnosticsExportPhase = ref<'collecting' | 'archiving' | null>(null)

const openExternal = (url: string) => {
  window.electron.openExternal({ url })
}

const copyVersion = async () => {
  try {
    await navigator.clipboard.writeText(`v${version}`)
    toast.success(t('common.messages.success.copySuccess'))
  } catch (error) {
    console.error('Failed to copy version:', error)
    toast.error(t('common.messages.error.copyFailed'))
  }
}

const handleCheckUpdate = async () => {
  toast.info(t('update.checking'))
  const result = await window.electron.checkForUpdates()
  if (result.status === 'up-to-date') {
    toast.success(t('update.upToDate'))
  } else if (result.status === 'error') {
    toast.error(t('update.updateError'))
  }
}

const handleExportDiagnostics = async () => {
  if (diagnosticsExporting.value) return

  diagnosticsExporting.value = true
  try {
    const exportedPath = await window.electron.exportDiagnostics()
    if (exportedPath) {
      toast.success(t('topBar.diagnosticsExported'))
    }
  } catch (error) {
    console.error('Failed to export diagnostics:', error)
    toast.error(t('topBar.diagnosticsExportFailed'))
  } finally {
    diagnosticsExporting.value = false
    diagnosticsExportPhase.value = null
  }
}

const handleUpdateAvailable = (_event: unknown, info: UpdateInfo) => {
  updateInfo.value = info
  showUpdateDialog.value = true
}

const handleDiagnosticsExportProgress = (_event: unknown, phase: 'collecting' | 'archiving') => {
  diagnosticsExportPhase.value = phase
}

onMounted(() => {
  window.ipcRenderer.on('update-available', handleUpdateAvailable)
  window.ipcRenderer.on('diagnostics-export-progress', handleDiagnosticsExportProgress)
})

onUnmounted(() => {
  window.ipcRenderer.off('update-available', handleUpdateAvailable)
  window.ipcRenderer.off('diagnostics-export-progress', handleDiagnosticsExportProgress)
})
</script>

<style scoped lang="scss">
.topbar-connector {
  flex: 1;
  height: 2px;
  min-width: 64px;
  margin: 0 20px;
  border-radius: 9999px;
  background: linear-gradient(
    90deg,
    rgba(203, 213, 225, 0.2),
    rgba(203, 213, 225, 0.8) 16%,
    rgba(203, 213, 225, 0.8) 84%,
    rgba(203, 213, 225, 0.2)
  );
}

:global(.v-theme--dark) .topbar-connector {
  background: linear-gradient(
    90deg,
    rgba(71, 85, 105, 0.2),
    rgba(71, 85, 105, 0.8) 16%,
    rgba(71, 85, 105, 0.8) 84%,
    rgba(71, 85, 105, 0.2)
  );
}

.diagnostics-progress-card {
  min-width: 360px;
}

@media (max-width: 1180px) {
  .topbar-connector {
    display: none;
  }
}
</style>
