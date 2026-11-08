<template>
  <span
    class="duration-estimate text-medium-emphasis"
    data-testid="duration-estimate"
    :style="{ visibility: seconds > 0 ? 'visible' : 'hidden' }"
    :aria-hidden="seconds <= 0"
    :title="seconds > 0 ? `${label} · ${t('durationEstimate.hint')}` : undefined"
  >
    {{ label }}
  </span>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useTranslation } from 'i18next-vue'
import { estimateVideoDuration, formatPlaybackDuration } from '@/lib/video-duration-estimate'

const props = withDefaults(defineProps<{ text: string; generating: boolean; ready?: boolean }>(), {
  ready: true,
})
const { t } = useTranslation()
const seconds = ref(0)
let timer: ReturnType<typeof setTimeout> | undefined

watch(
  () => [props.text, props.generating, props.ready] as const,
  ([text, generating, ready]) => {
    clearTimeout(timer)
    if (generating || !ready || !/[\p{L}\p{N}]/u.test(text)) {
      seconds.value = 0
      return
    }
    timer = setTimeout(() => {
      seconds.value = estimateVideoDuration(text)
    }, 200)
  },
  { immediate: true, flush: 'sync' },
)

onBeforeUnmount(() => clearTimeout(timer))
const label = computed(() =>
  t('durationEstimate.label', { duration: formatPlaybackDuration(seconds.value) }),
)
</script>

<style scoped>
.duration-estimate {
  order: -1;
  flex: 0 1 auto;
  min-width: 0;
  margin-inline-end: 8px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}
</style>
