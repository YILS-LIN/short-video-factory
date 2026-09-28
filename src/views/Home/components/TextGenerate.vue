<template>
  <div class="w-full h-full">
    <v-form class="w-full h-full flex flex-col gap-2" :disabled="disabled">
      <v-sheet class="h-[200px] p-2 flex gap-2" border rounded>
        <v-textarea
          v-model="appStore.prompt"
          class="h-full"
          :label="t('features.llm.config.promptLabel')"
          counter
          persistent-counter
          no-resize
        />
        <div class="flex flex-col gap-2">
          <v-btn
            v-if="appStore.copywritingStatus !== 'generating'"
            prepend-icon="mdi-auto-fix"
            color="primary"
            stacked
            :disabled="disabled"
            @click="handleGenerate"
          >
            {{ t('common.buttons.generate') }}
          </v-btn>
          <v-btn v-else prepend-icon="mdi-stop" color="red" stacked @click="handleStopGenerate">
            {{ t('common.buttons.stop') }}
          </v-btn>
          <v-dialog v-model="configDialogShow" max-width="680" persistent>
            <template #activator="{ props: activatorProps }">
              <v-btn v-bind="activatorProps" :disabled="disabled">{{
                t('common.buttons.config')
              }}</v-btn>
            </template>
            <v-card
              prepend-icon="mdi-text-box-edit-outline"
              :title="t('features.llm.config.configTitle')"
            >
              <v-card-text>
                <v-tabs v-model="configTab" color="primary" density="comfortable" fixed-tabs>
                  <v-tab value="connection">{{ t('features.llm.config.connectionTab') }}</v-tab>
                  <v-tab value="copywriting">{{ t('features.llm.config.copywritingTab') }}</v-tab>
                  <v-tab value="advanced">{{ t('features.llm.config.advancedTab') }}</v-tab>
                </v-tabs>
                <v-window v-model="configTab" class="mt-4">
                  <v-window-item value="connection" class="px-1 py-1">
                    <div class="flex flex-col gap-3">
                      <v-select
                        v-model="config.protocol"
                        hide-details
                        :label="t('features.llm.config.protocol')"
                        :items="protocolItems"
                      />
                      <div>
                        <v-text-field
                          v-model="config.apiUrl"
                          hide-details
                          :label="t('features.llm.config.apiUrl')"
                          required
                          clearable
                        />
                        <div v-if="requestUrlHint" class="text-caption text-medium-emphasis mt-1">
                          {{ t('features.llm.config.requestUrl') }}: {{ requestUrlHint }}
                        </div>
                        <div v-if="requestUrlIssue" class="text-caption text-error mt-1">
                          {{
                            t(
                              requestUrlIssue === 'full-endpoint'
                                ? 'features.llm.config.fullEndpointApiUrl'
                                : 'features.llm.config.invalidApiUrl',
                            )
                          }}
                        </div>
                      </div>
                      <v-text-field
                        v-model="config.apiKey"
                        hide-details
                        :label="t('features.llm.config.apiKey')"
                        :type="showApiKey ? 'text' : 'password'"
                        :append-inner-icon="showApiKey ? 'mdi-eye-off' : 'mdi-eye'"
                        clearable
                        @click:append-inner="showApiKey = !showApiKey"
                      />
                      <v-select
                        v-if="config.protocol === 'anthropic-messages'"
                        v-model="config.anthropicAuthMode"
                        hide-details
                        :label="t('features.llm.config.anthropicAuthMode')"
                        :items="authItems"
                      />
                      <v-text-field
                        v-model="config.modelName"
                        hide-details
                        :label="t('features.llm.config.modelName')"
                        required
                        clearable
                      />
                      <v-alert
                        v-if="testResult"
                        :type="testResult === 'success' ? 'success' : 'error'"
                        density="compact"
                        >{{
                          testResult === 'success'
                            ? t('features.llm.success.connectionSucceeded')
                            : t('features.llm.errors.connectionFailed')
                        }}</v-alert
                      >
                    </div>
                  </v-window-item>
                  <v-window-item value="copywriting" class="px-1 py-1">
                    <div class="flex flex-col gap-3">
                      <v-select
                        v-model="copyConfig.systemPromptMode"
                        hide-details
                        :label="t('features.llm.config.systemPromptMode')"
                        :items="promptModeItems"
                      />
                      <div class="text-caption text-medium-emphasis">
                        {{ systemPromptDescription }}
                      </div>
                      <template v-if="copyConfig.systemPromptMode === 'custom'">
                        <div class="flex justify-between items-center">
                          <span class="text-subtitle-2">{{
                            t('features.llm.config.customPrompt')
                          }}</span>
                          <v-btn size="small" variant="text" @click="fillBuiltinPrompt">{{
                            t('features.llm.config.fillBuiltin')
                          }}</v-btn>
                        </div>
                        <v-textarea
                          v-model="copyConfig.customSystemPrompt"
                          :hint="t('features.llm.config.customPromptHint')"
                          persistent-hint
                          rows="8"
                          no-resize
                          counter
                        />
                      </template>
                    </div>
                  </v-window-item>
                  <v-window-item value="advanced" class="px-1 py-1">
                    <div class="flex flex-col gap-3">
                      <v-select
                        v-model="config.instructionDelivery"
                        hide-details
                        :label="t('features.llm.config.instructionDelivery')"
                        :items="deliveryItems"
                      />
                      <div class="grid grid-cols-2 gap-3">
                        <v-text-field
                          v-model.number="config.timeoutSeconds"
                          type="number"
                          min="1"
                          hide-details
                          :label="t('features.llm.config.timeoutSeconds')"
                        />
                        <v-text-field
                          v-model.number="config.maxOutputTokens"
                          type="number"
                          min="1"
                          clearable
                          hide-details
                          :label="t('features.llm.config.maxOutputTokens')"
                        />
                      </div>
                      <div class="text-subtitle-2 mb-2">
                        {{ t('features.llm.config.customHeaders') }}
                      </div>
                      <div
                        v-for="(header, index) in config.customHeaders"
                        :key="index"
                        class="flex gap-2 items-start"
                      >
                        <v-text-field
                          v-model="header.name"
                          :label="t('features.llm.config.headerName')"
                        />
                        <v-text-field
                          v-model="header.value"
                          :label="t('features.llm.config.headerValue')"
                          type="password"
                        />
                        <v-btn
                          icon="mdi-delete-outline"
                          variant="text"
                          :title="t('common.buttons.remove')"
                          @click="removeHeader(index)"
                        />
                      </div>
                      <v-btn
                        size="small"
                        variant="text"
                        prepend-icon="mdi-plus"
                        @click="addHeader"
                        >{{ t('common.buttons.add') }}</v-btn
                      >
                      <div v-if="customHeaderIssue" class="text-caption text-error">
                        {{
                          t(
                            customHeaderIssue === 'invalid-name'
                              ? 'features.llm.config.invalidHeaderName'
                              : customHeaderIssue === 'invalid-value'
                                ? 'features.llm.config.invalidHeaderValue'
                                : customHeaderIssue === 'protected-name'
                                  ? 'features.llm.config.protectedHeaderName'
                                  : 'features.llm.config.duplicateHeaderName',
                          )
                        }}
                      </div>
                    </div>
                  </v-window-item>
                </v-window>
              </v-card-text>
              <v-divider />
              <v-card-actions>
                <v-btn variant="tonal" color="success" @click="handleTestConnection">
                  <v-progress-circular
                    v-if="testLoading"
                    class="mr-2"
                    indeterminate
                    size="16"
                    width="2"
                  />
                  {{ testAbortController ? t('common.buttons.stop') : t('common.buttons.test') }}
                </v-btn>
                <v-spacer />
                <v-btn
                  :text="t('common.buttons.close')"
                  variant="plain"
                  @click="handleCloseDialog"
                />
                <v-btn
                  color="primary"
                  :text="t('common.buttons.save')"
                  variant="tonal"
                  @click="handleSaveConfig"
                />
              </v-card-actions>
            </v-card>
          </v-dialog>
        </div>
      </v-sheet>
      <v-sheet class="h-0 flex-1 p-2" border rounded>
        <v-textarea
          v-model="outputText"
          class="h-full"
          :readonly="appStore.copywritingStatus === 'generating'"
          :label="`${t('features.llm.config.outputLabel')} · ${statusLabel}`"
          counter
          persistent-counter
          no-resize
          @update:model-value="handleOutputEdited"
        />
      </v-sheet>
    </v-form>
  </div>
