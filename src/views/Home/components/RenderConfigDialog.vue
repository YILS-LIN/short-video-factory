<template>
  <v-dialog v-model="open" max-width="1040" scrollable persistent>
    <v-card :title="t('dialogs.renderConfig')" prepend-icon="mdi-movie-cog-outline">
      <v-card-text class="config-body">
        <div class="config-preview">
          <SubtitlePreview
            v-if="open"
            :size="draft.outputSize"
            :style-config="draft.subtitleStyle"
            :enabled="draft.subtitlesEnabled"
          />
        </div>
        <div class="config-settings">
          <v-tabs v-model="tab" color="primary" grow>
            <v-tab value="video">{{ t('renderSettings.video') }}</v-tab>
            <v-tab value="subtitle">{{ t('renderSettings.subtitle') }}</v-tab>
            <v-tab value="audio">{{ t('renderSettings.audio') }}</v-tab>
          </v-tabs>
          <div :key="`${open}-${tab}`" class="config-fields">
            <div v-if="tab === 'video'" class="fields">
              <v-select
                v-model="preset"
                :items="presets"
                :label="t('renderSettings.preset')"
                hide-details
              />
              <div class="flex gap-2 items-center">
                <v-text-field
                  v-model.number="draft.outputSize.width"
                  type="number"
                  :label="t('features.render.config.output.width')"
                  hide-details
                />
                <v-btn
                  icon="mdi-swap-horizontal"
                  variant="text"
                  :aria-label="t('renderSettings.swap')"
                  @click="swapSize"
                />
                <v-text-field
                  v-model.number="draft.outputSize.height"
                  type="number"
                  :label="t('features.render.config.output.height')"
                  hide-details
                />
              </div>
              <div v-if="!sizeValid" class="text-error text-caption">
                {{ t('renderSettings.invalidSize') }}
              </div>
              <v-text-field
                v-model="draft.outputFileName"
                :label="t('features.render.config.output.fileName')"
                clearable
                hide-details
              />
              <v-text-field
                v-model="draft.outputFileExt"
                :label="t('features.render.config.output.format')"
                readonly
                hide-details
              />
              <v-text-field
                v-model="draft.outputPath"
                :label="t('features.render.config.output.folder')"
                readonly
                hide-details
              />
              <v-btn prepend-icon="mdi-folder-open" variant="tonal" @click="selectOutput">{{
                t('common.buttons.selectFolder')
              }}</v-btn>
            </div>
            <div v-else-if="tab === 'subtitle'" class="fields">
              <section class="subtitle-section">
                <h3>{{ t('renderSettings.sections.subtitle') }}</h3>
                <v-switch
                  v-model="draft.subtitlesEnabled"
                  :label="t('features.render.config.subtitlesEnabled')"
                  color="primary"
                  hide-details
                />
              </section>
              <section class="subtitle-section">
                <h3>{{ t('renderSettings.sections.typography') }}</h3>
                <v-slider
                  v-model="draft.subtitleStyle.fontSize"
                  :label="t('renderSettings.fontSize')"
                  min="16"
                  max="220"
                  step="1"
                  thumb-label
                  color="primary"
                  hide-details
                >
                  <template #append>
                    <v-text-field
                      v-model.number="draft.subtitleStyle.fontSize"
                      type="number"
                      min="16"
                      max="220"
                      density="compact"
                      hide-details
                      style="width: 80px"
                      :aria-label="t('renderSettings.fontSize')"
                    />
                  </template>
                </v-slider>
                <div class="text-caption text-medium-emphasis">
                  {{ t('renderSettings.fontHint') }}
                </div>
                <label class="color-field"
                  >{{ t('renderSettings.color')
                  }}<input v-model="draft.subtitleStyle.color" type="color"
                /></label>
              </section>
              <section class="subtitle-section">
                <h3>{{ t('renderSettings.sections.outline') }}</h3>
                <v-slider
                  v-model="draft.subtitleStyle.strokeWidth"
                  :label="t('renderSettings.strokeWidth')"
                  min="0"
                  max="12"
                  step="1"
                  thumb-label
                  color="primary"
                  hide-details
                >
                  <template #append
                    ><span>{{ draft.subtitleStyle.strokeWidth }}</span></template
                  >
                </v-slider>
                <label class="color-field"
                  >{{ t('renderSettings.strokeColor')
                  }}<input v-model="draft.subtitleStyle.strokeColor" type="color"
                /></label>
              </section>
              <section class="subtitle-section">
                <h3>{{ t('renderSettings.sections.layout') }}</h3>
                <v-slider
                  v-model="draft.subtitleStyle.offsetY"
                  :label="t('renderSettings.offset')"
                  min="-600"
                  max="600"
                  step="1"
                  thumb-label
                  color="primary"
                  hide-details
                >
                  <template #append
                    ><span>{{ draft.subtitleStyle.offsetY }}</span></template
                  >
                </v-slider>
                <v-select
                  v-model="draft.subtitleStyle.position"
                  :items="positions"
                  :label="t('renderSettings.position')"
                  hide-details
                  @update:model-value="draft.subtitleStyle.offsetY = 0"
                />
                <v-select
                  v-model="draft.subtitleStyle.maxLines"
                  :items="lineOptions"
                  :label="t('renderSettings.maxLines')"
                  hide-details
                />
              </section>
              <v-btn variant="text" @click="draft.subtitleStyle = normalizeSubtitleStyle()">{{
                t('renderSettings.reset')
              }}</v-btn>
            </div>
            <div v-else class="fields">
              <v-select
                v-model="draft.bgmMode"
                :items="audioModes"
                :label="t('renderSettings.bgmMode')"
                hide-details
              />
              <template v-if="draft.bgmMode !== 'none'">
                <v-text-field
                  :model-value="draft.bgmMode === 'random' ? draft.bgmPath : draft.bgmFile"
                  :label="
                    t(
                      draft.bgmMode === 'random'
                        ? 'renderSettings.audioFolder'
                        : 'renderSettings.audioFile',
                    )
                  "
                  readonly
                  hide-details
                />
                <v-btn
                  :prepend-icon="
                    draft.bgmMode === 'random' ? 'mdi-folder-open' : 'mdi-file-music-outline'
                  "
                  variant="tonal"
                  @click="selectAudio"
                  >{{
                    t(
                      draft.bgmMode === 'random'
                        ? 'common.buttons.selectFolder'
                        : 'common.buttons.selectFile',
                    )
                  }}</v-btn
                >
                <div class="text-caption text-medium-emphasis">
                  {{
                    t(
                      draft.bgmMode === 'random'
                        ? 'renderSettings.randomHint'
                        : 'renderSettings.fixedHint',
                    )
                  }}
                </div>
                <div v-if="!audioValid" class="text-error text-caption">
                  {{ t('renderSettings.audioRequired') }}
                </div>
              </template>
            </div>
          </div>
        </div>
      </v-card-text>
      <v-divider />
      <v-card-actions>
        <v-spacer />
        <v-btn variant="plain" @click="open = false">{{ t('common.buttons.cancel') }}</v-btn>
        <v-btn
          color="primary"
          variant="tonal"
          :disabled="!sizeValid || !audioValid"
          @click="save"
          >{{ t('common.buttons.save') }}</v-btn
        >
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useTranslation } from 'i18next-vue'
import { useToast } from 'vue-toastification'
import { useAppStore } from '@/store'
import SubtitlePreview from '@/components/SubtitlePreview.vue'
import { normalizeSubtitleStyle, validVideoSize, videoSizePresets } from '@/lib/render-config'

