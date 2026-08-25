<template>
  <v-dialog v-model="dialogVisible" max-width="560">
    <v-card class="update-dialog-card">
      <v-card-title class="text-h6 font-weight-bold d-flex align-center ga-2">
        <v-icon color="primary">mdi-update</v-icon>
        {{ t('update.title') }}
      </v-card-title>

      <v-card-text class="pb-2">
        <div class="d-flex flex-column ga-2 mb-4">
          <div class="d-flex align-center justify-space-between">
            <span class="text-body-2 text-medium-emphasis">{{ t('update.currentVersion') }}</span>
            <v-chip size="small" variant="tonal" color="grey">v{{ currentVersion }}</v-chip>
          </div>
          <div class="d-flex align-center justify-space-between">
            <span class="text-body-2 text-medium-emphasis">{{ t('update.latestVersion') }}</span>
            <v-chip size="small" variant="tonal" color="primary">v{{ updateInfo.version }}</v-chip>
          </div>
          <div v-if="updateInfo.releaseDate" class="d-flex align-center justify-space-between">
            <span class="text-body-2 text-medium-emphasis">{{ t('update.releaseDate') }}</span>
            <span class="text-body-2">{{ formatDate(updateInfo.releaseDate) }}</span>
          </div>
        </div>

        <div v-if="releaseNotes" class="mb-2">
          <div class="text-body-2 text-medium-emphasis mb-2">{{ t('update.releaseNotes') }}</div>
          <div class="release-notes pa-4 rounded text-body-2" v-html="renderedReleaseNotes"></div>
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
import MarkdownIt from 'markdown-it'
import { useTranslation } from 'i18next-vue'
import type { UpdateInfo } from '~/electron/updater'
import { useAppStore } from '@/store'

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
const md = new MarkdownIt({ html: false, linkify: true, breaks: true })

const dialogVisible = computed({
  get: () => props.modelValue,
  set: (value: boolean) => emit('update:modelValue', value),
})

const releaseNotes = computed(() => {
  const notes = props.updateInfo.releaseNotes
  const locale = appStore.locale
  return notes[locale] ?? notes[locale.split('-')[0]] ?? notes.en ?? Object.values(notes)[0] ?? ''
})

const renderedReleaseNotes = computed(() => md.render(releaseNotes.value))

const formatDate = (dateString: string) => {
  const date = new Date(dateString)
  return Number.isNaN(date.getTime()) ? dateString : date.toLocaleDateString()
}

const openWebsite = () => {
  window.electron.openExternal({ url: 'https://short-video-factory.yils.blog/' })
}
</script>

<style scoped lang="scss">
.release-notes {
  max-height: 280px;
  overflow-y: auto;
  background: rgba(var(--v-theme-on-surface), 0.04);
  line-height: 1.65;

  :deep(p) {
    margin: 0 0 12px;
  }

  :deep(p:last-child) {
    margin-bottom: 0;
  }

  :deep(h1),
  :deep(h2),
  :deep(h3),
  :deep(h4),
  :deep(h5),
  :deep(h6) {
    margin: 0 0 12px;
    line-height: 1.35;
  }

  :deep(ul),
  :deep(ol) {
    margin: 0 0 12px;
    padding-inline-start: 20px;
  }

  :deep(li + li) {
    margin-top: 8px;
  }

  :deep(:last-child) {
    margin-bottom: 0;
  }
}
</style>