</template>

<script lang="ts" setup>
import { computed, h, nextTick, onBeforeUnmount, ref, toRaw, watch } from 'vue'
import { useTranslation } from 'i18next-vue'
import { useToast } from 'vue-toastification'
import ActionToastEmbed from '@/components/ActionToastEmbed.vue'
import { copyErrorToClipboard } from '@/lib/error-copy'
import {
  defaultCopywritingConfig,
  getCustomHeaderIssue,
  getLlmConfigIssue,
  normalizeLlmConfig,
} from '@/lib/llm/config'
import { generateCopywriting } from '@/lib/llm/generate'
import { builtinSystemPrompt } from '@/lib/llm/prompts'
import { getRequestUrlHint, getRequestUrlIssue } from '@/lib/llm/providers'
import { getErrorDetail } from '@/lib/llm/security'
import type { LlmConfig, LlmConfigIssue } from '@/lib/llm/types'
import { useAppStore } from '@/store'

type ConfigTab = 'connection' | 'copywriting' | 'advanced'

const toast = useToast()
const appStore = useAppStore()
const { t } = useTranslation()
defineProps<{ disabled?: boolean }>()

const outputText = ref('')
const abortController = ref<AbortController | null>(null)
const testAbortController = ref<AbortController | null>(null)
const configDialogShow = ref(false)
const config = ref<LlmConfig>(structuredClone(toRaw(appStore.llmConfig)))
const copyConfig = ref(structuredClone(toRaw(appStore.copywritingConfig)))
const showApiKey = ref(false)
const testLoading = ref(false)
const testResult = ref<'success' | 'error'>()
const configTab = ref<ConfigTab>('connection')
const requestId = ref(0)
const testRequestId = ref(0)
let configDialogRevision = 0
const protocolItems = computed(() => [
  { title: t('features.llm.config.protocolCompatible'), value: 'openai-compatible' },
  { title: t('features.llm.config.protocolChat'), value: 'openai-chat' },
  { title: t('features.llm.config.protocolResponses'), value: 'openai-responses' },
  { title: t('features.llm.config.protocolAnthropic'), value: 'anthropic-messages' },
])
const authItems = computed(() => [
  { title: 'API Key (x-api-key)', value: 'api-key' },
  { title: 'Bearer Token (Authorization)', value: 'bearer' },
])
const deliveryItems = computed(() => [
  { title: t('features.llm.config.standardDelivery'), value: 'standard' },
  { title: t('features.llm.config.userMessageDelivery'), value: 'user-message' },
])
const promptModeItems = computed(() => [
  { title: t('features.llm.config.builtin'), value: 'builtin' },
  { title: t('features.llm.config.custom'), value: 'custom' },
  { title: t('features.llm.config.off'), value: 'off' },
])
const normalizedConfig = computed(() => normalizeLlmConfig(config.value))
const requestUrlHint = computed(() => getRequestUrlHint(normalizedConfig.value))
const requestUrlIssue = computed(() =>
  normalizedConfig.value.apiUrl ? getRequestUrlIssue(normalizedConfig.value) : undefined,
)
const customHeaderIssue = computed(() => getCustomHeaderIssue(config.value.customHeaders))
const statusLabel = computed(() => t(`features.llm.status.${appStore.copywritingStatus}`))
const systemPromptDescription = computed(() =>
  t(`features.llm.config.${copyConfig.value.systemPromptMode}Description`),
)