const open = defineModel<boolean>({ default: false })
const store = useAppStore()
const { t } = useTranslation()
const toast = useToast()
const createDraft = () => ({
  ...store.renderConfig,
  outputSize: { ...store.renderConfig.outputSize },
  subtitleStyle: { ...store.renderConfig.subtitleStyle },
})
const draft = ref(createDraft())
const tab = ref('video')
watch(open, (value) => {
  tab.value = 'video'
  if (value) draft.value = createDraft()
})
const presets = computed(() => [
  ...videoSizePresets.map((p) => ({ title: t(`renderSettings.sizes.${p.value}`), value: p.value })),
  { title: t('renderSettings.custom'), value: 'custom' },
])
const customSelected = ref(false)
const preset = computed({
  get: () =>
    customSelected.value
      ? 'custom'
      : (videoSizePresets.find(
          (p) =>
            p.width === Number(draft.value.outputSize.width) &&
            p.height === Number(draft.value.outputSize.height),
        )?.value ?? 'custom'),
  set: (value: string) => {
    customSelected.value = value === 'custom'
    const p = videoSizePresets.find((item) => item.value === value)
    if (p) draft.value.outputSize = { width: p.width, height: p.height }
  },
})
watch(open, () => {
  customSelected.value = false
})
watch(
  () => [draft.value.outputSize.width, draft.value.outputSize.height],
  () => {
    customSelected.value = false
  },
)
const positions = computed(() =>
  ['top', 'middle', 'bottom'].map((value) => ({ title: t(`renderSettings.${value}`), value })),
)
const lineOptions = computed(() =>
  [1, 2].map((value) => ({ title: t(`renderSettings.lines${value}`), value })),
)
const audioModes = computed(() =>
  ['none', 'random', 'fixed'].map((value) => ({ title: t(`renderSettings.${value}`), value })),
)
const sizeValid = computed(() => validVideoSize(draft.value.outputSize))
const audioValid = computed(
  () =>
    draft.value.bgmMode === 'none' ||
    Boolean((draft.value.bgmMode === 'random' ? draft.value.bgmPath : draft.value.bgmFile).trim()),
)
function swapSize() {
  const { width, height } = draft.value.outputSize
  draft.value.outputSize = { width: height, height: width }
  customSelected.value = false
}
function save() {
  if (!sizeValid.value || !audioValid.value) return
  store.updateRenderConfig({
    ...draft.value,
    outputSize: {
      width: Number(draft.value.outputSize.width),
      height: Number(draft.value.outputSize.height),
    },
  })
  open.value = false
}
async function selectOutput() {
  try {
    const path = await window.electron.selectFolder({
      title: t('dialogs.selectOutputFolder'),
      defaultPath: draft.value.outputPath,
    })
    if (path) draft.value.outputPath = path
  } catch (error) {
    toast.error(String(error))
  }
}
async function selectAudio() {
  try {
    if (draft.value.bgmMode === 'random') {
      const path = await window.electron.selectFolder({
        title: t('dialogs.selectBgmFolder'),
        defaultPath: draft.value.bgmPath,
      })
      if (path) draft.value.bgmPath = path
    } else {
      const path = await window.electron.selectAudioFile({
        title: t('renderSettings.audioFile'),
        defaultPath: draft.value.bgmFile,
      })
      if (path) draft.value.bgmFile = path
    }
  } catch (error) {
    toast.error(String(error))
  }
}
</script>

