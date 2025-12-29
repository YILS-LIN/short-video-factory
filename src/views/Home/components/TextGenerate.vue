<template>
  <div class="w-full h-full">
    <v-form class="w-full h-full flex flex-col gap-2" :disabled="disabled">
      <v-sheet class="h-[200px] p-2 flex gap-2" border rounded>
        <v-textarea
          class="h-full"
          v-model="appStore.prompt"
          :label="t('llm.promptLabel')"
          counter
          persistent-counter
          no-resize
        ></v-textarea>
        <div class="flex flex-col gap-2">
          <v-btn
            v-if="!isGenerating"
            prepend-icon="mdi-auto-fix"
            color="deep-purple-accent-3"
            stacked
            :disabled="disabled"
            @click="handleGenerate"
          >
            {{ t('actions.generate') }}
          </v-btn>
          <v-btn
            v-else
            prepend-icon="mdi-stop"
            color="red"
            stacked
            :disabled="disabled"
            @click="handleStopGenerate"
          >
            {{ t('actions.stop') }}
          </v-btn>

          <v-dialog v-model="configDialogShow" max-width="600" persistent>
            <template v-slot:activator="{ props: activatorProps }">
              <v-btn v-bind="activatorProps" :disabled="disabled">
                {{ t('actions.config') }}
              </v-btn>
            </template>

            <v-card prepend-icon="mdi-text-box-edit-outline" :title="t('llm.configTitle')">
              <v-card-text>
                <v-text-field
                  :label="t('llm.modelName')"
                  v-model="config.modelName"
                  required
                  clearable
                ></v-text-field>
                <v-text-field
                  :label="t('llm.apiUrl')"
                  v-model="config.apiUrl"
                  required
                  clearable
                ></v-text-field>
                <v-text-field
                  :label="t('llm.apiKey')"
                  v-model="config.apiKey"
                  type="password"
                  required
                  clearable
                ></v-text-field>
                <small class="text-caption text-medium-emphasis">{{
                  t('llm.compatibleNote')
                }}</small>
              </v-card-text>
              <v-divider></v-divider>
              <v-card-actions>
                <v-spacer></v-spacer>
                <v-btn :text="t('common.close')" variant="plain" @click="handleCloseDialog"></v-btn>
                <v-btn
                  color="success"
                  :text="t('common.test')"
                  variant="tonal"
                  :loading="testStatus === TestStatusEnum.LOADING"
                  @click="handleTestConfig"
                ></v-btn>
                <v-btn
                  color="primary"
                  :text="t('common.save')"
                  variant="tonal"
                  @click="handleSaveConfig"
                ></v-btn>
              </v-card-actions>
            </v-card>
          </v-dialog>
        </div>
      </v-sheet>
      <v-sheet class="h-0 flex-1 p-2" border rounded>
        <v-textarea
          class="h-full"
          v-model="outputText"
          :label="t('llm.outputLabel')"
          counter
          persistent-counter
          no-resize
        ></v-textarea>
      </v-sheet>
    </v-form>
  </div>
</template>

<script lang="ts" setup>
import { useAppStore } from '@/store'
import { h, nextTick, ref, toRaw } from 'vue'
import { createOpenAI } from '@ai-sdk/openai'
import { generateText, streamText } from 'ai'
import { useToast } from 'vue-toastification'
import { useTranslation } from 'i18next-vue'
import ActionToastEmbed from '@/components/ActionToastEmbed.vue'

const toast = useToast()
const appStore = useAppStore()
const { t } = useTranslation()

defineProps<{
  disabled?: boolean
}>()

