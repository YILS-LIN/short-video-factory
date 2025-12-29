<template>
  <div class="pr-1">
    <div>{{ message }}</div>
    <div class="mt-1 text-sm">{{ detailShort }}</div>
    <div class="mt-2">
      <button
        class="cursor-pointer transition-all bg-blue-700 text-white text-sm px-4 py-2 rounded-lg border-blue-800 border-b-[4px] hover:brightness-110 hover:-translate-y-[1px] hover:border-b-[6px] active:border-b-[2px] active:brightness-90 active:translate-y-[2px]"
        @click="$emit('actionTirgger')"
      >
        {{ actionText }}
      </button>
    </div>
  </div>
</template>

<script lang="ts" setup>
import { computed } from 'vue'

interface Props {
  message: string
  detail: string
  actionText: string
}

const props = defineProps<Props>()
defineEmits<{ (e: 'actionTirgger'): void }>()

const detailShort = computed(() =>
  props.detail?.length > 100 ? props.detail.slice(0, 100) + '...' : props.detail,
)
</script>

<style lang="scss" scoped>
//
</style>
