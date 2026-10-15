<template>
  <v-sheet class="p-3" border rounded>
    <div class="flex flex-wrap items-center gap-2">
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
      <div class="inline-flex items-center">
        <v-chip
          :color="appStore.autoBatch ? 'primary' : 'grey'"
          :aria-pressed="appStore.autoBatch"
          :disabled="taskInProgress"
          variant="tonal"
          @click="toggleBatch"
        >
          <v-icon start size="small">{{
            appStore.autoBatch ? 'mdi-autorenew' : 'mdi-autorenew-off'
          }}</v-icon>
          <span class="subtitle-chip-text">{{
            appStore.autoBatch
              ? t('features.render.batch.enabled', { count: appStore.batchConfig.count })
              : t('features.render.batch.label')
          }}</span>
        </v-chip>
        <v-menu
          v-model="batchSettingsOpen"
          :close-on-content-click="false"
          location="bottom end"
          max-width="320"
        >
          <template #activator="{ props }">
            <v-btn
              v-bind="props"
              icon="mdi-chevron-down"
              variant="text"
              size="x-small"
              :disabled="taskInProgress"
              :aria-label="t('features.render.batch.settings')"
            />
          </template>
          <v-card :title="t('features.render.batch.settings')" class="p-3" min-width="280">
            <v-text-field
              v-model.number="appStore.batchConfig.count"
              :disabled="taskInProgress"
              type="number"
              min="1"
              max="999"
              step="1"
              density="compact"
              :label="t('features.render.batch.count')"
              :rules="[
                (value) =>
                  (Number.isInteger(Number(value)) && Number(value) >= 1 && Number(value) <= 999) ||
                  t('features.render.batch.invalidCount'),
              ]"
            />
            <v-select
              v-model="appStore.batchConfig.onError"
              :disabled="taskInProgress"
              :items="errorOptions"
              density="compact"
              :label="t('features.render.batch.onError')"
              hide-details
            />
            <div class="text-xs text-medium-emphasis mt-3">
              {{ t('features.render.batch.hint') }}
            </div>
          </v-card>
        </v-menu>
      </div>
    </div>
    <div v-if="appStore.batchProgress" class="mt-3 text-xs text-medium-emphasis" aria-live="polite">
      <template v-if="appStore.batchProgress.running">
        <div>
          {{
            t('features.render.batch.progress', {
              current: appStore.batchProgress.current,
              total: appStore.batchProgress.total,
              remaining: Math.max(0, appStore.batchProgress.total - appStore.batchProgress.current),
            })
          }}
        </div>
        <v-progress-linear
          class="my-2"
          color="primary"
          rounded
          height="4"
          :model-value="batchPercent"
        />
      </template>
      <div v-else class="mb-1">
        {{ t(`features.render.batch.reasons.${appStore.batchProgress.stopReason}`) }}
      </div>
      <div>
        {{
          t('features.render.batch.summary', {
            success: appStore.batchProgress.completedCount,
            failed: appStore.batchProgress.failedCount,
            warnings: appStore.batchProgress.warningCount,
          })
        }}
      </div>
    </div>
  </v-sheet>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useTranslation } from 'i18next-vue'
import { RenderStatus, useAppStore } from '@/store'

const appStore = useAppStore()
const { t } = useTranslation()
const batchSettingsOpen = ref(false)
const taskInProgress = computed(
  () =>
    appStore.batchProgress?.running ||
    ![RenderStatus.None, RenderStatus.Completed, RenderStatus.Failed].includes(
      appStore.renderStatus,
    ),
)
const errorOptions = computed(() => [
  { title: t('features.render.batch.stopOnError'), value: 'stop' },
  { title: t('features.render.batch.continueOnError'), value: 'continue' },
])
watch(taskInProgress, (busy) => {
  if (busy) batchSettingsOpen.value = false
})
const batchPercent = computed(() => {
  const batch = appStore.batchProgress
  return batch
    ? ((batch.completedCount + batch.failedCount + batch.cancelledCount) / batch.total) * 100
    : 0
})
const toggleBatch = () => {
  if (!taskInProgress.value) appStore.autoBatch = !appStore.autoBatch
}
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
