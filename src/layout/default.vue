<template>
  <div class="layout-container" :class="{ 'is-mac': isMac }" :style="layoutStyle">
    <div class="logo" v-if="!route.meta.hideAppIcon">
      <img src="/icon.png" alt="" />
      <span>{{ t('app.name') }}</span>
    </div>
    <div class="window-control-bar">
      <div class="window-no-drag">
        <v-menu location="bottom right">
          <template v-slot:activator="{ props }">
            <div class="control-btn control-btn-translate" v-bind="props">
              <v-icon icon="mdi-translate" size="small" />
            </div>
          </template>
          <v-list
            class="p-2 space-y-1"
            activatable
            :activated="i18next.language"
            @update:activated="handleChangeLanguage"
          >
            <v-list-item
              v-for="(item, index) in i18nLanguages"
              :key="index"
              :value="item.code"
              color="primary"
              density="compact"
              rounded
            >
              <v-list-item-title>{{ item.name }}</v-list-item-title>
            </v-list-item>
          </v-list>
        </v-menu>
      </div>
      <div class="window-no-drag">
        <v-menu location="bottom right">
          <template v-slot:activator="{ props }">
            <div class="control-btn control-btn-zoom" v-bind="props">
              <v-icon icon="mdi-magnify-plus-outline" />
            </div>
          </template>
          <v-list
            class="p-2 space-y-1"
            activatable
            :activated="[appStore.zoomFactor]"
            @update:activated="handleChangeZoom"
          >
            <v-list-item
              v-for="(item, index) in zoomDisplayOptions"
              :key="index"
              :value="item.value"
              color="primary"
              density="compact"
              rounded
            >
              <v-list-item-title>{{ item.label }}</v-list-item-title>
            </v-list-item>
          </v-list>
        </v-menu>
      </div>
      <template v-if="!isMac">
        <div class="control-btn control-btn-min" @click="handleMin">
          <v-icon icon="mdi-window-minimize" size="small" />
        </div>
        <div class="control-btn control-btn-max" @click="handleMax">
          <v-icon icon="mdi-window-maximize" size="small" v-if="!windowIsMaxed" />
          <v-icon icon="mdi-window-restore" size="small" v-else />
        </div>
        <div class="control-btn control-btn-close" @click="handleClose">
          <v-icon icon="mdi-window-close" size="small" />
        </div>
      </template>
    </div>
    <RouterView />
  </div>
</template>

<script lang="ts" setup>
import { onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { useTranslation } from 'i18next-vue'
import { i18nLanguages } from '~/electron/i18n/common-options'
import { useAppStore } from '@/store'

const { i18next, t } = useTranslation()
const appStore = useAppStore()
// const lang = ref(i18next.language)
// console.log('i18next.language', i18next.language)

document.title = t('app.name')

const route = useRoute()
const isMac = window.electron.platform === 'darwin'
const layoutStyle = {
  '--window-control-mask-width': isMac ? '84px' : '210px',
}
const windowIsMaxed = ref(false)

const zoomDisplayOptions = appStore.zoomOptions.map((factor) => ({
  value: factor,
  label: `${Math.round(factor * 100)}%`,
}))

const handleChangeLanguage = (lng: unknown) => {
  console.log('handleChangeLanguage', lng)
  if ((lng as string[])[0]) {
    window.i18n.changeLanguage((lng as string[])[0])
  }
}

const handleChangeZoom = (factor: unknown) => {
  const zoomFactor = (factor as number[])[0]
  if (zoomFactor) {
    window.electron.setZoomFactor(zoomFactor)
    appStore.updateZoomFactor(zoomFactor)
  }
}

onMounted(() => {
  window.electron.setZoomFactor(appStore.zoomFactor)
})

window.addEventListener('resize', async () => {
  windowIsMaxed.value = await window.electron.isWinMaxed()
})

const handleMin = () => {
  window.electron.winMin()
}
const handleMax = () => {
  window.electron.winMax()
}
const handleClose = () => {
  window.electron.winClose()
}
</script>

<style lang="scss" scoped>
.layout-container {
  width: 100vw;
  height: 100vh;
  overflow: hidden;
  position: relative;

  --title-bar-height: 40px;

  .logo {
    position: absolute;
    z-index: 9999;
    top: 0;
    left: 0;
    height: var(--title-bar-height);
    padding-left: 15px;
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 14px;
    user-select: none;
    -webkit-app-region: drag;

    img {
      width: 20px;
      height: 20px;
    }
  }

  &.is-mac {
    .logo {
      padding-left: 84px;
      pointer-events: none;
      -webkit-app-region: no-drag;
    }
  }

  .window-control-bar {
    position: absolute;
    z-index: 9999;
    top: 0;
    right: 0;
    display: flex;
    align-items: center;
    font-size: 14px;
    user-select: none;

    .control-btn {
      transition: all 0.1s;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 5px;
      width: 42px;
      height: var(--title-bar-height);
      box-sizing: border-box;
      -webkit-app-region: no-drag;

      &:hover {
        @apply bg-gray-200;
      }

      &-close {
        &:hover {
          @apply text-white bg-red-600;
        }
      }
    }

  }
}
</style>
