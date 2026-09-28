// @vitest-environment jsdom
import { flushPromises, mount } from '@vue/test-utils'
import { defineComponent, h, reactive } from 'vue'
import { createVuetify } from 'vuetify'
import { VApp } from 'vuetify/components'
import * as components from 'vuetify/components'
import * as directives from 'vuetify/directives'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import TextGenerate from '../../src/views/Home/components/TextGenerate.vue'
import { defaultCopywritingConfig, defaultLlmConfig } from '../../src/lib/llm/config'
import type { CopywritingStatus, LlmConfig } from '../../src/lib/llm/types'

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

const createHost = () => {
  const storeState = reactive({
    prompt: '写一句欢迎语',
    llmConfig: validConfig(),
    copywritingConfig: defaultCopywritingConfig(),
    copywritingStatus: 'idle' as CopywritingStatus,
    updateLLMConfig(config: LlmConfig) {
      this.llmConfig = config
    },
    updateCopywritingConfig(config: ReturnType<typeof defaultCopywritingConfig>) {
      this.copywritingConfig = config
    },
    updateCopywritingStatus(status: CopywritingStatus) {
      this.copywritingStatus = status
    },
  })
  mocks.appStore = storeState

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
    )

  return { wrapper, storeState, findDialogButton }
}

describe('TextGenerate configuration and request lifecycle', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.generateCopywriting.mockReset()
  })

  it('keeps the real Vuetify stop control enabled while a connection test is pending', async () => {
    const { wrapper, findDialogButton } = createHost()
    const deferred = createDeferred<{ text: string; status: 'completed' }>()
    mocks.generateCopywriting.mockReturnValue(deferred.promise)
    try {
      const configButton = [...document.body.querySelectorAll('button')].find((button) =>
        button.textContent?.includes('common.buttons.config'),
      )
      expect(configButton).toBeTruthy()
      configButton!.click()
      await flushPromises()

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
    const { wrapper, findDialogButton } = createHost()
    const first = createDeferred<{ text: string; status: 'completed' }>()
    const second = createDeferred<{ text: string; status: 'completed' }>()
    mocks.generateCopywriting.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise)
    try {
      findDialogButton('common.buttons.config')!.click()
      await flushPromises()

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

  it('cancels pending tests on dialog close and restores the saved configuration on reopen', async () => {
    const { wrapper, storeState, findDialogButton } = createHost()
    const deferred = createDeferred<{ text: string; status: 'completed' }>()
    mocks.generateCopywriting.mockReturnValue(deferred.promise)
    try {
      findDialogButton('common.buttons.config')!.click()
      await flushPromises()
      findDialogButton('common.buttons.test')!.click()
      await flushPromises()
      const signal = (mocks.generateCopywriting.mock.calls[0][0] as { abortSignal: AbortSignal })
        .abortSignal

      findDialogButton('common.buttons.close')!.click()
      await flushPromises()
      expect(signal.aborted).toBe(true)
      expect(storeState.llmConfig.apiUrl).toBe('https://example.com/v1')

      findDialogButton('common.buttons.config')!.click()
      await flushPromises()
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
    const { wrapper, storeState, findDialogButton } = createHost()
    try {
      findDialogButton('common.buttons.config')!.click()
      await flushPromises()
      const modelField = wrapper
        .findAllComponents({ name: 'VTextField' })
        .find((field) => String(field.props('label')).includes('features.llm.config.modelName'))
      await modelField!.setValue('saved-model')
      findDialogButton('common.buttons.save')!.click()
      await flushPromises()

      expect(storeState.llmConfig.modelName).toBe('saved-model')
      findDialogButton('common.buttons.config')!.click()
      await flushPromises()
      const reopenedModelField = wrapper
        .findAllComponents({ name: 'VTextField' })
        .find((field) => String(field.props('label')).includes('features.llm.config.modelName'))
      expect(reopenedModelField?.props('modelValue')).toBe('saved-model')
    } finally {
      wrapper.unmount()
      document.body.innerHTML = ''
    }
  })

  it('does not let the close reset overwrite a draft reopened in the same tick', async () => {
    const { wrapper, findDialogButton } = createHost()
    try {
      findDialogButton('common.buttons.config')!.click()
      await flushPromises()
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
    const { wrapper, findDialogButton } = createHost()
    const first = createDeferred<{ text: string; status: 'completed' }>()
    const second = createDeferred<{ text: string; status: 'completed' }>()
    mocks.generateCopywriting.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise)
    try {
      findDialogButton('common.buttons.config')!.click()
      await flushPromises()
      findDialogButton('common.buttons.test')!.click()
      await flushPromises()
      const firstSignal = (
        mocks.generateCopywriting.mock.calls[0][0] as { abortSignal: AbortSignal }
      ).abortSignal

      wrapper.findComponent({ name: 'VDialog' }).vm.$emit('update:modelValue', false)
      await flushPromises()
      expect(firstSignal.aborted).toBe(true)

      findDialogButton('common.buttons.config')!.click()
      await flushPromises()
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
    const { wrapper, findDialogButton } = createHost()
    const deferred = createDeferred<{ text: string; status: 'completed' }>()
    mocks.generateCopywriting.mockReturnValue(deferred.promise)
    try {
      findDialogButton('common.buttons.config')!.click()
      await flushPromises()
      findDialogButton('common.buttons.test')!.click()
      await flushPromises()
      const signal = (mocks.generateCopywriting.mock.calls[0][0] as { abortSignal: AbortSignal })
        .abortSignal
      const modelField = wrapper
        .findAllComponents({ name: 'VTextField' })
        .find((field) => String(field.props('label')).includes('features.llm.config.modelName'))

      await modelField!.setValue('next-model')
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
    const { wrapper, storeState, findDialogButton } = createHost()
    try {
      findDialogButton('common.buttons.config')!.click()
      await flushPromises()
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
      findDialogButton('common.buttons.save')!.click()
      expect(mocks.toast.warning).toHaveBeenCalledWith('features.llm.config.apiUrlRequired')
      expect(storeState.llmConfig.apiUrl).toBe('https://example.com/v1')
    } finally {
      wrapper.unmount()
      document.body.innerHTML = ''
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

      for (const status of ['generating', 'cancelled', 'failed', 'truncated'] as const) {
        storeState.copywritingStatus = status
        await expect(exposed.getTextForSynthesis()).rejects.toThrow()
      }

      storeState.copywritingStatus = 'completed'
      await expect(exposed.getTextForSynthesis()).resolves.toBe('朗读正文')
      storeState.copywritingStatus = 'edited'
      await expect(exposed.getTextForSynthesis()).resolves.toBe('朗读正文')
    } finally {
      wrapper.unmount()
      document.body.innerHTML = ''
    }
  })
})
