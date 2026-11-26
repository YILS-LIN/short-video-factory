<template>
  <div class="provider-panel">
    <div class="provider-search-bar" :class="{ 'provider-search-bar--scrolled': scrollTop > 0 }">
      <div class="provider-search">
        <v-icon icon="mdi-magnify" size="20" />
        <input
          ref="searchInput"
          v-model="query"
          type="search"
          :placeholder="t('features.llm.config.searchProviders')"
          :aria-label="t('features.llm.config.searchProviders')"
        />
      </div>
    </div>
    <div ref="results" class="provider-results" @scroll="updateScrollTop">
      <p v-if="!visibleGroups.length" class="provider-empty" role="status">
        {{ t('features.llm.config.noProvidersFound') }}
      </p>
      <div
        v-for="group in visibleGroups"
        :key="group.id"
        :class="['provider-group', `provider-group--${group.id}`]"
      >
        <div v-if="group.title" class="provider-label provider-group-title">
          {{ group.title }}
        </div>
        <div class="provider-grid">
          <button
            v-for="item in group.items"
            :key="item.id"
            type="button"
            class="provider-option"
            @click="emit('select', item.id)"
          >
            <span>{{ item.title }}</span>
            <v-icon icon="mdi-chevron-right" size="16" />
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useTranslation } from 'i18next-vue'
import type { ProviderPreset } from '@/lib/llm/provider-presets'

const props = defineProps<{
  groups: { partners: readonly ProviderPreset[]; common: readonly ProviderPreset[] }
}>()
const emit = defineEmits<{ select: [id: string] }>()
const { i18next, t } = useTranslation()
const query = defineModel<string>('query', { required: true })
const scrollTop = defineModel<number>('scrollTop', { required: true })
const searchInput = ref<HTMLInputElement>()
const results = ref<HTMLElement>()
const updateScrollTop = () => {
  if (results.value) scrollTop.value = results.value.scrollTop
}
onMounted(() => {
  searchInput.value?.focus({ preventScroll: true })
  if (results.value) results.value.scrollTop = scrollTop.value
  updateScrollTop()
})
watch(query, () => {
  if (results.value) results.value.scrollTop = 0
  scrollTop.value = 0
})

const groups = computed(() => {
  const preferChinese = (i18next?.resolvedLanguage ?? 'zh-CN').startsWith('zh')
  const toItem = (preset: ProviderPreset) => ({
    id: preset.id,
    title: (preferChinese && preset.nameZh) || preset.name,
    searchText: [preset.id, preset.name, preset.nameZh, preset.aliases].join(' '),
  })
  const custom = t('features.llm.config.customProvider')
  return [
    {
      id: 'partners',
      title: t('features.llm.config.partnerProviders'),
      items: props.groups.partners.map(toItem),
    },
    {
      id: 'common',
      title: t('features.llm.config.commonProviders'),
      items: props.groups.common.map(toItem),
    },
    { id: 'custom', items: [{ id: 'custom', title: custom, searchText: custom }] },
  ]
})
const visibleGroups = computed(() => {
  const term = query.value.trim().toLocaleLowerCase()
  return groups.value
    .map((group) => ({
      ...group,
      items: group.items.filter(({ searchText }) => searchText.toLocaleLowerCase().includes(term)),
    }))
    .filter(({ items }) => items.length)
})
</script>

<style scoped>
.provider-option {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  min-width: 0;
  text-align: start;
  border-radius: 8px;
}
.provider-label {
  font-size: 0.75rem;
  color: rgba(var(--v-theme-on-surface), 0.7);
}
.provider-panel {
  display: flex;
  flex-direction: column;
  min-height: 0;
}
.provider-search-bar {
  flex: 0 0 auto;
  padding: 4px var(--llm-config-gutter) 8px;
  border-bottom: 1px solid transparent;
}
.provider-search-bar--scrolled {
  border-bottom-color: rgba(var(--v-theme-on-surface), 0.12);
}
.provider-search {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 10px;
  border-radius: 8px;
  background: rgba(var(--v-theme-on-surface), 0.06);
}
.provider-search:focus-within,
.provider-option:focus-visible {
  outline: 2px solid rgb(var(--v-theme-primary));
  outline-offset: 1px;
}
.provider-option:focus-visible {
  outline-offset: -2px;
}
.provider-search input {
  width: 100%;
  min-height: 38px;
  outline: none;
  font-size: 0.875rem;
}
.provider-results {
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
  padding: 0 var(--llm-config-gutter) 8px;
}
.provider-group + .provider-group {
  margin-top: 8px;
}
.provider-group-title {
  padding: 4px 8px;
  font-weight: 600;
}
.provider-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 3px;
}
.provider-group--partners .provider-grid,
.provider-group--custom .provider-grid {
  grid-template-columns: minmax(0, 1fr);
}
.provider-group--partners .provider-option {
  color: rgb(var(--v-theme-primary));
  background: rgba(var(--v-theme-primary), 0.08);
}
.provider-option {
  justify-content: space-between;
  min-height: 36px;
  padding: 6px 8px;
  font-size: 0.875rem;
  overflow-wrap: anywhere;
}
.provider-option:hover {
  background: rgba(var(--v-theme-primary), 0.14);
}
.provider-group--custom:not(:first-child) {
  padding-top: 6px;
  border-top: 1px solid rgba(var(--v-theme-on-surface), 0.12);
}
.provider-empty {
  padding: 12px 8px;
  font-size: 0.875rem;
  color: rgba(var(--v-theme-on-surface), 0.7);
}
@media (max-width: 420px) {
  .provider-grid {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
