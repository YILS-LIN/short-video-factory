<template>
  <v-dialog v-model="dialogVisible" max-width="560">
    <v-card class="update-dialog-card">
      <v-card-title class="text-h6 font-weight-bold d-flex align-center ga-2">
        <v-icon color="primary">mdi-update</v-icon>
        {{ updateInfo.version ? t('update.title') : t('update.minimumVersionRequired') }}
      </v-card-title>

      <v-card-text class="pb-2">
        <div class="d-flex flex-column ga-2 mb-4">
          <div class="d-flex align-center justify-space-between">
            <span class="text-body-2 text-medium-emphasis">{{ t('update.currentVersion') }}</span>
            <v-chip size="small" variant="tonal" color="grey">v{{ currentVersion }}</v-chip>
          </div>
          <div
            v-if="updateInfo.version || updateInfo.minimumVersion"
            class="d-flex align-center justify-space-between"
          >
            <span class="text-body-2 text-medium-emphasis">
              {{
                updateInfo.version ? t('update.latestVersion') : t('update.minimumSupportedVersion')
              }}
            </span>
            <v-chip size="small" variant="tonal" color="primary">
              v{{ updateInfo.version || updateInfo.minimumVersion }}
            </v-chip>
          </div>
          <div v-if="updateInfo.releaseDate" class="d-flex align-center justify-space-between">
            <span class="text-body-2 text-medium-emphasis">{{ t('update.releaseDate') }}</span>
            <span class="text-body-2">{{ formatDate(updateInfo.releaseDate) }}</span>
          </div>
        </div>

        <v-alert v-if="updateInfo.mandatory" type="warning" variant="tonal" class="mb-4">
          {{ t('update.mandatory') }}
        </v-alert>
        <v-alert
          v-else-if="updateInfo.assetAvailable === false"
          type="info"
          variant="tonal"
          class="mb-4"
        >
          {{ t('update.noCompatibleAsset') }}
        </v-alert>

        <v-alert
          v-if="notesOverride"
          :type="notesOverrideAlertType"
          variant="tonal"
          class="update-notes-override mb-4"
        >
          <div class="font-weight-bold mb-2">{{ notesOverride.title }}</div>
          <SafeMarkdown :source="notesOverride.bodyMarkdown" />
        </v-alert>

        <div v-if="releaseNotes" class="mb-2">
          <div class="text-body-2 text-medium-emphasis mb-2">{{ t('update.releaseNotes') }}</div>
          <div class="release-notes pa-4 rounded text-body-2">
            <SafeMarkdown :source="releaseNotes" />
          </div>
        </div>
      </v-card-text>

      <v-divider />

      <v-card-actions class="pa-4">
        <v-spacer />
        <v-btn variant="text" color="grey" @click="dialogVisible = false">
          {{ t('update.updateLater') }}
        </v-btn>
        <v-btn variant="elevated" color="primary" @click="openWebsite">
          {{ t('update.visitWebsite') }}
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script lang="ts" setup>
import { computed } from 'vue'
import { useTranslation } from 'i18next-vue'
import type { UpdateInfo } from '~/electron/updater'
import { useAppStore } from '@/store'
import SafeMarkdown from '@/components/SafeMarkdown.vue'
import { getLocaleFallbacks } from '@/lib/notices'

const props = defineProps<{
  modelValue: boolean
  updateInfo: UpdateInfo
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
}>()

const { t } = useTranslation()
const appStore = useAppStore()
const currentVersion = __APP_VERSION__

const dialogVisible = computed({
  get: () => props.modelValue,
  set: (value: boolean) => emit('update:modelValue', value),
})

const notesOverride = computed(() => {
  const override = props.updateInfo.notesOverride
  if (!override) return null

  const locale = appStore.locale || 'zh-CN'
  let translation = null
  for (const fallbackLocale of getLocaleFallbacks(locale)) {
    if (Object.prototype.hasOwnProperty.call(override.translations, fallbackLocale)) {
      translation = override.translations[fallbackLocale]
      break
    }
  }
  translation ??= override.translations[override.defaultLocale]
  return translation ? { ...translation, mode: override.mode, severity: override.severity } : null
})

const notesOverrideAlertType = computed(() => {
  switch (notesOverride.value?.severity) {
    case 'critical':
      return 'error'
    case 'warning':
      return 'warning'
    case 'success':
      return 'success'
    default:
      return 'info'
  }
})

const releaseNotes = computed(() => {
  if (notesOverride.value?.mode === 'replace') return ''
  const notes = props.updateInfo.releaseNotes
  const locale = appStore.locale || 'zh-CN'
  for (const fallbackLocale of getLocaleFallbacks(locale)) {
    if (Object.prototype.hasOwnProperty.call(notes, fallbackLocale)) {
      return notes[fallbackLocale] ?? props.updateInfo.fallbackReleaseNotes
    }
  }
  return props.updateInfo.fallbackReleaseNotes
})

const formatDate = (dateString: string) => {
  const date = new Date(dateString)
  return Number.isNaN(date.getTime()) ? dateString : date.toLocaleDateString()
}

const openWebsite = () => {
  void window.electron.openExternal({ url: props.updateInfo.homepage }).catch((error) => {
    console.error('Failed to open update website:', error)
  })
}
</script>

<style scoped lang="scss">
.update-notes-override {
  :deep(.safe-markdown > :last-child) {
    margin-bottom: 0;
  }
}

.release-notes {
  max-height: 280px;
  overflow-y: auto;
  background: rgba(var(--v-theme-on-surface), 0.04);
}
</style>
