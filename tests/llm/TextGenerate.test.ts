// @vitest-environment jsdom
import { flushPromises, mount } from '@vue/test-utils'
import { defineComponent, h } from 'vue'
import { createPinia } from 'pinia'
import { createVuetify } from 'vuetify'
import { VApp, VAutocomplete } from 'vuetify/components'
import * as components from 'vuetify/components'
import * as directives from 'vuetify/directives'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import TextGenerate from '../../src/views/Home/components/TextGenerate.vue'
import DurationEstimate from '../../src/views/Home/components/DurationEstimate.vue'
import { defaultLlmConfig } from '../../src/lib/llm/config'
import type { LlmConfig } from '../../src/lib/llm/types'
import { useAppStore } from '../../src/store/app'

const mocks = vi.hoisted(() => ({
  appStore: {} as Record<string, unknown>,
  generateCopywriting: vi.fn(),
  toast: {
    error: vi.fn(),
    success: vi.fn(),
    warning: vi.fn(),
  },
}))

vi.mock('@/store', () => ({ useAppStore: () => mocks.appStore }))
vi.mock('@/lib/llm/generate', () => ({
  generateCopywriting: (...args: unknown[]) => mocks.generateCopywriting(...args),
}))
vi.mock('@/lib/llm/generate-diverse', () => ({
  generateDiverseCopywriting: (...args: unknown[]) => mocks.generateCopywriting(...args),
}))
vi.mock('i18next-vue', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))
vi.mock('vue-toastification', () => ({ useToast: () => mocks.toast }))

const validConfig = (): LlmConfig => ({
  ...defaultLlmConfig(),
  apiUrl: 'https://example.com/v1',
  apiKey: 'test-secret',
  modelName: 'test-model',
})

