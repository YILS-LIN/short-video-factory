<template>
  <div class="safe-markdown" @click="handleClick" v-html="renderedMarkdown"></div>
</template>

<script lang="ts" setup>
import { computed } from 'vue'
import { renderSafeMarkdown } from '@/lib/safe-markdown'

const props = defineProps<{ source: string }>()

const renderedMarkdown = computed(() => renderSafeMarkdown(props.source))

const handleClick = (event: MouseEvent) => {
  const target = event.target
  if (!(target instanceof Element)) return
  const anchor = target.closest<HTMLAnchorElement>('a[data-external-url]')
  const url = anchor?.dataset['externalUrl']
  if (!url) return

  event.preventDefault()
  void window.electron.openExternal({ url }).catch((error) => {
    console.error('Failed to open Markdown link:', error)
  })
}
</script>

<style scoped lang="scss">
.safe-markdown {
  overflow-wrap: anywhere;
  line-height: 1.7;

  :deep(p) {
    margin: 0 0 12px;
  }

  :deep(h1),
  :deep(h2),
  :deep(h3),
  :deep(h4),
  :deep(h5),
  :deep(h6) {
    margin: 0 0 12px;
    line-height: 1.35;
  }

  :deep(ul),
  :deep(ol) {
    margin: 0 0 12px;
    padding-inline-start: 22px;
  }

  :deep(li + li) {
    margin-top: 6px;
  }

  :deep(blockquote) {
    margin: 0 0 12px;
    padding-inline-start: 12px;
    border-inline-start: 3px solid rgba(var(--v-theme-primary), 0.5);
    color: rgba(var(--v-theme-on-surface), 0.72);
  }

  :deep(pre) {
    overflow-x: auto;
    padding: 12px;
    border-radius: 8px;
    background: rgba(var(--v-theme-on-surface), 0.06);
  }

  :deep(code) {
    overflow-wrap: anywhere;
  }

  :deep(a[data-external-url]) {
    color: rgb(var(--v-theme-primary));
    text-decoration: underline;
    text-underline-offset: 2px;
  }

  :deep(:last-child) {
    margin-bottom: 0;
  }
}
</style>
