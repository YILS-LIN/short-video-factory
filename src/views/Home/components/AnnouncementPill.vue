<template>
  <button
    v-if="activeNotice"
    type="button"
    class="announcement-pill"
    :class="`announcement-pill--${activeNotice.notice.severity}`"
    :aria-label="accessibleLabel"
    :title="accessibleLabel"
    aria-haspopup="dialog"
    @click="$emit('open', `${activeNotice.notice.id}:${activeNotice.notice.revision}`)"
  >
    <v-icon size="small" aria-hidden="true">{{ icon }}</v-icon>
    <span class="announcement-pill__title">{{ activeNotice.translation.title }}</span>
    <span v-if="hasUnread" class="announcement-pill__unread" aria-hidden="true"></span>
    <span v-if="notices.length > 1" class="announcement-pill__count"
      >+{{ notices.length - 1 }}</span
    >
    <span class="announcement-pill__details">{{ t('announcements.viewDetails') }}</span>
    <v-icon size="small" aria-hidden="true">mdi-chevron-right</v-icon>
  </button>
</template>

<script lang="ts" setup>
import { computed } from 'vue'
import { useTranslation } from 'i18next-vue'
import type { MatchedNotice } from '@/lib/notices'

const props = defineProps<{ notices: MatchedNotice[] }>()
defineEmits<{ open: [key: string] }>()
const { t } = useTranslation()
// The matched list is already sorted by severity and priority.
const activeNotice = computed(() => props.notices[0] ?? null)
const hasUnread = computed(() => props.notices.some((entry) => !entry.read))
const icon = computed(() => {
  switch (activeNotice.value?.notice.severity) {
    case 'critical':
      return 'mdi-alert-octagon-outline'
    case 'warning':
      return 'mdi-alert-outline'
    case 'success':
      return 'mdi-check-circle-outline'
    default:
      return 'mdi-bullhorn-outline'
  }
})
const accessibleLabel = computed(() =>
  activeNotice.value
    ? t('announcements.openWithTitle', {
        title: activeNotice.value.translation.title,
        count: props.notices.length,
      })
    : t('announcements.open'),
)
</script>

<style scoped lang="scss">
.announcement-pill {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  flex: 1 1 180px;
  min-width: 180px;
  height: 38px;
  padding: 0 14px;
  border: 1px solid;
  border-radius: 9999px;
  font: inherit;
  cursor: pointer;
  transition:
    background-color 120ms ease,
    border-color 120ms ease,
    box-shadow 120ms ease;
  &:hover {
    box-shadow: 0 2px 10px rgba(15, 23, 42, 0.1);
  }
  &:focus-visible {
    outline: 2px solid currentColor;
    outline-offset: 2px;
  }
}
.announcement-pill--info,
.announcement-pill--success {
  color: #5521d4;
  border-color: rgba(101, 31, 255, 0.24);
  background: rgba(101, 31, 255, 0.08);
}
.announcement-pill--warning {
  color: #8a4b00;
  border-color: rgba(217, 119, 6, 0.35);
  background: rgba(245, 158, 11, 0.13);
}
.announcement-pill--critical {
  color: #a31926;
  border-color: rgba(220, 38, 38, 0.34);
  background: rgba(239, 68, 68, 0.12);
}
:global(.v-theme--dark) .announcement-pill--info,
:global(.v-theme--dark) .announcement-pill--success {
  color: #c4b5fd;
  border-color: rgba(167, 139, 250, 0.38);
  background: rgba(124, 58, 237, 0.19);
}
:global(.v-theme--dark) .announcement-pill--warning {
  color: #fcd34d;
  border-color: rgba(251, 191, 36, 0.42);
  background: rgba(180, 83, 9, 0.2);
}
:global(.v-theme--dark) .announcement-pill--critical {
  color: #fca5a5;
  border-color: rgba(248, 113, 113, 0.4);
  background: rgba(185, 28, 28, 0.2);
}
.announcement-pill__title {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 0.875rem;
  font-weight: 600;
}
.announcement-pill__details {
  flex: 0 0 auto;
  font-size: 0.75rem;
}
.announcement-pill__unread {
  flex: 0 0 7px;
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: currentColor;
}
.announcement-pill__count {
  flex: 0 0 auto;
  padding: 1px 6px;
  border-radius: 9999px;
  background: rgba(127, 127, 127, 0.14);
  font-size: 0.72rem;
  font-weight: 700;
}
</style>
