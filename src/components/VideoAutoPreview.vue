<template>
  <div class="w-full h-full">
    <video
      ref="Video"
      class="w-full h-full object-cover"
      :src="'file://' + asset.path"
      muted
      loop
      preload="metadata"
      @mouseenter="handleMouseEnter"
      @mouseleave="handleMouseLeave"
      @loadedmetadata="handleLoadedMetadata"
    ></video>
  </div>
</template>

<script lang="ts" setup>
import { ListFilesFromFolderRecord } from '~/electron/types'
import { ref } from 'vue'

defineProps<{ asset: ListFilesFromFolderRecord }>()

const emit = defineEmits<{ (e: 'loaded', info: VideoInfo): void }>()

const Video = ref<HTMLVideoElement | null>(null)

export interface VideoInfo {
  duration: number
  width: number
  height: number
}

const info = ref<VideoInfo>({
  duration: 0,
  width: 0,
  height: 0,
})

const handleLoadedMetadata = () => {
  const el = Video.value!
  info.value.duration = el.duration
  info.value.width = el.videoWidth
  info.value.height = el.videoHeight
  emit('loaded', info.value)
}

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