const cancelTestConnection = () => {
  testRequestId.value += 1
  testAbortController.value?.abort()
  testAbortController.value = null
  testLoading.value = false
}

watch(
  config,
  () => {
    testResult.value = undefined
    if (testAbortController.value) cancelTestConnection()
  },
  { deep: true, flush: 'sync' },
)
watch(
  () => copyConfig.value.systemPromptMode,
  (mode, previous) => {
    if (mode === 'custom' && previous !== 'custom' && !copyConfig.value.customSystemPrompt.trim())
      copyConfig.value.customSystemPrompt = builtinSystemPrompt
  },
)

const showError = (message: string, error: unknown, llmConfig?: LlmConfig) => {
  const detail = getErrorDetail(error, llmConfig)
  toast.error({
    component: {
      render: () =>
        h(ActionToastEmbed, {
          message,
          detail,
          actionText: t('common.buttons.copyErrorDetail'),
          onActionTirgger: async () => {
            await copyErrorToClipboard(message, detail)
            toast.success(t('common.messages.success.copySuccess'))
          },
        }),
    },
  })
}

const handleGenerate = async (options?: { noToast?: boolean; throwOnError?: boolean }) => {
  if (!appStore.prompt.trim()) {
    const error = new Error(t('features.llm.errors.promptRequired') as string)
    if (!options?.noToast) toast.warning(error.message)
    if (options?.throwOnError) throw error
    return ''
  }
  if (appStore.copywritingStatus === 'generating') return ''
  const currentRequestId = ++requestId.value
  const controller = new AbortController()
  abortController.value = controller
  const requestConfig = structuredClone(toRaw(appStore.llmConfig))
  outputText.value = ''
  appStore.updateCopywritingStatus('generating')
  try {
    const result = await generateCopywriting({
      llmConfig: requestConfig,
      copywritingConfig: structuredClone(toRaw(appStore.copywritingConfig)),
      prompt: appStore.prompt,
      abortSignal: controller.signal,
      onTextDelta: (delta) => {
        if (currentRequestId === requestId.value) outputText.value += delta
      },
    })
    if (currentRequestId !== requestId.value) return ''
    outputText.value = result.text
    appStore.updateCopywritingStatus(result.status)
    if (result.status !== 'completed') {
      const error = new Error(t(`features.llm.errors.${result.status}`) as string)
      if (options?.throwOnError) throw error
      if (result.status !== 'cancelled' && !options?.noToast)
        showError(t('features.llm.errors.generateFailed') as string, error, requestConfig)
      return ''
    }
    return result.text
  } catch (error) {
    if (currentRequestId !== requestId.value) return ''
    if (String(appStore.copywritingStatus) === 'generating')
      appStore.updateCopywritingStatus('failed')
    const sanitizedError = new Error(getErrorDetail(error, requestConfig))
    if (!options?.noToast && appStore.copywritingStatus !== 'cancelled')
      showError(t('features.llm.errors.generateFailed') as string, sanitizedError, requestConfig)
    if (options?.throwOnError) throw sanitizedError
    return ''
  } finally {
    if (currentRequestId === requestId.value) abortController.value = null
  }
}
const handleStopGenerate = () => abortController.value?.abort()
const handleOutputEdited = () =>
  appStore.updateCopywritingStatus(outputText.value.trim() ? 'edited' : 'idle')