const createDeferred = <T>() => {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

const createHost = (llmConfig = validConfig()) => {
  const storeState = useAppStore(createPinia())
  storeState.prompt = '写一句欢迎语'
  storeState.updateLLMConfig(llmConfig)
  mocks.appStore = storeState as unknown as Record<string, unknown>

  const Host = defineComponent({
    setup() {
      return () => h(VApp, {}, () => h(TextGenerate))
    },
  })
  const vuetify = createVuetify({ components, directives })
  const wrapper = mount(Host, {
    attachTo: document.body,
    global: { plugins: [vuetify] },
  })

  const findDialogButton = (text: string) =>
    [...document.body.querySelectorAll('button')].find((button) =>
      button.textContent?.includes(text),
    ) ?? document.body.querySelector<HTMLButtonElement>(`button[aria-label="${text}"]`)

  const openProviderPicker = async () => {
    findDialogButton('features.llm.config.addProvider')!.click()
    await flushPromises()
    return document.body.querySelector<HTMLElement>('.provider-panel')!
  }
  const editSelected = async () => {
    document
      .querySelector<HTMLButtonElement>(
        '.saved-provider-row:has([aria-pressed="true"]) button[aria-label="features.llm.config.editProvider"]',
      )!
      .click()
    await flushPromises()
  }
  const openEditor = async () => {
    findDialogButton('common.buttons.config')!.click()
    await flushPromises()
    await editSelected()
  }
  const openModelEditor = async () => {
    findDialogButton('features.llm.config.addModel')!.click()
    await flushPromises()
  }

  return {
    wrapper,
    storeState,
    findDialogButton,
    openProviderPicker,
    openEditor,
    editSelected,
    openModelEditor,
  }
}

describe('TextGenerate configuration and request lifecycle', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.generateCopywriting.mockReset()
  })

  it.each([
    ['https://long-instance-name.region.example.com/v1', 'features.llm.config.defaultProviderName'],
    ['https://api.deepseek.com', 'DeepSeek（深度求索）'],
  ])('shows a short title for an unnamed migrated provider at %s', async (apiUrl, title) => {
    const { wrapper, storeState, findDialogButton, openEditor } = createHost({
      ...validConfig(),
      apiUrl,
    })
    try {
      await openEditor()
      const nameField = wrapper
        .findAllComponents({ name: 'VTextField' })
        .find((field) => field.props('label') === 'features.llm.config.providerName')!
      expect(nameField.props('placeholder')).toBe(title)
      findDialogButton('features.llm.config.saveProviderChanges')!.click()
      await flushPromises()
      expect(document.querySelector('.saved-provider-name')?.textContent).toBe(title)
      expect(document.querySelector('.provider-footer-status strong')?.textContent?.trim()).toBe(
        `${title} / test-model`,
      )
      expect(storeState.providerProfiles[0].name).toBe('')
      expect(storeState.llmConfig.apiUrl).toBe(apiUrl)
    } finally {
      wrapper.unmount()
      document.body.innerHTML = ''
    }
  })

  it('keeps official Zhipu models selectable when discovery returns an empty list', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ data: [] }) }),
    )
    const { wrapper, findDialogButton, openProviderPicker, openModelEditor } = createHost()
    try {
      findDialogButton('common.buttons.config')!.click()
      await flushPromises()
      const panel = await openProviderPicker()
      const zhipu = [...panel.querySelectorAll<HTMLButtonElement>('.provider-option')].find(
        (button) => button.textContent?.trim() === '智谱 GLM',
      )!
      zhipu.click()
      await flushPromises()
      await openModelEditor()
      findDialogButton('features.llm.config.fetchModels')!.click()
      await flushPromises()
      expect(wrapper.getComponent(VAutocomplete).props('items')).toEqual([
        'glm-4.7-flash',
        'glm-4-flash-250414',
      ])
      expect(document.querySelector('.v-chip[aria-pressed="true"]')?.textContent).toContain(
        'features.llm.config.officialFree',
      )
    } finally {
      wrapper.unmount()
      vi.unstubAllGlobals()
      document.body.innerHTML = ''
    }
  })

  it('tests the saved card and clears its result when its model changes', async () => {
    const { wrapper, findDialogButton, editSelected, openModelEditor } = createHost()
    mocks.generateCopywriting.mockResolvedValue({ text: 'ok', status: 'completed' })
    try {
      findDialogButton('common.buttons.config')!.click()
      await flushPromises()
      findDialogButton('common.buttons.test')!.click()
      await flushPromises()
      expect(mocks.generateCopywriting).toHaveBeenCalledWith(
        expect.objectContaining({
          llmConfig: expect.objectContaining({ modelName: 'test-model', apiKey: 'test-secret' }),
        }),
      )
      expect(findDialogButton('features.llm.config.retestPassed')).toBeTruthy()
      expect(
        findDialogButton('features.llm.config.retestPassed')?.querySelector('.mdi-pulse'),
      ).toBeTruthy()
      expect(document.querySelector('.saved-provider-test-status')?.textContent).toContain(
        'features.llm.config.providerTestPassed',
      )
      expect(document.querySelector('.saved-provider-model .saved-provider-active')).toBeTruthy()
      await editSelected()
      await openModelEditor()
      const modelField = wrapper
        .findAllComponents({ name: 'VTextField' })
        .find((field) => field.props('label') === 'features.llm.config.modelName')!
      await modelField.setValue('updated-model')
      findDialogButton('features.llm.config.saveProviderChanges')!.click()
      await flushPromises()
      expect(findDialogButton('features.llm.config.retestPassed')).toBeNull()
      expect(document.querySelector('.saved-provider-active')).toBeNull()
      expect(document.querySelector('.provider-footer-status strong')?.textContent).toContain(
        'test-model',
      )
      expect(findDialogButton('features.llm.config.useProvider')).toBeTruthy()
    } finally {
      wrapper.unmount()
      document.body.innerHTML = ''
    }
  })

  it('clears card test results when the main configuration dialog closes', async () => {
    const { wrapper, findDialogButton } = createHost()
    mocks.generateCopywriting.mockResolvedValue({ text: 'ok', status: 'completed' })
    try {
      findDialogButton('common.buttons.config')!.click()
      await flushPromises()
      findDialogButton('common.buttons.test')!.click()
      await flushPromises()
      expect(findDialogButton('features.llm.config.retestPassed')).toBeTruthy()

      findDialogButton('features.llm.config.finishProviders')!.click()
      await flushPromises()
      findDialogButton('common.buttons.config')!.click()
      await flushPromises()
      expect(findDialogButton('features.llm.config.retestPassed')).toBeNull()
      expect(findDialogButton('common.buttons.test')).toBeTruthy()
    } finally {
      wrapper.unmount()
      document.body.innerHTML = ''
    }
  })

  it('reorders saved providers by their handles without changing which provider is in use', async () => {
    const { wrapper, storeState, findDialogButton } = createHost()
    const activeId = storeState.activeProviderId
    const dragEvent = (type: string) =>
      Object.assign(new MouseEvent(type, { bubbles: true, cancelable: true, clientY: 10 }), {
        dataTransfer: { setData: vi.fn(), setDragImage: vi.fn() },
      })
    try {
      findDialogButton('common.buttons.config')!.click()
      await flushPromises()
      expect(document.querySelector('.saved-provider-drag-handle')).toBeNull()
      storeState.saveProviderProfile({
        id: 'second',
        name: 'Second provider',
        config: { ...validConfig(), modelName: 'second-model' },
        models: ['second-model'],
      })
      await flushPromises()
      const rows = document.querySelectorAll<HTMLElement>('.saved-provider-row')
      const handle = rows[0].querySelector<HTMLButtonElement>('.saved-provider-drag-handle')!
      expect(rows[0].querySelector('.saved-provider-card')?.hasAttribute('draggable')).toBe(false)
      handle.dispatchEvent(dragEvent('dragstart'))
      rows[1].dispatchEvent(dragEvent('dragover'))
      await flushPromises()
      expect(rows[1].classList.contains('saved-provider-row--drop-after')).toBe(true)
      rows[1].dispatchEvent(dragEvent('drop'))
      await flushPromises()
      expect(storeState.providerProfiles.map(({ id }) => id)).toEqual(['second', activeId])
      expect(storeState.activeProviderId).toBe(activeId)
      expect(storeState.llmConfig.modelName).toBe('test-model')
      expect(document.querySelector('.saved-provider-row--drop-after')).toBeNull()

      handle.focus()
      handle.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }))
      await flushPromises()
      expect(storeState.providerProfiles.map(({ id }) => id)).toEqual([activeId, 'second'])
      expect(document.activeElement).toBe(handle)
    } finally {
      wrapper.unmount()
      document.body.innerHTML = ''
    }
  })

  it('keeps card selection separate from activation and preserves saved profiles when adding is cancelled', async () => {
    const { wrapper, findDialogButton, openProviderPicker, storeState } = createHost()
    storeState.saveProviderProfile({
      id: 'second',
      name: 'Second provider',
      config: { ...validConfig(), apiKey: 'second-key', modelName: 'second-model' },
      models: ['second-model'],
    })
    try {
      findDialogButton('common.buttons.config')!.click()
      await flushPromises()
      const cards = document.querySelectorAll<HTMLButtonElement>('.saved-provider-card')
      expect(cards).toHaveLength(2)
      expect(document.querySelector('input[type=password]')).toBeNull()
      const originalActiveId = storeState.activeProviderId
      cards[1].click()
      await flushPromises()
      expect(cards[1].getAttribute('aria-pressed')).toBe('true')
      expect(storeState.activeProviderId).toBe(originalActiveId)

      const panel = await openProviderPicker()
      const custom = [...panel.querySelectorAll<HTMLButtonElement>('.provider-option')].find(
        (button) => button.textContent?.trim() === 'features.llm.config.customProvider',
      )!
      custom.click()
      await flushPromises()
      expect(document.querySelector<HTMLInputElement>('input[type=password]')?.value).toBe('')
      expect(
        findDialogButton('features.llm.config.advancedConnection')?.getAttribute('aria-expanded'),
      ).toBe('true')
      findDialogButton('common.buttons.cancel')!.click()
      await flushPromises()

      expect(storeState.providerProfiles.map((profile) => profile.config.apiKey)).toEqual([
        'test-secret',
        'second-key',
      ])
      expect(
        document.querySelector('.saved-provider-card[aria-pressed="true"]')?.textContent,
      ).toContain('Second provider')
      findDialogButton('features.llm.config.useProvider')!.click()
      expect(storeState.activeProviderId).toBe('second')
    } finally {
      wrapper.unmount()
      document.body.innerHTML = ''
    }
  })

  it('adds models from the provider catalog and from manual entry', async () => {
    const fetchCatalog = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: [{ id: 'catalog-model' }, { id: 'catalog-model' }] }),
    })
    vi.stubGlobal('fetch', fetchCatalog)
    const { wrapper, findDialogButton, storeState, openEditor, openModelEditor } = createHost()
    try {
      await openEditor()
      await openModelEditor()
      findDialogButton('features.llm.config.fetchModels')!.click()
      await flushPromises()
      expect(fetchCatalog).toHaveBeenCalledWith(
        'https://example.com/v1/models',
        expect.objectContaining({ redirect: 'error' }),
      )
      expect(fetchCatalog.mock.calls[0][1].headers.get('authorization')).toBe('Bearer test-secret')
      const modelPicker = wrapper.getComponent(VAutocomplete)
      expect(modelPicker.props('items')).toEqual(['catalog-model'])
      modelPicker.vm.$emit('update:modelValue', 'catalog-model')
      await flushPromises()
      const modelField = wrapper
        .findAllComponents({ name: 'VTextField' })
        .find((field) => String(field.props('label')).includes('features.llm.config.modelName'))!
      await modelField.setValue('manual-model')
      await modelField.get('input').trigger('keydown.enter')
      findDialogButton('features.llm.config.saveProviderChanges')!.click()
      await flushPromises()
      expect(storeState.providerProfiles[0].models).toEqual([
        'test-model',
        'catalog-model',
        'manual-model',
      ])
      expect(storeState.providerProfiles[0].config.modelName).toBe('manual-model')
      expect(storeState.llmConfig.modelName).toBe('test-model')
    } finally {
      wrapper.unmount()
      vi.unstubAllGlobals()
      document.body.innerHTML = ''
    }
  })

  it('keeps the picker search and scroll position when returning from provider configuration', async () => {
    const { wrapper, findDialogButton, openProviderPicker } = createHost()
    try {
      findDialogButton('common.buttons.config')!.click()
      await flushPromises()
      const panel = await openProviderPicker()
      const results = panel.querySelector<HTMLElement>('.provider-results')!
      const search = panel.querySelector('input')!
      search.value = 'deepseek'
      search.dispatchEvent(new Event('input', { bubbles: true }))
      await flushPromises()
      expect(results.contains(search)).toBe(false)
      results.scrollTop = 72
      results.dispatchEvent(new Event('scroll'))
      await flushPromises()
      expect(panel.querySelector('.provider-search-bar--scrolled')).not.toBeNull()

      results.querySelector<HTMLButtonElement>('.provider-option')!.click()
      await flushPromises()
      const back = findDialogButton('features.llm.config.backToProviderPicker')!
      expect(back.closest('.provider-page-heading')?.querySelector('.v-card-title')).not.toBeNull()
      expect(back.closest('.llm-config-body')).toBeNull()
      back.click()
      await flushPromises()

      expect(document.querySelector<HTMLInputElement>('.provider-search input')?.value).toBe(
        'deepseek',
      )
      expect(document.querySelector<HTMLElement>('.provider-results')?.scrollTop).toBe(72)
    } finally {
      wrapper.unmount()
      document.body.innerHTML = ''
    }
  })

  it('keeps the partner preview out of the default provider directory', async () => {
    vi.stubEnv('VITE_PROVIDER_PARTNER_DEMO', '')
    const { wrapper, findDialogButton, openProviderPicker } = createHost()
    try {
      findDialogButton('common.buttons.config')!.click()
      await flushPromises()
      const panel = await openProviderPicker()
      expect(panel.textContent).toContain('智谱 GLM')
      expect(panel.textContent).not.toContain('胜算云')
      const search = (panel: HTMLElement, value: string) => {
        const input = panel.querySelector('input')!
        input.value = value
        input.dispatchEvent(new Event('input', { bubbles: true }))
        return flushPromises()
      }
      await search(panel, 'no matching provider')
      expect(panel.querySelector('[role=status]')?.textContent).toContain('noProvidersFound')
      findDialogButton('common.buttons.cancel')!.click()
      await flushPromises()
      expect(document.querySelector('.provider-panel')).toBeNull()

      const reopenedPanel = await openProviderPicker()
      const input = reopenedPanel.querySelector('input')!
      expect(input.value).toBe('')
      await search(reopenedPanel, 'dashscope')
      const options = [...reopenedPanel.querySelectorAll<HTMLElement>('.provider-option')]
      expect(options.map((option) => option.textContent)).toEqual(['阿里云百炼（通义千问）'])
      options[0].click()
      await flushPromises()
      findDialogButton('features.llm.config.advancedConnection')!.click()
      await flushPromises()
      expect(document.body.textContent).toContain(
        'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',
      )
    } finally {
      wrapper.unmount()
      vi.unstubAllEnvs()
      document.body.innerHTML = ''
    }
  })

  it('previews the partner first and uses only the new key for testing and generation', async () => {
    vi.stubEnv('VITE_PROVIDER_PARTNER_DEMO', 'true')
    const original = validConfig()
    original.customHeaders = [{ name: 'X-Provider-Token', value: 'old-secret' }]
    const { wrapper, storeState, findDialogButton, openProviderPicker } = createHost(original)
    mocks.generateCopywriting.mockResolvedValue({ text: '欢迎观看本期视频。', status: 'completed' })
    try {
      const choosePartner = async () => {
        const panel = await openProviderPicker()
        const groups = panel.querySelectorAll('.provider-group')
        expect(groups[0].classList.contains('provider-group--partners')).toBe(true)
        expect(groups[1].classList.contains('provider-group--common')).toBe(true)
        const partner = groups[0].querySelector('button')!
        expect(partner.textContent).toContain('胜算云')
        partner.click()
        await flushPromises()
      }
      findDialogButton('common.buttons.config')!.click()
      await flushPromises()
      await choosePartner()
      expect(document.body.textContent).toContain('features.llm.config.partnerPreview')
      findDialogButton('features.llm.config.advancedConnection')!.click()
      await flushPromises()
      expect(document.body.textContent).toContain(
        'https://router.shengsuanyun.com/api/v1/chat/completions',
      )
      const partnerKey = () =>
        document.body.querySelector<HTMLInputElement>('input[type=password]')!
      expect(partnerKey().value).toBe('')
      findDialogButton('common.buttons.cancel')!.click()
      await flushPromises()
      expect(storeState.llmConfig).toEqual(original)

      await choosePartner()
      partnerKey().value = 'new-test-secret'
      partnerKey().dispatchEvent(new Event('input', { bubbles: true }))
      findDialogButton('common.buttons.test')!.click()
      await flushPromises()
      const partnerConfig = {
        apiUrl: 'https://router.shengsuanyun.com/api/v1',
        protocol: 'openai-compatible',
        modelName: 'deepseek/deepseek-v4-flash',
        apiKey: 'new-test-secret',
        customHeaders: [],
      }
      expect(mocks.generateCopywriting).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({ llmConfig: expect.objectContaining(partnerConfig) }),
      )
      expect(document.body.textContent).toContain('features.llm.success.connectionSucceeded')
      expect(storeState.llmConfig).toEqual(original)
      findDialogButton('features.llm.config.createProvider')!.click()
      await flushPromises()
      expect(storeState.llmConfig).toEqual(original)
      findDialogButton('features.llm.config.useProvider')!.click()
      await flushPromises()
      expect(storeState.llmConfig).toMatchObject(partnerConfig)
      findDialogButton('common.buttons.generate')!.click()
      await flushPromises()
      expect(mocks.generateCopywriting).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({ llmConfig: expect.objectContaining(partnerConfig) }),
      )
    } finally {
      wrapper.unmount()
      vi.unstubAllEnvs()
      document.body.innerHTML = ''
    }
  })

  it('keeps the configuration tabs outside the scroll body and resets scroll on tab changes', async () => {
    const { wrapper, findDialogButton } = createHost()
    try {
      findDialogButton('common.buttons.config')!.click()
      await flushPromises()
      const card = document.body.querySelector('.llm-config-card')!
      const tabs = card.querySelector('.llm-config-tabs')!
      const body = card.querySelector('.llm-config-body')!
      expect(tabs.parentElement).toBe(card)
      expect(body.contains(tabs)).toBe(false)
      expect(card.querySelector('.v-card-actions')!.parentElement).toBe(card)
      body.scrollTop = 120
      findDialogButton('features.llm.config.copywritingTab')!.click()
      await flushPromises()
      const advancedBody = card.querySelector('.llm-config-body')!
      expect(advancedBody).not.toBe(body)
      expect(advancedBody.scrollTop).toBe(0)
      expect(card.querySelector('.llm-config-tabs')).toBe(tabs)
    } finally {
      wrapper.unmount()
      document.body.innerHTML = ''
    }
  })

  it('focuses the custom prompt after selecting its mode and saves typed text', async () => {
    const { wrapper, storeState, findDialogButton } = createHost()
    try {
      findDialogButton('common.buttons.config')!.click()
      await flushPromises()
      findDialogButton('features.llm.config.copywritingTab')!.click()
      await flushPromises()
      const opener = document.body.querySelector('.llm-config-panel .v-select .v-field')!
      opener.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
      await flushPromises()
      const custom = [...document.body.querySelectorAll<HTMLElement>('.v-list-item')].find(
        (item) => item.textContent?.trim() === 'features.llm.config.custom',
      )
      expect(custom).toBeDefined()
      custom!.click()
      await vi.waitFor(() => {
        const prompt = document.body.querySelector<HTMLTextAreaElement>(
          'textarea[aria-label="features.llm.config.customPrompt"]',
        )
        expect(prompt).not.toBeNull()
        expect(document.activeElement).toBe(prompt)
      })
      const prompt = document.activeElement as HTMLTextAreaElement
      prompt.value = '自定义口播提示词'
      prompt.dispatchEvent(new Event('input', { bubbles: true }))
      await flushPromises()
      findDialogButton('common.buttons.save')!.click()
      await flushPromises()
      expect(storeState.copywritingConfig.customSystemPrompt).toBe('自定义口播提示词')
    } finally {
      wrapper.unmount()
      document.body.innerHTML = ''
    }
  })

  it('defaults to recognizing thinking tags and saves a manual opt-out', async () => {
    const { wrapper, storeState, findDialogButton, openEditor } = createHost()
    try {
      await openEditor()
      const toggle = document.body.querySelector<HTMLInputElement>(
        '.llm-config-panel .v-switch input[type="checkbox"]',
      )!
      expect(toggle.checked).toBe(true)
      toggle.click()
      await flushPromises()
      findDialogButton('features.llm.config.saveProviderChanges')!.click()
      await flushPromises()
      expect(storeState.providerProfiles[0].config.decodeLeadingThink).toBe(false)
      expect(storeState.llmConfig.decodeLeadingThink).toBe(true)
    } finally {
      wrapper.unmount()
      document.body.innerHTML = ''
    }
  })

  it('lays out advanced pairs and header rows separately while preserving header editing', async () => {
    const { wrapper, storeState, findDialogButton, openEditor } = createHost()
    try {
      await openEditor()
      expect(document.body.querySelectorAll('.llm-config-grid')).toHaveLength(2)
      findDialogButton('common.buttons.add')!.click()
      await flushPromises()
      const row = document.body.querySelector('.llm-header-row')!
      const inputs = row.querySelectorAll('input')
      expect(inputs).toHaveLength(2)
      expect(row.querySelector('.llm-header-remove')).not.toBeNull()
      for (const [index, value] of ['X-Trace', 'trace-value'].entries()) {
        inputs[index].value = value
        inputs[index].dispatchEvent(new Event('input', { bubbles: true }))
      }
      await flushPromises()
      findDialogButton('features.llm.config.saveProviderChanges')!.click()
      await flushPromises()
      expect(storeState.providerProfiles[0].config.customHeaders).toEqual([
        { name: 'X-Trace', value: 'trace-value' },
      ])
    } finally {
      wrapper.unmount()
      document.body.innerHTML = ''
    }
  })

  it('keeps the real Vuetify stop control enabled while a connection test is pending', async () => {
    const { wrapper, findDialogButton, openEditor } = createHost()
    const deferred = createDeferred<{ text: string; status: 'completed' }>()
    mocks.generateCopywriting.mockReturnValue(deferred.promise)
    try {
      await openEditor()

      const testButton = findDialogButton('common.buttons.test')
      expect(testButton).toBeTruthy()
      testButton!.click()
      await flushPromises()

      const requestOptions = mocks.generateCopywriting.mock.calls[0][0] as {
        abortSignal: AbortSignal
      }
      const stopButton = findDialogButton('common.buttons.stop')
      expect(stopButton).toBeTruthy()
      expect(stopButton?.tagName).toBe('BUTTON')
      expect((stopButton as HTMLButtonElement).disabled).toBe(false)
      expect((stopButton as HTMLButtonElement).type).toBe('button')
      expect((stopButton as HTMLButtonElement).tabIndex).toBeGreaterThanOrEqual(0)

      stopButton!.click()
      expect(requestOptions.abortSignal.aborted).toBe(true)
      deferred.resolve({ text: 'late result', status: 'completed' })
      await flushPromises()
      expect(document.body.textContent).not.toContain('features.llm.success.connectionSucceeded')
    } finally {
      wrapper.unmount()
      document.body.innerHTML = ''
    }
  })

  it('isolates an older request finalizer from a newer connection test', async () => {
    const { wrapper, findDialogButton, openEditor } = createHost()
    const first = createDeferred<{ text: string; status: 'completed' }>()
    const second = createDeferred<{ text: string; status: 'completed' }>()
    mocks.generateCopywriting.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise)
    try {
      await openEditor()

      const restartButton = findDialogButton('common.buttons.test')
      expect(restartButton, document.body.textContent ?? '').toBeTruthy()
      restartButton!.click()
      await flushPromises()
      const firstSignal = (
        mocks.generateCopywriting.mock.calls[0][0] as { abortSignal: AbortSignal }
      ).abortSignal
      findDialogButton('common.buttons.stop')!.click()
      expect(firstSignal.aborted).toBe(true)
      await flushPromises()

      const retryButton = findDialogButton('common.buttons.test')
      expect(retryButton, document.body.textContent ?? '').toBeTruthy()
      retryButton!.click()
      await flushPromises()
      const secondSignal = (
        mocks.generateCopywriting.mock.calls[1][0] as {
          abortSignal: AbortSignal
        }
      ).abortSignal
      first.resolve({ text: 'late A', status: 'completed' })
      await flushPromises()

      expect(secondSignal.aborted).toBe(false)
      expect(findDialogButton('common.buttons.stop')).toBeTruthy()
      second.resolve({ text: 'success B', status: 'completed' })
      await flushPromises()
      expect(document.body.textContent).toContain('features.llm.success.connectionSucceeded')
    } finally {
      wrapper.unmount()
      document.body.innerHTML = ''
    }
  })

  it('cancels pending tests on editor cancel and restores the saved configuration on edit', async () => {
    const { wrapper, storeState, findDialogButton, openEditor, editSelected } = createHost()
    const deferred = createDeferred<{ text: string; status: 'completed' }>()
    mocks.generateCopywriting.mockReturnValue(deferred.promise)
    try {
      await openEditor()
      findDialogButton('common.buttons.test')!.click()
      await flushPromises()
      const signal = (mocks.generateCopywriting.mock.calls[0][0] as { abortSignal: AbortSignal })
        .abortSignal

      findDialogButton('common.buttons.cancel')!.click()
      await flushPromises()
      expect(signal.aborted).toBe(true)
      expect(storeState.llmConfig.apiUrl).toBe('https://example.com/v1')

      await editSelected()
      const apiUrlInput = [...document.body.querySelectorAll('input')].find((input) => {
        const label = input.id ? document.querySelector(`label[for="${input.id}"]`) : null
        return label?.textContent?.includes('features.llm.config.apiUrl')
      })
      expect(apiUrlInput?.value).toBe('https://example.com/v1')
    } finally {
      wrapper.unmount()
      document.body.innerHTML = ''
    }
  })

  it('saves edited connection settings and reloads the saved values on the next open', async () => {
    const { wrapper, storeState, findDialogButton, openEditor, editSelected, openModelEditor } =
      createHost()
    try {
      await openEditor()
      await openModelEditor()
      const modelField = wrapper
        .findAllComponents({ name: 'VTextField' })
        .find((field) => String(field.props('label')).includes('features.llm.config.modelName'))
      await modelField!.setValue('saved-model')
      findDialogButton('features.llm.config.saveProviderChanges')!.click()
      await flushPromises()

      expect(storeState.llmConfig.modelName).toBe('test-model')
      expect(
        document.querySelector('.saved-provider-card[aria-pressed="true"]')?.textContent,
      ).toContain('saved-model')
      await editSelected()
      expect(document.querySelector('.v-chip[aria-pressed="true"]')?.textContent).toContain(
        'saved-model',
      )
    } finally {
      wrapper.unmount()
      document.body.innerHTML = ''
    }
  })

  it('provides optional sampling controls and restores model defaults', async () => {
    const { wrapper, storeState, findDialogButton, openEditor } = createHost()
    try {
      await openEditor()

      const temperatureField = wrapper
        .findAllComponents({ name: 'VTextField' })
        .find((field) => String(field.props('label')).includes('features.llm.config.temperature'))
      expect(temperatureField?.props('modelValue')).toBeUndefined()
      await temperatureField!.setValue('0.7')
      expect(temperatureField!.props('modelValue')).toBe(0.7)

      findDialogButton('features.llm.config.restoreSamplingDefaults')!.click()
      await flushPromises()
      expect(temperatureField!.props('modelValue')).toBeUndefined()

      findDialogButton('features.llm.config.saveProviderChanges')!.click()
      expect(storeState.llmConfig.temperature).toBeUndefined()
      expect(storeState.llmConfig.topP).toBeUndefined()
    } finally {
      wrapper.unmount()
      document.body.innerHTML = ''
    }
  })

  it('does not let the close reset overwrite a draft reopened in the same tick', async () => {
    const { wrapper, openEditor } = createHost()
    try {
      await openEditor()
      const apiUrlField = wrapper
        .findAllComponents({ name: 'VTextField' })
        .find((field) => String(field.props('label')).includes('features.llm.config.apiUrl'))
      await apiUrlField!.setValue('https://draft.example/v1')

      const dialog = wrapper.findComponent({ name: 'VDialog' })
      dialog.vm.$emit('update:modelValue', false)
      dialog.vm.$emit('update:modelValue', true)
      await flushPromises()

      expect(apiUrlField!.props('modelValue')).toBe('https://draft.example/v1')
    } finally {
      wrapper.unmount()
      document.body.innerHTML = ''
    }
  })

  it('cancels on programmatic dialog close and component unmount', async () => {
    const { wrapper, findDialogButton, openEditor } = createHost()
    const first = createDeferred<{ text: string; status: 'completed' }>()
    const second = createDeferred<{ text: string; status: 'completed' }>()
    mocks.generateCopywriting.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise)
    try {
      await openEditor()
      findDialogButton('common.buttons.test')!.click()
      await flushPromises()
      const firstSignal = (
        mocks.generateCopywriting.mock.calls[0][0] as { abortSignal: AbortSignal }
      ).abortSignal

      wrapper.findComponent({ name: 'VDialog' }).vm.$emit('update:modelValue', false)
      await flushPromises()
      expect(firstSignal.aborted).toBe(true)

      await openEditor()
      findDialogButton('common.buttons.test')!.click()
      await flushPromises()
      const secondSignal = (
        mocks.generateCopywriting.mock.calls[1][0] as {
          abortSignal: AbortSignal
        }
      ).abortSignal

      wrapper.unmount()
      expect(secondSignal.aborted).toBe(true)
      second.resolve({ text: 'late after unmount', status: 'completed' })
      await flushPromises()
      expect(mocks.toast.error).not.toHaveBeenCalled()
    } finally {
      wrapper.unmount()
      document.body.innerHTML = ''
    }
  })

  it('cancels generation and ignores its late result after component unmount', async () => {
    const { wrapper } = createHost()
    const deferred = createDeferred<{ text: string; status: 'cancelled' }>()
    mocks.generateCopywriting.mockReturnValue(deferred.promise)
    const component = wrapper.findComponent(TextGenerate)
    const exposed = component.vm.$.exposed as { handleGenerate(): Promise<string> }
    const result = exposed.handleGenerate()
    await flushPromises()
    const signal = (mocks.generateCopywriting.mock.calls[0][0] as { abortSignal: AbortSignal })
      .abortSignal

    wrapper.unmount()
    expect(signal.aborted).toBe(true)
    deferred.resolve({ text: '', status: 'cancelled' })
    await expect(result).resolves.toBe('')
    expect(mocks.toast.error).not.toHaveBeenCalled()
    document.body.innerHTML = ''
  })

  it('invalidates a pending connection test immediately when its configuration changes', async () => {
    const { wrapper, findDialogButton, openEditor, openModelEditor } = createHost()
    const deferred = createDeferred<{ text: string; status: 'completed' }>()
    mocks.generateCopywriting.mockReturnValue(deferred.promise)
    try {
      await openEditor()
      await openModelEditor()
      findDialogButton('common.buttons.test')!.click()
      await flushPromises()
      const signal = (mocks.generateCopywriting.mock.calls[0][0] as { abortSignal: AbortSignal })
        .abortSignal
      const modelField = wrapper
        .findAllComponents({ name: 'VTextField' })
        .find((field) => String(field.props('label')).includes('features.llm.config.modelName'))

      await modelField!.setValue('next-model')
      await modelField!.get('input').trigger('keydown.enter')
      expect(signal.aborted).toBe(true)
      deferred.resolve({ text: 'stale result', status: 'completed' })
      await flushPromises()
      expect(document.body.textContent).not.toContain('features.llm.success.connectionSucceeded')
    } finally {
      wrapper.unmount()
      document.body.innerHTML = ''
    }
  })

  it('redacts errors before they are rethrown to the Home render pipeline', async () => {
    const { wrapper, storeState } = createHost()
    storeState.llmConfig.apiKey = 'sk-live-secret'
    mocks.generateCopywriting.mockRejectedValue(new Error('provider rejected sk-live-secret'))
    try {
      const component = wrapper.findComponent(TextGenerate)
      const exposed = component.vm.$.exposed as {
        handleGenerate(options: { noToast: boolean; throwOnError: boolean }): Promise<string>
      }

      await expect(exposed.handleGenerate({ noToast: true, throwOnError: true })).rejects.toThrow(
        'provider rejected [REDACTED]',
      )
      expect(mocks.toast.error).not.toHaveBeenCalled()
    } finally {
      wrapper.unmount()
      document.body.innerHTML = ''
    }
  })

  it('shows one sanitized, copyable toast for a normal generation failure', async () => {
    const { wrapper, storeState } = createHost()
    storeState.llmConfig.apiKey = 'sk-copy-secret'
    mocks.generateCopywriting.mockRejectedValue(new Error('provider returned sk-copy-secret'))
    try {
      const component = wrapper.findComponent(TextGenerate)
      const exposed = component.vm.$.exposed as { handleGenerate(): Promise<string> }

      await expect(exposed.handleGenerate()).resolves.toBe('')
      expect(mocks.toast.error).toHaveBeenCalledTimes(1)
      const toast = mocks.toast.error.mock.calls[0][0] as {
        component: { render: () => { props: Record<string, unknown> } }
      }
      const toastProps = toast.component.render().props
      expect(toastProps).toMatchObject({
        message: 'features.llm.errors.generateFailed',
        detail: 'provider returned [REDACTED]',
        actionText: 'common.buttons.copyErrorDetail',
      })
    } finally {
      wrapper.unmount()
      document.body.innerHTML = ''
    }
  })

  it('keeps request URL validation safe when the clearable field emits null', async () => {
    const { wrapper, storeState, findDialogButton, openEditor } = createHost()
    try {
      await openEditor()
      const apiUrlField = wrapper
        .findAllComponents({ name: 'VTextField' })
        .find((field) => String(field.props('label')).includes('features.llm.config.apiUrl'))
      expect(apiUrlField).toBeTruthy()
      const clearable = apiUrlField!.find('.v-field__clearable')
      expect(clearable.exists(), apiUrlField!.html()).toBe(true)
      const clearButton = clearable.find('[role="button"]')
      expect(clearButton.exists(), apiUrlField!.html()).toBe(true)
      await clearButton.trigger('click')
      await flushPromises()
      findDialogButton('features.llm.config.saveProviderChanges')!.click()
      expect(mocks.toast.warning).toHaveBeenCalledWith('features.llm.config.apiUrlRequired')
      expect(storeState.llmConfig.apiUrl).toBe('https://example.com/v1')
    } finally {
      wrapper.unmount()
      document.body.innerHTML = ''
    }
  })

  it('shares the existing input details row with the persistent character counter', async () => {
    vi.useFakeTimers()
    const { wrapper } = createHost()
    try {
      const text = '欢迎来到短视频工厂，今天一起分享生活中的小美好。'
      const outputField = wrapper.findAllComponents({ name: 'VTextarea' }).at(-1)!
      await outputField.setValue(text)
      await vi.advanceTimersByTimeAsync(200)
      const details = outputField.find('.v-input__details')
      const estimate = details.find('[data-testid="duration-estimate"]')
      const counter = details.find('.v-counter')
      expect(estimate.exists()).toBe(true)
      expect(counter.text()).toBe(String(text.length))
      expect(estimate.element.closest('.v-input__details')).toBe(details.element)
      expect(counter.element.closest('.v-input__details')).toBe(details.element)
      expect(outputField.findAll('.v-input__details')).toHaveLength(1)
      expect(wrapper.findAllComponents(DurationEstimate)).toHaveLength(1)
    } finally {
      wrapper.unmount()
      document.body.innerHTML = ''
      vi.useRealTimers()
    }
  })

  it('allows TTS text only from completed or edited states', async () => {
    const { wrapper, storeState } = createHost()
    try {
      const component = wrapper.findComponent(TextGenerate)
      const exposed = component.vm.$.exposed as { getTextForSynthesis(): Promise<string> }
      const outputField = wrapper.findAllComponents({ name: 'VTextarea' }).at(-1)
      expect(outputField).toBeTruthy()
      storeState.copywritingStatus = 'completed'
      await expect(exposed.getTextForSynthesis()).resolves.toBe('')
      await outputField!.setValue('朗读正文')
      const durationEstimate = wrapper.findComponent(DurationEstimate)
      expect(durationEstimate.props('text')).toBe('朗读正文')
      expect(durationEstimate.props('text')).not.toBe(storeState.prompt)

      for (const status of ['generating', 'cancelled', 'failed', 'truncated'] as const) {
        storeState.copywritingStatus = status
        await flushPromises()
        expect(durationEstimate.props('ready')).toBe(false)
        await expect(exposed.getTextForSynthesis()).rejects.toThrow()
      }

      storeState.copywritingStatus = 'completed'
      await flushPromises()
      expect(durationEstimate.props('ready')).toBe(true)
      await expect(exposed.getTextForSynthesis()).resolves.toBe('朗读正文')
      storeState.copywritingStatus = 'edited'
      await expect(exposed.getTextForSynthesis()).resolves.toBe('朗读正文')
    } finally {
      wrapper.unmount()
      document.body.innerHTML = ''
    }
  })
})
