<template>
  <div class="preview">
    <div class="preview-stage">
      <img v-if="image" :src="image" :alt="t('renderSettings.preview')" />
      <Transition name="preview-loading">
        <div v-if="loadingVisible" class="preview-loading" role="status" aria-live="polite">
          <v-progress-circular indeterminate color="primary" size="24" width="3" />
          <span>{{ t('renderSettings.loading') }}</span>
        </div>
      </Transition>
    </div>
    <div class="text-caption text-center my-2">
      {{ size.width }} × {{ size.height }} · {{ t('renderSettings.previewHint') }}
    </div>
    <v-textarea
      v-model="text"
      :label="t('renderSettings.previewText')"
      rows="2"
      no-resize
      hide-details
    />
    <v-alert v-if="error" type="warning" density="compact" class="mt-2">
      {{ t('renderSettings.previewError') }}
      <v-btn variant="text" size="small" @click="schedule">{{ t('renderSettings.retry') }}</v-btn>
    </v-alert>
  </div>
</template>

<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from 'vue'
import { useTranslation } from 'i18next-vue'
import { createPixiApp } from '@/effect-engine/renderer/pixi-stage-factory'
import {
  buildSubtitleLayout,
  renderSubtitleFrame,
} from '@/effect-engine/renderer/subtitle-render-runtime'
import { resolveSubtitleStyle } from '@/effect-engine/shared/style'
import type { SubtitleStyleConfig } from '@/effect-engine/shared/types'
import { validVideoSize } from '@/lib/render-config'

const props = defineProps<{
  size: { width: number; height: number }
  styleConfig: SubtitleStyleConfig
  enabled: boolean
}>()
const { t } = useTranslation()
const text = ref(t('renderSettings.sample'))
const image = ref('')
const loading = ref(false)
const loadingVisible = ref(false)
const error = ref(false)
let loadingShownAt = 0
let loadingShowTimer: ReturnType<typeof setTimeout> | undefined
let loadingHideTimer: ReturnType<typeof setTimeout> | undefined
let revision = 0
let timer: ReturnType<typeof setTimeout> | undefined
let disposed = false
let rendering = false
let pending = false

// Keep the last frame during refresh. Delay subsequent masks and give visible
// masks a minimum duration so fast renders do not flash a spinner.
watch(
  loading,
  (busy) => {
    clearTimeout(loadingShowTimer)
    clearTimeout(loadingHideTimer)
    if (busy) {
      if (loadingVisible.value) return
      const show = () => {
        loadingShownAt = Date.now()
        loadingVisible.value = true
      }
      if (!image.value) show()
      else loadingShowTimer = setTimeout(show, 400)
    } else if (loadingVisible.value) {
      loadingHideTimer = setTimeout(
        () => {
          loadingVisible.value = false
        },
        Math.max(0, 240 - (Date.now() - loadingShownAt)),
      )
    }
  },
  { flush: 'sync' },
)

async function render() {
  if (rendering) {
    pending = true
    return
  }
  if (disposed || !validVideoSize(props.size)) {
    loading.value = false
    return
  }
  rendering = true
  pending = false
  const current = revision
  const size = { width: Number(props.size.width), height: Number(props.size.height) }
  const style = resolveSubtitleStyle({ ...props.styleConfig }, size.width)
  const content = props.enabled ? text.value : ''
  let stage: Awaited<ReturnType<typeof createPixiApp>> | undefined
  try {
    // Exactly the same layout and Pixi renderer as PNG sequence export, but only one frame.
    await document.fonts.load(
      `${style.fontWeight} ${style.fontSize}px ${style.fontFamily}`,
      content || '字幕',
    )
    stage = await createPixiApp(size)
    const context = document.createElement('canvas').getContext('2d')!
    const cues = buildSubtitleLayout({
      cues: [{ id: 'preview', text: content, startMs: 0, endMs: 1000 }],
      style,
      videoWidth: size.width,
      measure: (value, fontSize) => {
        context.font = `${style.fontWeight} ${fontSize}px ${style.fontFamily}`
        return context.measureText(value).width
      },
    })
    renderSubtitleFrame({ root: stage.root, cues, style, timeMs: 0, ...size })
    stage.app.render()
    const output = document.createElement('canvas')
    output.width = size.width
    output.height = size.height
    const outputContext = output.getContext('2d')!
    outputContext.fillStyle = '#000000'
    outputContext.fillRect(0, 0, size.width, size.height)
    outputContext.drawImage(stage.app.canvas as HTMLCanvasElement, 0, 0)
    const png = output.toDataURL('image/png')
    if (!disposed && current === revision) {
      image.value = png
      error.value = false
    }
  } catch {
    if (!disposed && current === revision) error.value = true
  } finally {
    stage?.app.destroy(true, { children: true })
    rendering = false
    if (!disposed && current === revision) loading.value = false
    if (pending && !disposed) void render()
  }
}
function schedule() {
  revision++
  clearTimeout(timer)
  loading.value = true
  timer = setTimeout(() => void render(), 250)
}
watch(() => [props.size, props.styleConfig, props.enabled, text.value], schedule, {
  deep: true,
  immediate: true,
})
onBeforeUnmount(() => {
  disposed = true
  revision++
  clearTimeout(timer)
  clearTimeout(loadingShowTimer)
  clearTimeout(loadingHideTimer)
})
</script>

<style scoped>
.preview {
  min-width: 0;
  display: flex;
  flex-direction: column;
  height: 100%;
}
.preview-stage {
  flex: 1;
  min-height: 80px;
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  overflow: hidden;
  padding: 12px;
  background: rgba(var(--v-theme-on-surface), 0.08);
  border: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
  border-radius: 8px;
}
.preview-stage img {
  max-width: 100%;
  max-height: 100%;
  width: auto;
  height: auto;
  object-fit: contain;
  min-height: 0;
  border: 1px solid rgba(255, 255, 255, 0.24);
  border-radius: 6px;
  box-shadow: 0 3px 12px rgba(0, 0, 0, 0.24);
}
.preview-loading {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  color: rgb(var(--v-theme-on-surface));
  font-size: 12px;
  background: rgba(var(--v-theme-surface), 0.8);
  backdrop-filter: blur(2px);
  pointer-events: none;
}
.preview-loading-enter-active,
.preview-loading-leave-active {
  transition: opacity 120ms ease-out;
}
.preview-loading-enter-from,
.preview-loading-leave-to {
  opacity: 0;
}
.preview :deep(.v-input) {
  flex: 0 0 auto;
}
.preview :deep(textarea) {
  resize: none;
  overflow-y: auto;
}
</style>
