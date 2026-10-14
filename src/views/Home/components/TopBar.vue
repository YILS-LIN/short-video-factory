<template>
  <v-sheet class="topbar-shell w-full bg-transparent" elevation="0">
    <div
      class="topbar-group topbar-group--left flex items-center gap-1.5 bg-surface backdrop-blur-md border border-slate-200/60 dark:border-slate-700/60 rounded-full px-2 py-1.5"
    >
      <div
        class="flex items-center gap-1.5 px-3 py-1.5 rounded-full cursor-pointer transition-colors hover:bg-slate-100 dark:hover:bg-slate-800"
        :title="t('topBar.poweredByHint', { name: authorName })"
        @click="openExternal(authorHomepage)"
        v-ripple
      >
        <v-icon size="small" color="grey-darken-1">mdi-code-tags</v-icon>
        <span class="topbar-label text-sm text-slate-500 dark:text-slate-300">{{
          t('topBar.poweredBy', { name: authorName })
        }}</span>
      </div>

      <div class="w-px h-5 bg-slate-200 dark:bg-slate-700 mx-1"></div>

      <div
        class="flex items-center gap-1 px-3 py-1.5 rounded-full cursor-pointer transition-colors hover:bg-slate-100 dark:hover:bg-slate-800"
        @click="openExternal(documentationUrl)"
        v-ripple
      >
        <v-icon size="small" color="grey-darken-1">mdi-book-open-variant-outline</v-icon>
        <span class="topbar-label text-sm text-slate-500 dark:text-slate-400">{{
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
        <span class="topbar-label text-sm text-slate-500 dark:text-slate-400">{{
          t('topBar.exportDiagnostics')
        }}</span>
      </div>
    </div>

    <AnnouncementPill
      v-if="matchedNotices.length"
      :notices="matchedNotices"
      @open="openAnnouncements"
    />
    <div v-else class="topbar-connector" aria-hidden="true"></div>

    <div
      class="topbar-group topbar-group--right flex items-center gap-1.5 bg-surface backdrop-blur-md border border-slate-200/60 dark:border-slate-700/60 rounded-full px-2 py-1.5"
    >
      <div class="flex items-center gap-1.5 px-3 py-1.5">
        <v-icon size="small" color="grey-darken-1">mdi-information-outline</v-icon>
        <span class="topbar-version text-sm font-medium text-slate-500 dark:text-slate-400"
          >v{{ version }}</span
        >
      </div>

      <div class="w-px h-5 bg-slate-200 dark:bg-slate-700 mx-1"></div>

      <div
        class="flex items-center gap-1 px-3 py-1.5 rounded-full cursor-pointer transition-colors hover:bg-slate-100 dark:hover:bg-slate-800"
        @click="copyVersion"
        v-ripple
      >
        <v-icon size="small" color="grey-darken-1">mdi-content-copy</v-icon>
        <span class="topbar-label text-sm text-slate-500 dark:text-slate-400">{{
          t('version.copy')
        }}</span>
      </div>

      <button
        type="button"
        class="topbar-action flex items-center gap-1 px-3 py-1.5 rounded-full transition-colors hover:bg-slate-100 dark:hover:bg-slate-800"
        :disabled="updateChecking"
        :aria-busy="updateChecking"
        :aria-label="updateInfo ? t('version.updateAvailable') : t('version.checkUpdate')"
        :title="updateInfo ? t('version.updateAvailable') : t('version.checkUpdate')"
        @click="handleCheckUpdate"
        v-ripple
      >
        <span class="topbar-update-icon">
          <v-icon size="small" color="grey-darken-1" :class="{ 'mdi-spin': updateChecking }"
            >mdi-update</v-icon
          >
          <span v-if="updateInfo" class="topbar-update-dot" aria-hidden="true"></span>
        </span>
        <span class="topbar-label text-sm text-slate-500 dark:text-slate-400">{{
          t('version.checkUpdate')
        }}</span>
      </button>
    </div>

    <UpdateDialog v-if="updateInfo" v-model="showUpdateDialog" :update-info="updateInfo" />
    <AnnouncementDialog
      v-model="showAnnouncementDialog"
      v-model:selected-notice-key="selectedNoticeKey"
      :notices="matchedNotices"
    />

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
import { computed, h, onMounted, onUnmounted, ref, watch } from 'vue'
import { useTranslation } from 'i18next-vue'
import { useToast } from 'vue-toastification'
import ActionToastEmbed from '@/components/ActionToastEmbed.vue'
import UpdateDialog from '@/components/UpdateDialog.vue'
import AnnouncementDialog from '@/components/AnnouncementDialog.vue'
import AnnouncementPill from './AnnouncementPill.vue'
import { copyErrorToClipboard } from '@/lib/error-copy'
import { trackAnalytics } from '@/lib/analytics'
import { useAppStore, useMetadataStore } from '@/store'
import { getNextNoticeBoundary } from '@/lib/notices'
import type { UpdateInfo } from '~/electron/updater'

const version = __APP_VERSION__
const { i18next, t } = useTranslation()
const toast = useToast()
const appStore = useAppStore()
const metadataStore = useMetadataStore()
const showUpdateDialog = ref(false)
const updateInfo = ref<UpdateInfo | null>(null)
const updateChecking = ref(false)
const showAnnouncementDialog = ref(false)
const selectedNoticeKey = ref<string | null>(null)
const now = ref(Date.now())
const diagnosticsExporting = ref(false)
const diagnosticsExportPhase = ref<'collecting' | 'archiving' | null>(null)
let stopMetadataUpdates: (() => void) | null = null
let noticeBoundaryTimer: number | undefined

const locale = computed(
  () => appStore.locale || i18next.resolvedLanguage || i18next.language || 'zh-CN',
)
const matchedNotices = computed(() => metadataStore.getMatchedNotices(locale.value, now.value))
const authorName = computed(() => metadataStore.payload?.author.displayName || 'YILS')
const authorHomepage = computed(
  () => metadataStore.payload?.author.homepage || 'https://yils.blog/',
)
const documentationUrl = computed(
  () => metadataStore.payload?.app.docs || 'https://short-video-factory.yils.blog/',
)

const scheduleNoticeBoundary = () => {
  if (noticeBoundaryTimer !== undefined) window.clearTimeout(noticeBoundaryTimer)
  const notices = metadataStore.payload?.notices ?? []
  const boundary = getNextNoticeBoundary(notices, Date.now())
  if (boundary === null) return
  noticeBoundaryTimer = window.setTimeout(
    () => {
      now.value = Date.now()
      scheduleNoticeBoundary()
    },
    Math.min(Math.max(0, boundary - Date.now() + 10), 2_147_000_000),
  )
}

const refreshLocalNoticeTime = () => {
  now.value = Date.now()
  scheduleNoticeBoundary()
}

watch(() => metadataStore.payload?.notices, scheduleNoticeBoundary)

const openAnnouncements = (key: string) => {
  if (!matchedNotices.value.some((entry) => `${entry.notice.id}:${entry.notice.revision}` === key))
    return
  selectedNoticeKey.value = key
  showAnnouncementDialog.value = true
}

const openExternal = (url: string) => {
  void window.electron.openExternal({ url }).catch((error) => {
    console.error('Failed to open external link:', error)
  })
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

const showUpdateError = (detail: string) => {
  const errorDetail = detail || t('update.unknownError')
  toast.error({
    component: {
      render: () =>
        h(ActionToastEmbed, {
          message: t('update.updateError'),
          detail: errorDetail,
          actionText: t('common.buttons.copyErrorDetail'),
          onActionTirgger: async () => {
            try {
              await copyErrorToClipboard(t('update.updateError'), errorDetail)
              toast.success(t('common.messages.success.copySuccess'))
            } catch (error) {
              console.error('Failed to copy update error details:', error)
              toast.error(t('common.messages.error.copyFailed'))
            }
          },
        }),
    },
  })
}

const handleCheckUpdate = async () => {
  if (updateChecking.value) return
  updateChecking.value = true
  const startedAt = performance.now()
  toast.info(t('update.checking'))
  try {
    const result = await window.electron.checkForUpdates()
    trackAnalytics('update_check_finished', {
      outcome: result.status === 'error' ? 'failed' : 'success',
      has_update: result.status === 'available',
      trigger: 'manual',
      duration_ms: Math.max(0, Math.floor(performance.now() - startedAt)),
    })
    if (result.status === 'up-to-date') {
      updateInfo.value = null
      toast.success(t('update.upToDate'))
    } else if (result.status === 'no-release') {
      updateInfo.value = null
      toast.info(t('update.noRelease'))
    } else if (result.status === 'available') {
      updateInfo.value = result.info
      showUpdateDialog.value = true
    } else if (result.status === 'error') {
      showUpdateError(result.message)
    }
  } catch (error) {
    trackAnalytics('update_check_finished', {
      outcome: 'failed',
      has_update: false,
      trigger: 'manual',
      duration_ms: Math.max(0, Math.floor(performance.now() - startedAt)),
    })
    const reason = error instanceof Error ? error.message : String(error)
    console.error('Failed to check for updates:', error)
    showUpdateError(reason)
  } finally {
    updateChecking.value = false
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

const applyMetadataState = (state: Parameters<typeof metadataStore.applyState>[0]) => {
  metadataStore.applyState(state)
  scheduleNoticeBoundary()
}

const handleDiagnosticsExportProgress = (_event: unknown, phase: 'collecting' | 'archiving') => {
  diagnosticsExportPhase.value = phase
}

onMounted(() => {
  window.addEventListener('focus', refreshLocalNoticeTime)
  document.addEventListener('visibilitychange', refreshLocalNoticeTime)
  window.ipcRenderer.on('update-available', handleUpdateAvailable)
  window.ipcRenderer.on('diagnostics-export-progress', handleDiagnosticsExportProgress)
  stopMetadataUpdates = window.electron.onMetadataStateChanged(applyMetadataState)
  void window.electron
    .getMetadataState()
    .then(applyMetadataState)
    .catch((error) => console.warn('Failed to read local metadata state:', error))
})

onUnmounted(() => {
  window.removeEventListener('focus', refreshLocalNoticeTime)
  document.removeEventListener('visibilitychange', refreshLocalNoticeTime)
  window.ipcRenderer.off('update-available', handleUpdateAvailable)
  window.ipcRenderer.off('diagnostics-export-progress', handleDiagnosticsExportProgress)
  stopMetadataUpdates?.()
  if (noticeBoundaryTimer !== undefined) window.clearTimeout(noticeBoundaryTimer)
})
</script>

<style scoped lang="scss">
.topbar-shell {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  min-height: 52px;
  flex-wrap: wrap;
}

.topbar-group {
  flex: 0 1 auto;
  min-width: 0;
}

.topbar-action {
  border: 0;
  background: transparent;
  color: inherit;
  cursor: pointer;
  font: inherit;

  &:disabled {
    cursor: default;
    opacity: 0.65;
  }
}

.topbar-update-icon {
  position: relative;
  display: inline-flex;
}
.topbar-update-dot {
  position: absolute;
  top: -2px;
  right: -3px;
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #ef4444;
  box-shadow: 0 0 0 2px rgb(var(--v-theme-surface));
  pointer-events: none;
}

.topbar-connector {
  flex: 1 1 64px;
  min-width: 64px;
  height: 2px;
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

  .topbar-shell {
    gap: 6px 10px;
  }

  .topbar-group {
    gap: 2px;
    padding-inline: 4px;
  }
}

@media (max-width: 900px) {
  .topbar-label {
    display: none;
  }

  :deep(.announcement-pill) {
    order: 3;
    flex: 1 0 100%;
    max-width: 100%;
    margin-inline: auto;
  }
}
</style>
