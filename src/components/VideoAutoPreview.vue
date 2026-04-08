<template>
  <div class="w-full h-full">
    <video
      ref="Video"
      class="w-full h-full object-cover"
      :src="fileSrc"
      muted
      loop
      preload="metadata"
      @mouseenter="handleMouseEnter"
      @mouseleave="handleMouseLeave"
    ></video>
  </div>
</template>

<script lang="ts" setup>
import { ListFilesFromFolderRecord } from '~/electron/types'
import { computed, ref } from 'vue'

const props = defineProps<{ asset: ListFilesFromFolderRecord }>()

const Video = ref<HTMLVideoElement | null>(null)
const fileSrc = computed(() => {
  const normalizedPath = props.asset.path.replace(/\\/g, '/')
  return normalizedPath.startsWith('/') ? `file://${normalizedPath}` : `file:///${normalizedPath}`
})

const handleMouseEnter = () => {
  Video.value?.play()
}
const handleMouseLeave = () => {
  Video.value?.pause()
  if (Video.value) {
    Video.value.currentTime = 0
  }
}
</script>

<style lang="scss" scoped>
//
</style>
