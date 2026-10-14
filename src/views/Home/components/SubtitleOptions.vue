<template>
  <v-sheet class="p-3" border rounded>
    <div class="flex flex-wrap items-center gap-2">
      <span class="text-xs text-medium-emphasis mr-1">{{
        t('features.render.config.subtitlePanel')
      }}</span>
      <v-chip
        :color="appStore.renderConfig.subtitlesEnabled ? 'primary' : 'grey'"
        :aria-pressed="appStore.renderConfig.subtitlesEnabled"
        :title="t('features.render.config.subtitlesHint')"
        :disabled="taskInProgress"
        variant="tonal"
        @click="toggleOption('subtitlesEnabled')"
      >
        <v-icon start size="small">
          {{ appStore.renderConfig.subtitlesEnabled ? 'mdi-check' : 'mdi-closed-caption-outline' }}
        </v-icon>
        <span class="subtitle-chip-text">{{ t('features.render.config.subtitlesEnabled') }}</span>
      </v-chip>
      <v-chip
        :color="appStore.renderConfig.exportSubtitles ? 'primary' : 'grey'"
        :aria-pressed="appStore.renderConfig.exportSubtitles"
        :title="t('features.render.config.exportSubtitlesHint')"
        :disabled="taskInProgress"
        variant="tonal"
        @click="toggleOption('exportSubtitles')"
      >
        <v-icon start size="small">
          {{ appStore.renderConfig.exportSubtitles ? 'mdi-check' : 'mdi-file-download-outline' }}
        </v-icon>
        <span class="subtitle-chip-text">{{ t('features.render.config.exportSubtitles') }}</span>
      </v-chip>
    </div>
  </v-sheet>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useTranslation } from 'i18next-vue'
import { RenderStatus, useAppStore } from '@/store'

const appStore = useAppStore()
const { t } = useTranslation()
const taskInProgress = computed(
  () =>
    ![RenderStatus.None, RenderStatus.Completed, RenderStatus.Failed].includes(
      appStore.renderStatus,
    ),
)
const toggleOption = (key: 'subtitlesEnabled' | 'exportSubtitles') => {
  if (taskInProgress.value) return
  appStore.renderConfig[key] = !appStore.renderConfig[key]
}
</script>

<style scoped lang="scss">
.subtitle-chip-text {
  white-space: nowrap;
  font-size: 13px;
  font-weight: 500;
  line-height: 1;
  letter-spacing: 0.01em;
}
</style>
