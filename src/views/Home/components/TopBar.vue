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

    <div class="workflow-pill" :class="`is-${workflowState}`">
      <div class="workflow-state">
        <v-icon size="small">{{ workflowStatusIcon }}</v-icon>
        <span>{{ workflowStatusText }}</span>
      </div>
      <template v-for="(step, index) in workflowSteps" :key="step.key">
        <v-icon v-if="index" size="x-small" class="workflow-arrow">mdi-chevron-right</v-icon>
        <div class="workflow-step" :class="{ active: currentWorkflowStep === step.key }">
          <v-icon size="small">{{ step.icon }}</v-icon>
          <span>{{ t(step.label) }}</span>
        </div>
      </template>
    </div>

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
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useTranslation } from 'i18next-vue'
import { useToast } from 'vue-toastification'
import UpdateDialog from '@/components/UpdateDialog.vue'
import type { UpdateInfo } from '~/electron/updater'
import { RenderStatus, useAppStore } from '@/store'

const version = __APP_VERSION__
const { t } = useTranslation()
const toast = useToast()
const appStore = useAppStore()
const showUpdateDialog = ref(false)
const updateInfo = ref<UpdateInfo | null>(null)
const diagnosticsExporting = ref(false)
const diagnosticsExportPhase = ref<'collecting' | 'archiving' | null>(null)

const workflowSteps = [
  { key: 'text', icon: 'mdi-text-box-outline', label: 'topBar.workflow.text' },
  { key: 'voice', icon: 'mdi-microphone-outline', label: 'topBar.workflow.voice' },
  { key: 'assets', icon: 'mdi-folder-multiple-image', label: 'topBar.workflow.assets' },
  { key: 'render', icon: 'mdi-movie-open-outline', label: 'topBar.workflow.render' },
] as const

const currentWorkflowStep = computed<(typeof workflowSteps)[number]['key'] | null>(() => {
  switch (appStore.renderStatus) {
    case RenderStatus.GenerateText:
      return 'text'
    case RenderStatus.SynthesizedSpeech:
      return 'voice'
    case RenderStatus.SegmentVideo:
      return 'assets'
    case RenderStatus.Rendering:
      return 'render'
    default:
      return null
  }
})

const workflowState = computed(() => {
  if (appStore.renderStatus === RenderStatus.Completed) return 'success'
  if (appStore.renderStatus === RenderStatus.Failed) return 'error'
  return currentWorkflowStep.value ? 'active' : 'idle'
})

const workflowStatusText = computed(() => {
  switch (appStore.renderStatus) {
    case RenderStatus.GenerateText:
      return t('features.render.statusMini.generatingText')
    case RenderStatus.SynthesizedSpeech:
      return t('features.render.statusMini.synthesizingSpeech')
    case RenderStatus.SegmentVideo:
      return t('features.render.statusMini.segmentingVideo')
    case RenderStatus.Rendering:
      return t('features.render.statusMini.rendering')
    case RenderStatus.Completed:
      return t('features.render.statusMini.success')
    case RenderStatus.Failed:
      return t('features.render.statusMini.failed')
    default:
      return t('features.render.statusMini.idle')
  }
})

const workflowStatusIcon = computed(() => {
  if (workflowState.value === 'success') return 'mdi-check-circle-outline'
  if (workflowState.value === 'error') return 'mdi-alert-circle-outline'
  if (workflowState.value === 'active') return 'mdi-progress-clock'
  return 'mdi-circle-small'
})

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
.workflow-pill {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  border: 1px solid rgba(148, 163, 184, 0.35);
  border-radius: 9999px;
  background: rgba(var(--v-theme-surface), 0.72);
  color: rgb(100, 116, 139);
  font-size: 13px;
  white-space: nowrap;

  &.is-active .workflow-state {
    color: rgb(var(--v-theme-primary));
  }

  &.is-success .workflow-state {
    color: rgb(22, 163, 74);
  }

  &.is-error .workflow-state {
    color: rgb(220, 38, 38);
  }
}

.workflow-state,
.workflow-step {
  display: flex;
  align-items: center;
  gap: 4px;
}

.workflow-state {
  padding-right: 4px;
  font-weight: 700;
}

.workflow-step.active {
  color: rgb(var(--v-theme-primary));
  font-weight: 700;
}

.workflow-arrow {
  color: rgb(148, 163, 184);
}

.diagnostics-progress-card {
  min-width: 360px;
}

@media (max-width: 1180px) {
  .workflow-pill {
    display: none;
  }
}
</style>