<style scoped>
.config-body {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1.1fr);
  gap: 24px;
  height: min(620px, 65vh);
  min-height: 0;
  overflow: hidden !important;
  padding-top: 8px !important;
}
.config-preview {
  min-height: 0;
  min-width: 0;
}
.config-settings {
  display: flex;
  flex-direction: column;
  min-height: 0;
  min-width: 0;
}
.config-settings > .v-tabs {
  /* Vuetify's grow also sets flex-grow on the tab bar itself. In this column
     layout it must only expand the tab buttons horizontally, not the bar height. */
  flex: 0 0 auto;
}
.config-fields {
  flex: 1 1 0;
  overflow-y: auto;
  min-height: 0;
  padding: 20px 16px 16px;
}
.fields {
  display: flex;
  flex-direction: column;
  justify-content: flex-start;
  gap: 20px;
}
.fields :deep(.v-input) {
  flex: 0 0 auto;
}
.subtitle-section {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 16px;
  border: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
  border-radius: 8px;
}
.subtitle-section h3 {
  font-size: 14px;
  font-weight: 600;
}
.color-field {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.color-field input {
  width: 64px;
  height: 32px;
  cursor: pointer;
}
@media (max-width: 600px) {
  .config-body {
    grid-template-columns: minmax(0, 1fr);
    grid-template-rows: minmax(100px, 0.7fr) minmax(0, 1fr);
    gap: 8px;
    height: 70vh;
  }
}
</style>