const getTextForSynthesis = async () => {
  if (appStore.copywritingStatus === 'completed' || appStore.copywritingStatus === 'edited')
    return outputText.value.trim()
  if (appStore.copywritingStatus === 'idle' && !outputText.value.trim()) {
    return handleGenerate({ throwOnError: true, noToast: true })
  }
  throw new Error(t('features.llm.errors.textNotReady') as string)
}
const clearOutputText = () => {
  outputText.value = ''
  appStore.updateCopywritingStatus('idle')
}

const resetConfigDialog = () => {
  config.value = structuredClone(toRaw(appStore.llmConfig))
  copyConfig.value = structuredClone(toRaw(appStore.copywritingConfig))
  testResult.value = undefined
  configTab.value = 'connection'
}
const handleCloseDialog = () => {
  configDialogShow.value = false
}
watch(
  configDialogShow,
  (isOpen, wasOpen) => {
    if (isOpen) {
      configDialogRevision += 1
      return
    }
    if (!wasOpen) return

    cancelTestConnection()
    const revision = ++configDialogRevision
    nextTick(() => {
      if (!configDialogShow.value && configDialogRevision === revision) resetConfigDialog()
    })
  },
  { flush: 'sync' },
)
onBeforeUnmount(() => {
  requestId.value += 1
  abortController.value?.abort()
  cancelTestConnection()
})
const validateConfigBeforeRequest = () => {
  const issue = getLlmConfigIssue(config.value)
  if (!issue) return true

  const issueKeys: Record<LlmConfigIssue, string> = {
    'api-url-required': 'apiUrlRequired',
    'model-name-required': 'modelNameRequired',
    'invalid-api-url': 'invalidApiUrl',
    'full-endpoint-api-url': 'fullEndpointApiUrl',
    'invalid-protocol': 'invalidProtocol',
    'invalid-timeout': 'invalidTimeoutSeconds',
    'invalid-max-output-tokens': 'invalidMaxOutputTokens',
    'invalid-name': 'invalidHeaderName',
    'invalid-value': 'invalidHeaderValue',
    'protected-name': 'protectedHeaderName',
    'duplicate-name': 'duplicateHeaderName',
  }
  configTab.value =
    issue === 'invalid-name' ||
    issue === 'invalid-value' ||
    issue === 'protected-name' ||
    issue === 'duplicate-name'
      ? 'advanced'
      : 'connection'
  toast.warning(t(`features.llm.config.${issueKeys[issue]}`))
  return false
}
const handleSaveConfig = () => {
  if (
    copyConfig.value.systemPromptMode === 'custom' &&
    !copyConfig.value.customSystemPrompt.trim()
  ) {
    toast.warning(t('features.llm.errors.customPromptRequired'))
    return
  }
  if (!validateConfigBeforeRequest()) return
  appStore.updateLLMConfig(normalizeLlmConfig(config.value))
  appStore.updateCopywritingConfig(copyConfig.value)
  handleCloseDialog()
}
const fillBuiltinPrompt = () => {
  if (
    !copyConfig.value.customSystemPrompt.trim() ||
    window.confirm(t('features.llm.config.replacePromptConfirm') as string)
  )
    copyConfig.value.customSystemPrompt = builtinSystemPrompt
}
const addHeader = () => config.value.customHeaders.push({ name: '', value: '' })
const removeHeader = (index: number) => config.value.customHeaders.splice(index, 1)
const handleTestConnection = async () => {
  configTab.value = 'connection'
  if (testAbortController.value) {
    cancelTestConnection()
    return
  }
  testResult.value = undefined
  if (!validateConfigBeforeRequest()) return
  const currentTestRequestId = ++testRequestId.value
  const controller = new AbortController()
  const requestConfig = structuredClone(toRaw(normalizeLlmConfig(config.value)))
  testLoading.value = true
  testAbortController.value = controller
  try {
    const result = await generateCopywriting({
      llmConfig: requestConfig,
      copywritingConfig: structuredClone(
        toRaw(appStore.copywritingConfig ?? defaultCopywritingConfig()),
      ),
      prompt: '请写一句简短、自然的口播开场白。',
      abortSignal: controller.signal,
    })
    if (currentTestRequestId !== testRequestId.value || controller.signal.aborted) return
    if (result.status !== 'completed') throw new Error(result.status)
    testResult.value = 'success'
  } catch (error) {
    if (currentTestRequestId === testRequestId.value && !controller.signal.aborted) {
      testResult.value = 'error'
      showError(t('features.llm.errors.connectionFailed') as string, error, requestConfig)
    }
  } finally {
    if (currentTestRequestId === testRequestId.value) {
      testLoading.value = false
      testAbortController.value = null
    }
  }
}
defineExpose({
  handleGenerate,
  handleStopGenerate,
  getTextForSynthesis,
  getCurrentOutputText: () => outputText.value,
  clearOutputText,
})
</script>
