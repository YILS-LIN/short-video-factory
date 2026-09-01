<template>
  <div class="effect-renderer-root" :class="{ 'effect-renderer-root--debug': isDebug }">
    <div id="effect-renderer-canvas-host" class="effect-renderer-canvas-host"></div>
    <span v-if="isDebug" class="effect-renderer-status">Effect Renderer Debug View</span>
  </div>
</template>

<script lang="ts" setup>
import { bootstrapEffectRenderer } from '@/effect-engine/renderer/bootstrap'

const isDebug =
  import.meta.env.VITE_EFFECT_RENDERER_DEBUG === 'true' ||
  import.meta.env.VITE_EFFECT_RENDERER_DEBUG === '1'

// 提前在模块初始化阶段注册 IPC 监听，避免隐藏窗口就绪握手偶发丢失。
bootstrapEffectRenderer()
</script>

<style scoped>
.effect-renderer-root {
  width: 100vw;
  height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  overflow: hidden;
}

.effect-renderer-status {
  position: fixed;
  top: 8px;
  left: 8px;
  padding: 4px 8px;
  border-radius: 999px;
  font-size: 12px;
  color: #f8fafc;
  background: rgba(15, 23, 42, 0.75);
  border: 1px solid rgba(148, 163, 184, 0.35);
  user-select: none;
}

.effect-renderer-canvas-host {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
}

.effect-renderer-canvas-host :deep(canvas) {
  max-width: 100%;
  max-height: 100%;
}

.effect-renderer-root--debug {
  background-color: #111827;
  background-image:
    linear-gradient(45deg, rgba(255, 255, 255, 0.03) 25%, transparent 25%),
    linear-gradient(-45deg, rgba(255, 255, 255, 0.03) 25%, transparent 25%),
    linear-gradient(45deg, transparent 75%, rgba(255, 255, 255, 0.03) 75%),
    linear-gradient(-45deg, transparent 75%, rgba(255, 255, 255, 0.03) 75%);
  background-size: 20px 20px;
  background-position:
    0 0,
    0 10px,
    10px -10px,
    -10px 0;
}
</style>