// 生成文案
const outputText = ref('')
const isGenerating = ref(false)
const abortController = ref<AbortController | null>(null)
const handleGenerate = async (options?: { noToast?: boolean }) => {
  if (!appStore.prompt) {
    !options?.noToast && toast.warning(t('errors.promptRequired'))
    throw new Error(t('errors.promptRequired') as string)
  }

  const openai = createOpenAI({
    baseURL: appStore.llmConfig.apiUrl,
    apiKey: appStore.llmConfig.apiKey,
  })
  abortController.value = new AbortController()
  isGenerating.value = true
  outputText.value = ''
  try {
    const result = streamText({
      model: openai(appStore.llmConfig.modelName),
      // system: ``,
      // 未来也许会设置一个系统提示词，但现在必须注释掉，因为部分接口提交空 system prompt 会报错
      prompt: appStore.prompt,
      onError: (error) => {
        throw error
      },
      abortSignal: abortController.value.signal,
    })
    for await (const textPart of result.textStream) {
      outputText.value += textPart
    }
    return outputText.value
  } catch (error: any) {
    console.log(`error`, error)
    // @ts-ignore
    if (error?.name !== 'AbortError' && error?.error?.name !== 'AbortError') {
      const errorMessage = error?.error?.message || error?.message || error
      if (!options?.noToast) {
        toast.error({
          component: {
            // 使用vnode方式创建自定义错误弹窗实例，以获得良好的类型提示
            render: () =>
              h(ActionToastEmbed, {
                message: t('errors.generateFailedPrefix'),
                detail: String(errorMessage),
                actionText: t('actions.copyErrorDetail'),
                onActionTirgger: () => {
                  navigator.clipboard.writeText(
                    JSON.stringify({
                      message: t('errors.generateFailedPrefix'),
                      detail: String(errorMessage),
                    }),
                  )
                  toast.success(t('success.copySuccess'))
                },
              }),
          },
        })
      }
      throw error
    }
  } finally {
    abortController.value = null
    isGenerating.value = false
  }
}
const handleStopGenerate = () => {
  if (abortController.value) {
    abortController.value.abort()
  }
}

// 配置大模型接口
const config = ref(structuredClone(toRaw(appStore.llmConfig)))
const configDialogShow = ref(false)
const resetConfigDialog = () => {
  config.value = structuredClone(toRaw(appStore.llmConfig))
}
const handleCloseDialog = () => {
  configDialogShow.value = false
  nextTick(resetConfigDialog)
}
const handleSaveConfig = () => {
  appStore.updateLLMConfig(config.value)
  configDialogShow.value = false
}

// 测试大模型连通性
enum TestStatusEnum {
  LOADING = 'loading',
  SUCCESS = 'success',
  ERROR = 'error',
}
const testStatus = ref<TestStatusEnum>()
const handleTestConfig = async () => {
  testStatus.value = TestStatusEnum.LOADING
  const openai = createOpenAI({ baseURL: config.value.apiUrl, apiKey: config.value.apiKey })
  try {
    const result = await generateText({
      model: openai(config.value.modelName),
      prompt: 'Hello',
    })
    console.log(`result`, result)
    testStatus.value = TestStatusEnum.SUCCESS
    toast.success(t('llm.connectSuccess'))
  } catch (error: any) {
    console.log(error)
    testStatus.value = TestStatusEnum.ERROR
    const errorMessage = error?.error?.message || error?.message || error
    toast.error({
      component: {
        // 使用vnode方式创建自定义错误弹窗实例，以获得良好的类型提示
        render: () =>
          h(ActionToastEmbed, {
            message: t('llm.connectFailedPrefix'),
            detail: String(errorMessage),
            actionText: t('actions.copyErrorDetail'),
            onActionTirgger: () => {
              navigator.clipboard.writeText(
                JSON.stringify({
                  message: t('llm.connectFailedPrefix'),
                  detail: String(errorMessage),
                }),
              )
              toast.success(t('success.copySuccess'))
            },
          }),
      },
    })
  }
}

// 获取当前文案
const getCurrentOutputText = () => {
  return outputText.value
}
// 清空文案
const clearOutputText = () => {
  outputText.value = ''
}

defineExpose({ handleGenerate, handleStopGenerate, getCurrentOutputText, clearOutputText })
</script>

<style lang="scss" scoped>
//
</style>
