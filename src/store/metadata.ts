import { defineStore } from 'pinia'
import { computed, ref, shallowRef } from 'vue'
import type { MetadataState } from '~/electron/metadata/types'
import { getNoticePreferenceKey, matchNotices, type NoticePreference } from '@/lib/notices'

export const useMetadataStore = defineStore(
  'metadata',
  () => {
    const sequence = ref(-1)
    const phase = ref<MetadataState['phase']>('idle')
    const context = shallowRef<MetadataState['context'] | null>(null)
    const payload = shallowRef<MetadataState['payload']>(null)
    const lastSuccessAt = ref<string | null>(null)
    const error = ref<string | null>(null)
    const noticePreferences = ref<Record<string, NoticePreference>>({})

    const hasVerifiedPayload = computed(() => payload.value !== null)

    function applyState(state: MetadataState): void {
      if (state.sequence < sequence.value) return
      sequence.value = state.sequence
      phase.value = state.phase
      context.value = state.context
      payload.value = state.payload
      lastSuccessAt.value = state.lastSuccessAt
      error.value = state.error
    }

    function getMatchedNotices(locale: string, now = Date.now()) {
      if (!payload.value || !context.value) return []
      return matchNotices(
        payload.value.notices,
        context.value,
        locale,
        now,
        noticePreferences.value,
      )
    }

    function markNoticeRead(
      notice: NonNullable<MetadataState['payload']>['notices'][number],
    ): void {
      if (!context.value) return
      const key = getNoticePreferenceKey(context.value, notice)
      noticePreferences.value[key] = {
        read: true,
        dismissed: false,
      }
    }

    return {
      sequence,
      phase,
      context,
      payload,
      lastSuccessAt,
      error,
      noticePreferences,
      hasVerifiedPayload,
      applyState,
      getMatchedNotices,
      markNoticeRead,
    }
  },
  {
    persist: {
      omit: ['sequence', 'phase', 'context', 'payload', 'lastSuccessAt', 'error'],
    },
  },
)
