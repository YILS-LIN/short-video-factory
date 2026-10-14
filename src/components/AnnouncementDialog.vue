<template>
  <v-dialog v-model="dialogVisible" max-width="820" scrollable>
    <v-card class="announcement-dialog">
      <v-card-title class="d-flex align-center ga-2 text-h6 font-weight-bold">
        <v-icon color="primary">mdi-bullhorn-outline</v-icon>
        {{ t('announcements.title') }}
      </v-card-title>

      <v-divider />

      <v-card-text
        class="announcement-dialog__body"
        :class="{ 'announcement-dialog__body--single': notices.length <= 1 }"
      >
        <nav
          v-if="notices.length > 1"
          class="announcement-dialog__list"
          :aria-label="t('announcements.title')"
        >
          <v-list density="compact" nav>
            <v-list-item
              v-for="entry in notices"
              :key="entry.notice.id + ':' + entry.notice.revision"
              :active="noticeKey(entry) === selectedNoticeKey"
              rounded="lg"
              @click="selectNotice(entry)"
            >
              <template #prepend>
                <v-icon :color="severityColor(entry.notice.severity)" size="small">
                  {{ severityIcon(entry.notice.severity) }}
                </v-icon>
              </template>
              <v-list-item-title class="announcement-dialog__list-title">
                {{ entry.translation.title }}
              </v-list-item-title>
              <template #append>
                <span
                  v-if="!entry.read"
                  class="announcement-dialog__unread"
                  :aria-label="t('announcements.unread')"
                ></span>
              </template>
            </v-list-item>
          </v-list>
        </nav>

        <section v-if="selectedNotice" class="announcement-dialog__content">
          <div class="announcement-dialog__heading">
            <div>
              <v-chip
                size="small"
                variant="tonal"
                :color="severityColor(selectedNotice.notice.severity)"
                class="mb-2"
              >
                {{ t(`announcements.severity.${selectedNotice.notice.severity}`) }}
              </v-chip>
              <h2 class="text-h6 font-weight-bold">{{ selectedNotice.translation.title }}</h2>
              <div class="text-caption text-medium-emphasis mt-1">
                {{ formatDate(selectedNotice.notice.publishedAt) }}
              </div>
            </div>
          </div>

          <p class="announcement-dialog__summary text-body-2 mt-4">
            {{ selectedNotice.translation.summary }}
          </p>

          <div class="announcement-dialog__markdown pa-4 mt-3 rounded">
            <SafeMarkdown :source="selectedNotice.translation.bodyMarkdown" />
          </div>

          <div v-if="selectedNotice.translation.actions.length" class="d-flex flex-wrap ga-2 mt-4">
            <v-btn
              v-for="action in selectedNotice.translation.actions"
              :key="action.url"
              color="primary"
              variant="tonal"
              append-icon="mdi-open-in-new"
              @click="openAction(action.url)"
            >
              {{ action.label }}
            </v-btn>
          </div>
        </section>

        <div v-else class="announcement-dialog__expired text-body-2 text-medium-emphasis">
          {{ t('announcements.noLongerAvailable') }}
        </div>
      </v-card-text>

      <v-divider />

      <v-card-actions class="pa-4">
        <v-spacer />
        <v-btn variant="elevated" color="primary" @click="dialogVisible = false">
          {{ t('announcements.close') }}
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script lang="ts" setup>
import { computed, ref, watch } from 'vue'
import { useTranslation } from 'i18next-vue'
import { useAppStore, useMetadataStore } from '@/store'
import SafeMarkdown from '@/components/SafeMarkdown.vue'
import type { MatchedNotice } from '@/lib/notices'

const props = defineProps<{
  modelValue: boolean
  notices: MatchedNotice[]
  selectedNoticeKey: string | null
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  'update:selectedNoticeKey': [value: string]
}>()

const { i18next, t } = useTranslation()
const appStore = useAppStore()
const metadataStore = useMetadataStore()
const dialogVisible = computed({
  get: () => props.modelValue,
  set: (value: boolean) => emit('update:modelValue', value),
})
const selectedNoticeKey = ref<string | null>(props.selectedNoticeKey)
const noticeKey = (entry: MatchedNotice) => `${entry.notice.id}:${entry.notice.revision}`
const selectedNotice = computed(
  () => props.notices.find((entry) => noticeKey(entry) === selectedNoticeKey.value) ?? null,
)

watch(
  () => props.selectedNoticeKey,
  (value) => {
    selectedNoticeKey.value = value
  },
)

watch(
  () => [props.modelValue, selectedNoticeKey.value] as const,
  ([isOpen]) => {
    if (isOpen && selectedNotice.value) metadataStore.markNoticeRead(selectedNotice.value.notice)
  },
  { immediate: true },
)

const selectNotice = (entry: MatchedNotice) => {
  selectedNoticeKey.value = noticeKey(entry)
  emit('update:selectedNoticeKey', noticeKey(entry))
  metadataStore.markNoticeRead(entry.notice)
}

const openAction = (url: string) => {
  void window.electron.openExternal({ url }).catch((error) => {
    console.error('Failed to open announcement action:', error)
  })
}

const formatDate = (value: string) => {
  const date = new Date(value)
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleString(appStore.locale || i18next.language || undefined)
}

const severityColor = (severity: string) => {
  if (severity === 'critical') return 'error'
  if (severity === 'warning') return 'warning'
  if (severity === 'success') return 'success'
  return 'primary'
}

const severityIcon = (severity: string) => {
  if (severity === 'critical') return 'mdi-alert-octagon-outline'
  if (severity === 'warning') return 'mdi-alert-outline'
  if (severity === 'success') return 'mdi-check-circle-outline'
  return 'mdi-information-outline'
}
</script>

<style scoped lang="scss">
.announcement-dialog {
  overflow: hidden;
}

.announcement-dialog__body {
  display: grid;
  grid-template-columns: minmax(0, 230px) minmax(0, 1fr);
  gap: 20px;
  max-height: min(70vh, 680px);
}

.announcement-dialog__list {
  min-width: 0;
  overflow-y: auto;
  border-inline-end: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
  padding-inline-end: 12px;
}

.announcement-dialog__body--single {
  grid-template-columns: minmax(0, 1fr);
}

.announcement-dialog__list-title {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.announcement-dialog__unread {
  display: inline-block;
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: rgb(var(--v-theme-primary));
}

.announcement-dialog__content {
  min-width: 0;
}

.announcement-dialog__summary {
  color: rgba(var(--v-theme-on-surface), 0.78);
}

.announcement-dialog__markdown {
  max-height: 43vh;
  overflow-y: auto;
  background: rgba(var(--v-theme-on-surface), 0.045);
}

.announcement-dialog__expired {
  grid-column: 1 / -1;
  padding: 24px 8px;
  text-align: center;
}

@media (max-width: 600px) {
  .announcement-dialog__body {
    grid-template-columns: minmax(0, 1fr);
    gap: 10px;
  }

  .announcement-dialog__list {
    max-height: 160px;
    border-inline-end: 0;
    border-block-end: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
    padding: 0 0 8px;
  }
}
</style>
