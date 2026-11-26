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
          <v-btn v-else color="red" stacked @click="handleStopGenerate">
            <template #prepend>
              <v-progress-circular indeterminate :size="28" :width="2" aria-hidden="true">
                <v-icon size="18">mdi-stop</v-icon>
              </v-progress-circular>
            </template>
            {{ t('common.buttons.stop') }}
          </v-btn>
          <v-dialog v-model="configDialogShow" max-width="680" persistent scrollable>
            <template #activator="{ props: activatorProps }">
              <v-btn v-bind="activatorProps" :disabled="providerControlsDisabled">{{
                t('common.buttons.config')
              }}</v-btn>
            </template>
            <v-card
              class="llm-config-card"
              prepend-icon="mdi-text-box-edit-outline"
              :title="t('features.llm.config.configTitle')"
            >
              <v-tabs
                class="llm-config-tabs"
                v-model="configTab"
                color="primary"
                density="comfortable"
                fixed-tabs
              >
                <v-tab value="connection">{{ t('features.llm.config.myProviders') }}</v-tab>
                <v-tab value="copywriting">{{ t('features.llm.config.copywritingTab') }}</v-tab>
              </v-tabs>
              <v-card-text :key="configTab" class="llm-config-body">
                <v-window v-model="configTab">
                  <v-window-item value="connection" class="llm-config-panel">
                    <div class="llm-config-form flex flex-col gap-3">
                      <div class="provider-profile-bar">
                        <v-btn
                          class="provider-profile-add"
                          variant="tonal"
                          prepend-icon="mdi-plus"
                          @click="providerPage = 'choose'"
                        >
                          {{ t('features.llm.config.addProvider') }}
                        </v-btn>
                      </div>
                      <p v-if="!appStore.providerProfiles.length" class="provider-empty">
                        {{ t('features.llm.config.noSavedProviders') }}
                      </p>
                      <div v-else class="saved-provider-grid">
                        <div
                          v-for="profile in appStore.providerProfiles"
                          :key="profile.id"
                          class="saved-provider-row"
                        >
                          <button
                            class="saved-provider-card"
                            type="button"
                            :aria-pressed="profile.id === selectedProfileId"
                            @click="selectedProfileId = profile.id"
                          >
                            <span class="saved-provider-name">{{ profileTitle(profile) }}</span>
                            <span v-if="profile.config.modelName" class="saved-provider-model">
                              <span>{{ profile.config.modelName }}</span>
                              <span v-if="isProfileInUse(profile)" class="saved-provider-active">{{
                                t('features.llm.config.activeProvider')
                              }}</span>
                            </span>
                          </button>
                          <div class="saved-provider-actions">
                            <v-btn
                              size="small"
                              variant="text"
                              icon="mdi-pulse"
                              :loading="testingProfileId === profile.id"
                              :disabled="!!testAbortController"
                              :title="profileTestLabel(profile.id)"
                              :aria-label="profileTestLabel(profile.id)"
                              @click="testSavedProfile(profile)"
                            />
                            <span class="saved-provider-test-status" role="status">
                              <span
                                v-if="profileTestStatus.get(profile.id)?.status === 'success'"
                                class="text-success"
                                >{{ t('features.llm.config.providerTestPassed') }}</span
                              >
                              <span
                                v-else-if="profileTestStatus.get(profile.id)?.status === 'error'"
                                class="text-error"
                                >{{ t('features.llm.config.providerTestFailed') }}</span
                              >
                            </span>
                            <v-btn
                              size="small"
                              variant="text"
                              icon="mdi-pencil-outline"
                              :title="t('features.llm.config.editProvider')"
                              :aria-label="t('features.llm.config.editProvider')"
                              @click="editProvider(profile.id)"
                            />
                            <v-btn
                              size="small"
                              variant="text"
                              icon="mdi-delete-outline"
                              :title="t('features.llm.config.deleteProvider')"
                              :aria-label="t('features.llm.config.deleteProvider')"
                              @click="deleteProvider(profile.id)"
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                    <v-dialog
                      :model-value="providerPage !== 'list'"
                      max-width="620"
                      persistent
                      scrollable
                    >
                      <v-card
                        class="llm-config-card"
                        :title="
                          providerPage === 'choose'
                            ? t('features.llm.config.selectProviderTitle')
                            : editorTitle
                        "
                      >
                        <v-card-text :key="providerPage" class="llm-config-body">
                          <div class="llm-config-panel llm-config-form flex flex-col gap-3">
                            <div class="provider-page-heading">
                              <v-btn
                                icon="mdi-arrow-left"
                                size="small"
                                variant="text"
                                :aria-label="t('features.llm.config.backToProviders')"
                                v-if="providerPage === 'editor' && !editingProviderId"
                                @click="backToProviderPicker"
                              />
                            </div>
                            <ProviderPicker
                              v-if="providerPage === 'choose'"
                              :groups="providerGroups"
                              @select="selectProvider"
                            />
                            <template v-else>
                              <v-text-field
                                v-model="profileName"
                                :label="t('features.llm.config.providerName')"
                                :placeholder="defaultProfileName(config, editingProviderId)"
                                hide-details
                              />
                              <v-alert
                                v-if="
                                  selectedProvider &&
                                  providerGroups.partners.includes(selectedProvider)
                                "
                                density="compact"
                                variant="tonal"
                                type="info"
                              >
                                {{ t('features.llm.config.partnerPreview') }}
                              </v-alert>
                              <v-text-field
                                v-model="config.apiKey"
                                hide-details
                                :label="t('features.llm.config.apiKey')"
                                :type="showApiKey ? 'text' : 'password'"
                                :append-inner-icon="showApiKey ? 'mdi-eye-off' : 'mdi-eye'"
                                clearable
                                @click:append-inner="showApiKey = !showApiKey"
                              />
                              <v-btn
                                v-if="selectedProvider?.keysUrl"
                                class="self-start"
                                size="small"
                                variant="text"
                                append-icon="mdi-open-in-new"
                                @click="openProviderLink(selectedProvider.keysUrl)"
                              >
                                {{ t('features.llm.config.getApiKey') }}
                              </v-btn>
                              <div class="provider-profile-bar provider-model-heading">
                                <h4>{{ t('features.llm.config.providerModelList') }}</h4>
                                <v-btn
                                  size="small"
                                  variant="tonal"
                                  prepend-icon="mdi-plus"
                                  :aria-expanded="modelEditorOpen"
                                  @click="modelEditorOpen = !modelEditorOpen"
                                  >{{ t('features.llm.config.addModel') }}</v-btn
                                >
                              </div>
                              <div v-if="draftModels.length" class="flex flex-wrap gap-2">
                                <v-chip
                                  v-for="model in draftModels"
                                  :key="model"
                                  size="small"
                                  closable
                                  :aria-pressed="config.modelName === model"
                                  :prepend-icon="
                                    config.modelName === model
                                      ? 'mdi-radiobox-marked'
                                      : 'mdi-radiobox-blank'
                                  "
                                  :color="config.modelName === model ? 'primary' : undefined"
                                  @click="config.modelName = model"
                                  @click:close="removeModel(model)"
                                  >{{ model
                                  }}{{
                                    isOfficialFreeModel(model)
                                      ? ` · ${t('features.llm.config.officialFree')}`
                                      : ''
                                  }}</v-chip
                                >
                              </div>
                              <div
                                v-if="modelEditorOpen"
                                class="llm-config-form flex flex-col gap-3"
                              >
                                <v-text-field
                                  v-model="manualModelId"
                                  hide-details
                                  :label="t('features.llm.config.modelName')"
                                  clearable
                                  @keydown.enter.prevent="addCurrentModel"
                                />
                                <div class="flex flex-wrap gap-2">
                                  <v-btn
                                    size="small"
                                    variant="tonal"
                                    :disabled="!manualModelId?.trim()"
                                    @click="addCurrentModel"
                                  >
                                    {{ t('features.llm.config.addModelId') }}
                                  </v-btn>
                                  <v-btn
                                    size="small"
                                    variant="text"
                                    :loading="catalogLoading"
                                    :disabled="!config.apiUrl?.trim()"
                                    @click="loadModels"
                                  >
                                    {{ t('features.llm.config.fetchModels') }}
                                  </v-btn>
                                </div>
                                <v-alert
                                  v-if="catalogMessage"
                                  type="info"
                                  density="compact"
                                  variant="tonal"
                                  >{{ catalogMessage }}</v-alert
                                >
                                <v-autocomplete
                                  v-if="availableModels.length"
                                  :model-value="null"
                                  :label="t('features.llm.config.chooseModel')"
                                  :items="availableModels"
                                  hide-details
                                  @update:model-value="addModel"
                                >
                                  <template #item="{ props: itemProps, item }">
                                    <v-list-item
                                      v-bind="itemProps"
                                      :subtitle="
                                        isOfficialFreeModel(item.title)
                                          ? t('features.llm.config.officialFree')
                                          : undefined
                                      "
                                    />
                                  </template>
                                </v-autocomplete>
                                <v-btn
                                  v-if="selectedProvider?.modelsUrl"
                                  class="self-start"
                                  size="small"
                                  variant="text"
                                  append-icon="mdi-open-in-new"
                                  @click="openProviderLink(selectedProvider.modelsUrl)"
                                >
                                  {{ t('features.llm.config.providerModels') }}
                                </v-btn>
                              </div>
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
                              <v-divider />
                              <v-btn
                                class="self-start"
                                variant="text"
                                :aria-expanded="advancedOpen"
                                :prepend-icon="
                                  advancedOpen ? 'mdi-chevron-down' : 'mdi-chevron-right'
                                "
                                @click="advancedOpen = !advancedOpen"
                                >{{ t('features.llm.config.advancedConnection') }}</v-btn
                              >
                              <div v-if="advancedOpen" class="llm-config-form flex flex-col gap-3">
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
                                  <div
                                    v-if="requestUrlHint"
                                    class="text-caption text-medium-emphasis mt-1"
                                  >
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
                                <v-select
                                  v-if="config.protocol === 'anthropic-messages'"
                                  v-model="config.anthropicAuthMode"
                                  hide-details
                                  :label="t('features.llm.config.anthropicAuthMode')"
                                  :items="authItems"
                                />
                                <v-select
                                  v-model="config.instructionDelivery"
                                  hide-details
                                  :label="t('features.llm.config.instructionDelivery')"
                                  :items="deliveryItems"
                                />
                                <v-switch
                                  v-model="thinkingTagMode"
                                  color="primary"
                                  density="compact"
                                  :label="t('features.llm.config.decodeLeadingThink')"
                                  :hint="t('features.llm.config.decodeLeadingThinkHint')"
                                  persistent-hint
                                />
                                <div class="llm-config-grid">
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
                                <div class="text-subtitle-2">
                                  {{ t('features.llm.config.sampling') }}
                                </div>
                                <div class="llm-config-grid">
                                  <v-text-field
                                    v-model.number="config.temperature"
                                    type="number"
                                    min="0"
                                    max="2"
                                    step="0.1"
                                    clearable
                                    hide-details
                                    :label="t('features.llm.config.temperature')"
                                  />
                                  <v-text-field
                                    v-model.number="config.topP"
                                    type="number"
                                    min="0"
                                    max="1"
                                    step="0.05"
                                    clearable
                                    hide-details
                                    :label="t('features.llm.config.topP')"
                                  />
                                </div>
                                <div class="text-caption text-medium-emphasis">
                                  {{ t('features.llm.config.samplingDescription') }}
                                </div>
                                <v-alert type="info" density="compact" variant="tonal">
                                  {{ t('features.llm.config.samplingCompatibilityUnknown') }}
                                </v-alert>
                                <div class="flex justify-end">
                                  <v-btn size="small" variant="text" @click="resetSamplingSettings">
                                    {{ t('features.llm.config.restoreSamplingDefaults') }}
                                  </v-btn>
                                </div>
                                <div class="text-subtitle-2 mb-2">
                                  {{ t('features.llm.config.customHeaders') }}
                                </div>
                                <div
                                  v-for="(header, index) in config.customHeaders"
                                  :key="index"
                                  class="llm-header-row"
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
                                    class="llm-header-remove"
                                    icon="mdi-delete-outline"
                                    size="small"
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
                            </template>
                          </div>
                        </v-card-text>
                        <v-divider />
                        <v-card-actions>
                          <v-btn
                            v-if="providerPage === 'editor'"
                            variant="tonal"
                            color="success"
                            @click="handleTestConnection()"
                          >
                            <v-progress-circular
                              v-if="testLoading"
                              class="mr-2"
                              indeterminate
                              size="16"
                              width="2"
                            />
                            {{
                              testAbortController
                                ? t('common.buttons.stop')
                                : t('common.buttons.test')
                            }}
                          </v-btn>
                          <v-spacer />
                          <v-btn
                            :text="t('common.buttons.cancel')"
                            variant="plain"
                            @click="returnToProviders"
                          />
                          <v-btn
                            v-if="providerPage === 'editor'"
                            color="primary"
                            variant="tonal"
                            :text="
                              t(
                                editingProviderId
                                  ? 'features.llm.config.saveProviderChanges'
                                  : 'features.llm.config.createProvider',
                              )
                            "
                            @click="handleSaveConfig"
                          />
                        </v-card-actions>
                      </v-card>
                    </v-dialog>
                  </v-window-item>
                  <v-window-item value="copywriting" class="llm-config-panel">
                    <div class="llm-config-form flex flex-col gap-3">
                      <v-select
                        v-model="copyConfig.systemPromptMode"
                        v-model:menu="promptModeMenuOpen"
                        :transition="false"
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
                          ref="customPromptField"
                          v-model="copyConfig.customSystemPrompt"
                          :aria-label="t('features.llm.config.customPrompt')"
                          :hint="t('features.llm.config.customPromptHint')"
                          persistent-hint
                          rows="8"
                          no-resize
                          counter
                        />
                      </template>
                      <v-divider />
                      <v-switch
                        v-model="copyConfig.diversityEnabled"
                        color="primary"
                        hide-details
                        :label="t('features.llm.config.diversityEnabled')"
                      />
                      <div class="text-caption text-medium-emphasis">
                        {{ t('features.llm.config.diversityDescription') }}
                      </div>
                      <template v-if="copyConfig.diversityEnabled">
                        <v-switch
                          v-model="copyConfig.rewriteOnSimilarity"
                          color="primary"
                          hide-details
                          :label="t('features.llm.config.rewriteOnSimilarity')"
                        />
                        <div class="text-caption text-medium-emphasis">
                          {{ t('features.llm.config.rewriteDescription') }}
                        </div>
                        <div class="flex items-center justify-between">
                          <span class="text-caption text-medium-emphasis">{{
                            t('features.llm.config.historyCount', { count: historyTaskCount })
                          }}</span>
                          <v-btn
                            size="small"
                            variant="text"
                            :disabled="historyTaskCount === 0"
                            @click="handleClearHistory"
                            >{{ t('features.llm.config.clearHistory') }}</v-btn
                          >
                        </div>
                      </template>
                    </div>
                  </v-window-item>
                </v-window>
              </v-card-text>
              <v-divider />
              <v-card-actions>
                <span v-if="configTab === 'connection'" class="provider-footer-status">
                  <template v-if="activeProfile">
                    {{ t('features.llm.config.currentModel') }}
                    <strong
                      >{{ profileTitle(activeProfile) }} /
                      {{ appStore.llmConfig.modelName }}</strong
                    >
                  </template>
                  <template v-else>{{ t('features.llm.config.noActiveModel') }}</template>
                </span>
                <v-spacer />
                <v-btn
                  v-if="configTab === 'copywriting' || needsActivation"
                  :text="
                    t(
                      configTab === 'copywriting'
                        ? 'common.buttons.cancel'
                        : 'common.buttons.close',
                    )
                  "
                  variant="plain"
                  @click="handleCloseDialog"
                />
                <v-btn
                  v-if="configTab === 'copywriting'"
                  color="primary"
                  :text="t('common.buttons.save')"
                  variant="tonal"
                  @click="handleSaveConfig"
                />
                <v-btn
                  v-else
                  color="primary"
                  :text="
                    t(
                      needsActivation
                        ? 'features.llm.config.useProvider'
                        : 'features.llm.config.finishProviders',
                    )
                  "
                  variant="tonal"
                  @click="applySelectedProfile"
                />
              </v-card-actions>
            </v-card>
          </v-dialog>
        </div>
      </v-sheet>
      <v-sheet class="h-0 flex-1 p-2" border rounded>
        <v-textarea
          v-model="outputText"
          class="h-full copywriting-output"
          :readonly="appStore.copywritingStatus === 'generating'"
          :label="`${t('features.llm.config.outputLabel')} · ${statusLabel}`"
          counter
          persistent-counter
          no-resize
          @update:model-value="handleOutputEdited"
        >
          <template #details>
            <DurationEstimate
              :text="outputText"
              :generating="appStore.copywritingStatus === 'generating'"
              :ready="['completed', 'edited'].includes(appStore.copywritingStatus)"
            />
          </template>
        </v-textarea>
        <details v-if="unclosedThinkingOutput" class="mt-2">
          <summary>{{ t('features.llm.errors.unclosedThinkingOutput') }}</summary>
          <v-textarea
            :model-value="unclosedThinkingOutput"
            :label="t('features.llm.config.rawOutputLabel')"
            readonly
            rows="4"
            hide-details
          />
        </details>
        <v-alert
          v-if="generationPhase === 'rewriting'"
          class="mt-2"
          type="info"
          density="compact"
          variant="tonal"
        >
          {{ t('features.llm.info.rewritingSimilarCopy') }}
        </v-alert>
        <v-alert
          v-else-if="generationPhase === 'checking'"
          class="mt-2"
          type="info"
          density="compact"
          variant="tonal"
        >
          {{ t('features.llm.info.checkingSimilarity') }}
        </v-alert>
      </v-sheet>
    </v-form>
  </div>
</template>

<script lang="ts" setup>
import { computed, h, nextTick, onBeforeUnmount, ref, toRaw, watch } from 'vue'
import { useTranslation } from 'i18next-vue'
import { useToast } from 'vue-toastification'
import ActionToastEmbed from '@/components/ActionToastEmbed.vue'
import DurationEstimate from './DurationEstimate.vue'
import ProviderPicker from './ProviderPicker.vue'
import { copyErrorToClipboard } from '@/lib/error-copy'
import {
  defaultLlmConfig,
  getCustomHeaderIssue,
  getLlmConfigIssue,
  normalizeLlmConfig,
} from '@/lib/llm/config'
import { generateCopywriting } from '@/lib/llm/generate'
import { generateDiverseCopywriting, type GenerationPhase } from '@/lib/llm/generate-diverse'
import { builtinSystemPrompt } from '@/lib/llm/prompts'
import { applyProviderPreset, getProviderGroups, matchesProvider } from '@/lib/llm/provider-presets'
import {
  LEGACY_PROVIDER_ID,
  normalizeModelIds,
  type ProviderProfile,
} from '@/lib/llm/provider-profiles'
import { discoverProviderModels } from '@/lib/llm/model-discovery'
import { getRequestUrlHint, getRequestUrlIssue } from '@/lib/llm/providers'
import { getErrorDetail } from '@/lib/llm/security'
import type { LlmConfig, LlmConfigIssue } from '@/lib/llm/types'
import {
  clearCopywritingHistory,
  getCopywritingHistoryTaskCount,
} from '@/store/copywriting-history'
import { useAppStore } from '@/store'
import type { GenerationUsageSummary } from '~/electron/analytics-types'
import { createAnalyticsOperationId, trackAnalytics } from '@/lib/analytics'

type ConfigTab = 'connection' | 'copywriting'

const toast = useToast()
const appStore = useAppStore()
const { i18next, t } = useTranslation()
const props = defineProps<{ disabled?: boolean }>()

const outputText = ref('')
const unclosedThinkingOutput = ref('')
const abortController = ref<AbortController | null>(null)
const testAbortController = ref<AbortController | null>(null)
const configDialogShow = ref(false)
const config = ref<LlmConfig>(structuredClone(toRaw(appStore.llmConfig)))
const providerPage = ref<'list' | 'choose' | 'editor'>('list')
const selectedProfileId = ref<string | null>(appStore.activeProviderId)
const editingProviderId = ref<string | null>(null)
const advancedOpen = ref(false)
const modelEditorOpen = ref(false)
const manualModelId = ref<string | null>('')
const profileName = ref('')
const draftModels = ref<string[]>([])
const catalogModels = ref<string[]>([])
const catalogController = ref<AbortController>()
const catalogMessage = ref('')
const catalogLoading = computed(() => !!catalogController.value)
const providerControlsDisabled = computed(() => props.disabled || !!appStore.batchProgress?.running)
const copyConfig = ref(structuredClone(toRaw(appStore.copywritingConfig)))
const customPromptField = ref<{ focus: () => void } | null>(null)
const promptModeMenuOpen = ref(false)
let shouldFocusCustomPrompt = false
const showApiKey = ref(false)
const latestGenerationAnalytics = ref<GenerationUsageSummary>({
  source: 'unknown',
  providerCategory: 'unknown',
  callCount: 0,
  usageComplete: false,
})
const testLoading = ref(false)
const testResult = ref<'success' | 'error'>()
const profileTestStatus = ref(new Map<string, { status: 'success' | 'error' }>())
const testingProfileId = ref<string | null>(null)
const configTab = ref<ConfigTab>('connection')
const requestId = ref(0)
const testRequestId = ref(0)
const generationPhase = ref<GenerationPhase | null>(null)
const historyRevision = ref(0)
let configDialogRevision = 0
let configResetPending = false
const protocolItems = computed(() => [
  { title: t('features.llm.config.protocolCompatible'), value: 'openai-compatible' },
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
const thinkingTagMode = computed({
  get: () => config.value.decodeLeadingThink !== false,
  set: (enabled: boolean) => {
    config.value.decodeLeadingThink = enabled
  },
})
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
const providerGroups = getProviderGroups(import.meta.env.VITE_PROVIDER_PARTNER_DEMO === 'true')
const availableProviders = [...providerGroups.partners, ...providerGroups.common]
const selectedProfile = computed(() =>
  appStore.providerProfiles.find(({ id }) => id === selectedProfileId.value),
)
const activeProfile = computed(() =>
  appStore.providerProfiles.find(({ id }) => id === appStore.activeProviderId),
)
const sameConfig = (a: LlmConfig, b: LlmConfig) =>
  JSON.stringify(normalizeLlmConfig(a)) === JSON.stringify(normalizeLlmConfig(b))
const isProfileInUse = (profile: ProviderProfile) =>
  profile.id === appStore.activeProviderId && sameConfig(profile.config, appStore.llmConfig)
const needsActivation = computed(
  () => !!selectedProfile.value && !isProfileInUse(selectedProfile.value),
)
const applySelectedProfile = () => {
  if (providerControlsDisabled.value) return
  if (selectedProfile.value && needsActivation.value)
    appStore.selectProviderProfile(selectedProfile.value.id)
  handleCloseDialog()
}
const defaultProfileName = (value: LlmConfig, id?: string | null) => {
  const preset = availableProviders.find((entry) => matchesProvider(value, entry))
  if (preset) {
    const preferChinese = (i18next?.resolvedLanguage ?? 'zh-CN').startsWith('zh')
    return (preferChinese && preset.nameZh) || preset.name
  }
  if (id === LEGACY_PROVIDER_ID) return t('features.llm.config.defaultProviderName')
  try {
    return new URL(value.apiUrl).host
  } catch {
    return t('features.llm.config.customProvider')
  }
}
const profileTitle = (profile: ProviderProfile) =>
  profile.name || defaultProfileName(profile.config, profile.id)
const editorTitle = computed(() => {
  const profile = appStore.providerProfiles.find(({ id }) => id === editingProviderId.value)
  return t(
    profile ? 'features.llm.config.editProviderTitle' : 'features.llm.config.newProviderTitle',
    {
      name: profile ? profileTitle(profile) : defaultProfileName(config.value),
    },
  )
})
const selectedProvider = computed(() =>
  availableProviders.find((preset) => matchesProvider(config.value, preset)),
)
const isOfficialFreeModel = (model: string) =>
  selectedProvider.value?.id === 'zhipu' &&
  (selectedProvider.value.suggestedModels?.includes(model.toLowerCase()) ?? false)
const availableModels = computed(() =>
  normalizeModelIds([
    selectedProvider.value?.modelName,
    ...(selectedProvider.value?.suggestedModels ?? []),
    ...catalogModels.value,
  ]).filter((model) => !draftModels.value.includes(model)),
)
const addModel = (model: string | null) => {
  if (!model?.trim()) return
  config.value.modelName = model.trim()
  draftModels.value = normalizeModelIds([...draftModels.value, model])
}
const addCurrentModel = (event?: KeyboardEvent) => {
  if (event?.isComposing) return
  addModel(manualModelId.value)
  manualModelId.value = ''
}
const removeModel = (model: string) => {
  draftModels.value = draftModels.value.filter((entry) => entry !== model)
  if (config.value.modelName === model) config.value.modelName = draftModels.value[0] ?? ''
}
const clearCatalog = () => {
  catalogController.value?.abort()
  catalogController.value = undefined
  catalogModels.value = []
  catalogMessage.value = ''
}
const loadModels = async () => {
  clearCatalog()
  const controller = new AbortController()
  catalogController.value = controller
  const timeout = setTimeout(() => controller.abort(), 15000)
  try {
    const models = await discoverProviderModels(config.value, controller.signal)
    if (catalogController.value !== controller) return
    catalogModels.value = models
    if (!models.length) catalogMessage.value = t('features.llm.config.noProviderModels')
  } catch {
    if (catalogController.value === controller)
      catalogMessage.value = t('features.llm.config.modelCatalogFailed')
  } finally {
    clearTimeout(timeout)
    if (catalogController.value === controller) catalogController.value = undefined
  }
}
watch(
  () => [
    config.value.apiUrl,
    config.value.apiKey,
    config.value.protocol,
    config.value.anthropicAuthMode,
    config.value.customHeaders,
  ],
  clearCatalog,
  { deep: true, flush: 'sync' },
)
const editProvider = (id: string) => {
  const profile = appStore.providerProfiles.find((entry) => entry.id === id)
  if (!profile) return
  cancelTestConnection()
  selectedProfileId.value = id
  editingProviderId.value = profile.id
  profileName.value = profile.name
  draftModels.value = [...profile.models]
  manualModelId.value = ''
  config.value = structuredClone(toRaw(profile.config))
  advancedOpen.value = !selectedProvider.value
  modelEditorOpen.value = !draftModels.value.length
  clearCatalog()
  showApiKey.value = false
  providerPage.value = 'editor'
}
const deleteProvider = (id: string) => {
  if (!window.confirm(t('features.llm.config.deleteProviderConfirm'))) return
  appStore.removeProviderProfile(id)
  if (testingProfileId.value === id) cancelTestConnection()
  profileTestStatus.value.delete(id)
  if (selectedProfileId.value === id)
    selectedProfileId.value = appStore.activeProviderId ?? appStore.providerProfiles[0]?.id ?? null
}
const profileTestLabel = (id: string) => {
  const status = profileTestStatus.value.get(id)?.status
  if (testingProfileId.value === id) return t('features.llm.config.testingProvider')
  if (status === 'success') return t('features.llm.config.retestPassed')
  if (status === 'error') return t('features.llm.config.retestFailed')
  return t('common.buttons.test')
}
const testSavedProfile = (profile: ProviderProfile) => {
  if (testAbortController.value) return
  profileTestStatus.value.delete(profile.id)
  void handleTestConnection(profile)
}
const selectProvider = (id: string) => {
  const preset = availableProviders.find((provider) => provider.id === id)
  if (!preset && id !== 'custom') return
  editingProviderId.value = null
  config.value = applyProviderPreset(defaultLlmConfig(), preset)
  profileName.value = preset ? defaultProfileName(config.value) : ''
  draftModels.value = normalizeModelIds([config.value.modelName])
  manualModelId.value = ''
  advancedOpen.value = !preset
  modelEditorOpen.value = !draftModels.value.length
  showApiKey.value = false
  providerPage.value = 'editor'
}
const returnToProviders = () => {
  cancelTestConnection()
  clearCatalog()
  testResult.value = undefined
  showApiKey.value = false
  config.value = defaultLlmConfig()
  editingProviderId.value = null
  profileName.value = ''
  draftModels.value = []
  manualModelId.value = ''
  providerPage.value = 'list'
}
const backToProviderPicker = () => {
  returnToProviders()
  providerPage.value = 'choose'
}
const openProviderLink = (url: string) => {
  void window.electron.openExternal({ url }).catch((error) => {
    console.error('Failed to open external link:', error)
    toast.error(t('features.llm.config.providerLinkFailed'))
  })
}
const customHeaderIssue = computed(() => getCustomHeaderIssue(config.value.customHeaders))
const statusLabel = computed(() => t(`features.llm.status.${appStore.copywritingStatus}`))
const historyTaskCount = computed(() => {
  historyRevision.value
  return getCopywritingHistoryTaskCount()
})
const systemPromptDescription = computed(() =>
  t(`features.llm.config.${copyConfig.value.systemPromptMode}Description`),
)

const focusCustomPrompt = () => {
  if (!shouldFocusCustomPrompt) return
  shouldFocusCustomPrompt = false
  if (configDialogShow.value && configTab.value === 'copywriting') customPromptField.value?.focus()
}
// Move focus after the select menu closes and the textarea has rendered.
watch(
  promptModeMenuOpen,
  (open) => {
    if (!open) focusCustomPrompt()
  },
  { flush: 'post' },
)

const cancelTestConnection = () => {
  testRequestId.value += 1
  testAbortController.value?.abort()
  testAbortController.value = null
  testingProfileId.value = null
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
    shouldFocusCustomPrompt = mode === 'custom' && previous !== 'custom'
    if (shouldFocusCustomPrompt && !copyConfig.value.customSystemPrompt.trim())
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

const handleClearHistory = () => {
  if (!window.confirm(t('features.llm.config.clearHistoryConfirm') as string)) return
  if (clearCopywritingHistory()) {
    historyRevision.value += 1
    toast.success(t('features.llm.success.historyCleared'))
  } else {
    toast.warning(t('features.llm.errors.historyClearFailed'))
  }
}

const resetSamplingSettings = () => {
  config.value.temperature = undefined
  config.value.topP = undefined
}

const getProviderCategory = (protocol: LlmConfig['protocol']) =>
  protocol === 'anthropic-messages'
    ? 'anthropic'
    : protocol === 'openai-compatible'
      ? 'compatible'
      : 'openai'

const getErrorCode = (error: unknown) => {
  const candidate = error as { name?: string; code?: string; message?: string }
  const value =
    `${candidate?.name ?? ''} ${candidate?.code ?? ''} ${candidate?.message ?? ''}`.toLowerCase()
  if (/timed out|timeout|etimedout/.test(value)) return 'network_timeout'
  if (/enotfound|econnrefused|networkerror|failed to fetch/.test(value))
    return 'network_unreachable'
  if (/401|403|unauthorized|forbidden/.test(value)) return 'authentication_failed'
  if (/429|rate.?limit/.test(value)) return 'rate_limited'
  return 'unknown'
}

const getTextLengthBucket = (length: number) => {
  if (length < 100) return '<100'
  if (length < 500) return '100–499'
  if (length < 1000) return '500–999'
  if (length < 2000) return '1000–1999'
  return '≥2000'
}

const handleGenerate = async (options?: {
  noToast?: boolean
  throwOnError?: boolean
  source?: 'standalone' | 'pipeline'
}) => {
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
  const startedAt = performance.now()
  let outcome: 'success' | 'failed' | 'cancelled' = 'failed'
  let failureCode = 'unknown'
  let requestCount = 0
  let usageCount = 0
  let inputTokens = 0
  let outputTokens = 0
  let inputTokensKnown = true
  let outputTokensKnown = true
  const operationId = createAnalyticsOperationId()
  outputText.value = ''
  unclosedThinkingOutput.value = ''
  appStore.updateCopywritingStatus('generating')
  try {
    const result = await generateDiverseCopywriting({
      llmConfig: requestConfig,
      copywritingConfig: structuredClone(toRaw(appStore.copywritingConfig)),
      prompt: appStore.prompt,
      abortSignal: controller.signal,
      onPhase: (phase) => {
        if (currentRequestId === requestId.value) generationPhase.value = phase
      },
      onTextDelta: (delta) => {
        if (currentRequestId === requestId.value) outputText.value += delta
      },
      onRequestStart: () => {
        requestCount += 1
      },
      onUsage: (usage) => {
        usageCount += 1
        if (usage.inputTokens === undefined) inputTokensKnown = false
        else inputTokens += usage.inputTokens
        if (usage.outputTokens === undefined) outputTokensKnown = false
        else outputTokens += usage.outputTokens
      },
    })
    if (currentRequestId !== requestId.value) return ''
    outputText.value = result.text
    unclosedThinkingOutput.value = result.unclosedThinkingOutput ?? ''
    appStore.updateCopywritingStatus(result.status)
    historyRevision.value += 1
    if (result.similarityWarning && !options?.noToast)
      toast.warning(
        t(
          result.rewriteFailed
            ? 'features.llm.info.similarityRewriteFailed'
            : 'features.llm.info.similarityRemains',
        ),
      )
    if (result.status !== 'completed') {
      outcome = result.status === 'cancelled' ? 'cancelled' : 'failed'
      if (result.status === 'truncated' || result.unclosedThinkingOutput)
        failureCode = 'invalid_response'
      else if (result.status === 'failed') failureCode = 'empty_output'
      const errorKey = result.unclosedThinkingOutput ? 'unclosedThinkingOutput' : result.status
      const error = new Error(t(`features.llm.errors.${errorKey}`) as string)
      if (options?.throwOnError) throw error
      if (result.status !== 'cancelled' && !options?.noToast)
        showError(t('features.llm.errors.generateFailed') as string, error, requestConfig)
      return ''
    }
    outcome = 'success'
    return result.text
  } catch (error) {
    if (currentRequestId !== requestId.value) return ''
    outcome = controller.signal.aborted ? 'cancelled' : 'failed'
    if (outcome === 'failed') failureCode = getErrorCode(error)
    if (String(appStore.copywritingStatus) === 'generating')
      appStore.updateCopywritingStatus('failed')
    const sanitizedError = new Error(getErrorDetail(error, requestConfig))
    if (!options?.noToast && appStore.copywritingStatus !== 'cancelled')
      showError(t('features.llm.errors.generateFailed') as string, sanitizedError, requestConfig)
    if (options?.throwOnError) throw sanitizedError
    return ''
  } finally {
    if (currentRequestId === requestId.value) {
      latestGenerationAnalytics.value = {
        source: 'generated',
        protocol: requestConfig.protocol,
        providerCategory: getProviderCategory(requestConfig.protocol),
        callCount: requestCount,
        ...(inputTokensKnown && usageCount > 0 ? { inputTokens } : {}),
        ...(outputTokensKnown && usageCount > 0 ? { outputTokens } : {}),
        usageComplete:
          requestCount > 0 && usageCount === requestCount && inputTokensKnown && outputTokensKnown,
      }
      if (options?.source !== 'pipeline') {
        const data: Record<string, string | number | boolean> = {
          operation_id: operationId,
          outcome,
          duration_ms: Math.max(0, Math.floor(performance.now() - startedAt)),
          provider_category: getProviderCategory(requestConfig.protocol),
          protocol: requestConfig.protocol,
          llm_call_count: requestCount,
          llm_usage_complete:
            requestCount > 0 &&
            usageCount === requestCount &&
            inputTokensKnown &&
            outputTokensKnown,
          text_length_bucket: getTextLengthBucket(outputText.value.length),
        }
        if (inputTokensKnown && usageCount > 0) data.input_tokens = inputTokens
        if (outputTokensKnown && usageCount > 0) data.output_tokens = outputTokens
        if (outcome === 'failed') data.error_code = failureCode
        trackAnalytics('text_generation_finished', data)
      }
      abortController.value = null
      generationPhase.value = null
    }
  }
}
const handleStopGenerate = () => abortController.value?.abort()
const handleOutputEdited = () =>
  appStore.updateCopywritingStatus(outputText.value.trim() ? 'edited' : 'idle')
const getTextForSynthesis = async () => {
  if (appStore.copywritingStatus === 'completed' || appStore.copywritingStatus === 'edited') {
    latestGenerationAnalytics.value = {
      source: appStore.copywritingStatus === 'edited' ? 'edited' : 'reused',
      providerCategory: 'unknown',
      callCount: 0,
      usageComplete: false,
    }
    return outputText.value.trim()
  }
  if (appStore.copywritingStatus === 'idle' && !outputText.value.trim()) {
    return handleGenerate({ throwOnError: true, noToast: true, source: 'pipeline' })
  }
  throw new Error(t('features.llm.errors.textNotReady') as string)
}
const clearOutputText = () => {
  outputText.value = ''
  unclosedThinkingOutput.value = ''
  appStore.updateCopywritingStatus('idle')
}

const resetConfigDialog = () => {
  shouldFocusCustomPrompt = false
  selectedProfileId.value = appStore.activeProviderId
  providerPage.value = 'list'
  copyConfig.value = structuredClone(toRaw(appStore.copywritingConfig))
  testResult.value = undefined
  showApiKey.value = false
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
      if (!configResetPending) resetConfigDialog()
      configResetPending = false
      return
    }
    if (!wasOpen) return

    cancelTestConnection()
    testResult.value = undefined
    profileTestStatus.value.clear()
    clearCatalog()
    const revision = ++configDialogRevision
    configResetPending = true
    nextTick(() => {
      if (!configDialogShow.value && configDialogRevision === revision) {
        configResetPending = false
        resetConfigDialog()
      }
    })
  },
  { flush: 'sync' },
)
onBeforeUnmount(() => {
  requestId.value += 1
  abortController.value?.abort()
  cancelTestConnection()
  clearCatalog()
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
    'invalid-temperature': 'invalidTemperature',
    'invalid-top-p': 'invalidTopP',
    'invalid-name': 'invalidHeaderName',
    'invalid-value': 'invalidHeaderValue',
    'protected-name': 'protectedHeaderName',
    'duplicate-name': 'duplicateHeaderName',
  }
  if (issue === 'model-name-required') modelEditorOpen.value = true
  else advancedOpen.value = true
  toast.warning(t(`features.llm.config.${issueKeys[issue]}`))
  return false
}
const handleSaveConfig = () => {
  if (providerPage.value === 'editor') {
    addCurrentModel()
    if (!validateConfigBeforeRequest()) return
    const id = editingProviderId.value ?? crypto.randomUUID()
    const previous = appStore.providerProfiles.find((profile) => profile.id === id)
    if (previous && !sameConfig(previous.config, config.value)) profileTestStatus.value.delete(id)
    appStore.saveProviderProfile({
      id,
      name:
        profileName.value.trim() ||
        (id === LEGACY_PROVIDER_ID ? '' : defaultProfileName(config.value)),
      config: normalizeLlmConfig(config.value),
      models: draftModels.value,
    })
    selectedProfileId.value = id
    returnToProviders()
    return
  }
  if (
    copyConfig.value.systemPromptMode === 'custom' &&
    !copyConfig.value.customSystemPrompt.trim()
  ) {
    toast.warning(t('features.llm.errors.customPromptRequired'))
    return
  }
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
const handleTestConnection = async (profile?: ProviderProfile) => {
  if (testAbortController.value) {
    cancelTestConnection()
    return
  }
  if (!profile) {
    addCurrentModel()
    testResult.value = undefined
    if (!validateConfigBeforeRequest()) return
  }
  const currentTestRequestId = ++testRequestId.value
  const controller = new AbortController()
  const requestConfig = structuredClone(toRaw(normalizeLlmConfig(profile?.config ?? config.value)))
  const testStartedAt = performance.now()
  let providerTestOutcome: 'success' | 'failed' | 'cancelled' | undefined
  let providerTestErrorCode: string | undefined
  let providerTestCallCount = 0
  let providerTestUsageCount = 0
  let providerTestInputTokens = 0
  let providerTestOutputTokens = 0
  let providerTestInputKnown = true
  let providerTestOutputKnown = true
  const providerTestOperationId = createAnalyticsOperationId()
  testLoading.value = true
  testAbortController.value = controller
  testingProfileId.value = profile?.id ?? null
  try {
    const result = await generateCopywriting({
      llmConfig: requestConfig,
      copywritingConfig: structuredClone(
        toRaw(profile ? appStore.copywritingConfig : copyConfig.value),
      ),
      prompt: '请写一句简短、自然的口播开场白。',
      abortSignal: controller.signal,
      onRequestStart: () => {
        providerTestCallCount += 1
      },
      onUsage: (usage) => {
        providerTestUsageCount += 1
        if (usage.inputTokens === undefined) providerTestInputKnown = false
        else providerTestInputTokens += usage.inputTokens
        if (usage.outputTokens === undefined) providerTestOutputKnown = false
        else providerTestOutputTokens += usage.outputTokens
      },
    })
    if (currentTestRequestId !== testRequestId.value) return
    if (controller.signal.aborted || result.status === 'cancelled') {
      providerTestOutcome = 'cancelled'
      return
    }
    if (result.unclosedThinkingOutput)
      throw new Error(t('features.llm.errors.unclosedThinkingOutput') as string)
    if (result.status !== 'completed') throw new Error(result.status)
    if (profile) profileTestStatus.value.set(profile.id, { status: 'success' })
    else testResult.value = 'success'
    providerTestOutcome = 'success'
  } catch (error) {
    if (currentTestRequestId === testRequestId.value && controller.signal.aborted) {
      providerTestOutcome = 'cancelled'
    } else if (currentTestRequestId === testRequestId.value) {
      if (profile) profileTestStatus.value.set(profile.id, { status: 'error' })
      else testResult.value = 'error'
      providerTestOutcome = 'failed'
      providerTestErrorCode = getErrorCode(error)
      showError(t('features.llm.errors.connectionFailed') as string, error, requestConfig)
    }
  } finally {
    if (currentTestRequestId === testRequestId.value) {
      // Duration is intentionally not reported for a cancelled or superseded test.
      if (providerTestOutcome) {
        trackAnalytics('provider_test_finished', {
          operation_id: providerTestOperationId,
          outcome: providerTestOutcome,
          protocol: requestConfig.protocol,
          provider_category: getProviderCategory(requestConfig.protocol),
          ...(providerTestErrorCode ? { error_code: providerTestErrorCode } : {}),
          duration_ms: Math.max(0, Math.floor(performance.now() - testStartedAt)),
          llm_call_count: providerTestCallCount,
          llm_usage_complete:
            providerTestCallCount > 0 &&
            providerTestUsageCount === providerTestCallCount &&
            providerTestInputKnown &&
            providerTestOutputKnown,
          ...(providerTestInputKnown && providerTestUsageCount > 0
            ? { input_tokens: providerTestInputTokens }
            : {}),
          ...(providerTestOutputKnown && providerTestUsageCount > 0
            ? { output_tokens: providerTestOutputTokens }
            : {}),
        })
      }
      testLoading.value = false
      testAbortController.value = null
      testingProfileId.value = null
    }
  }
}
defineExpose({
  handleGenerate,
  handleStopGenerate,
  getTextForSynthesis,
  getGenerationAnalytics: () => latestGenerationAnalytics.value,
  getCurrentOutputText: () => outputText.value,
  clearOutputText,
})
</script>

<style scoped>
.copywriting-output :deep(.v-counter) {
  flex-shrink: 0;
}
.llm-config-card {
  --llm-config-gutter: 16px;
}
.provider-profile-bar {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  gap: 8px;
}
.provider-model-heading {
  justify-content: space-between;
}
.provider-page-heading {
  display: flex;
  align-items: center;
  gap: 4px;
}
.saved-provider-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 10px;
}
.saved-provider-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  border: 1px solid rgba(var(--v-theme-on-surface), 0.16);
  border-radius: 8px;
}
.saved-provider-row:hover,
.saved-provider-row:has(.saved-provider-card[aria-pressed='true']) {
  background: rgba(var(--v-theme-primary), 0.06);
}
.saved-provider-row:has(.saved-provider-card[aria-pressed='true']) {
  border-color: rgb(var(--v-theme-primary));
}
.saved-provider-actions {
  display: flex;
  align-items: center;
  padding-inline-end: 4px;
}
.saved-provider-test-status {
  font-size: 0.75rem;
  max-width: 6em;
  line-height: 1.2;
}
.provider-footer-status {
  min-width: 0;
  font-size: 0.8125rem;
  overflow-wrap: anywhere;
}
.saved-provider-card {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 4px;
  min-width: 0;
  min-height: 78px;
  padding: 10px 12px;
  border-radius: 8px;
  text-align: start;
  overflow-wrap: anywhere;
}
.saved-provider-card:focus-visible {
  outline: 2px solid rgb(var(--v-theme-primary));
  outline-offset: 1px;
}
.saved-provider-name {
  font-weight: 600;
}
.saved-provider-model,
.provider-empty {
  color: rgba(var(--v-theme-on-surface), 0.7);
}
.saved-provider-model,
.saved-provider-active {
  font-size: 0.8125rem;
}
.saved-provider-model {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px 8px;
}
.saved-provider-active {
  color: rgb(var(--v-theme-primary));
  background: rgba(var(--v-theme-primary), 0.12);
  border-radius: 999px;
  padding-inline: 6px;
  white-space: nowrap;
}
.llm-config-card > .llm-config-tabs {
  flex: 0 0 auto;
  padding-inline: var(--llm-config-gutter);
}
.llm-config-card > .llm-config-body {
  flex: 0 1 auto;
  min-height: 0;
  overflow-y: auto;
  padding: 20px 0 16px;
}
.llm-config-panel {
  /* Keep the gutter inside v-window so switch shadows clear its clipping edge. */
  padding: 4px var(--llm-config-gutter);
}
.llm-config-form > :deep(.v-input) {
  flex: 0 0 auto;
}
.llm-config-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}
.llm-header-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) 40px;
  align-items: start;
  gap: 8px;
}
.llm-config-grid > :deep(.v-input),
.llm-header-row > :deep(.v-input) {
  min-width: 0;
  width: 100%;
}
@media (max-width: 480px) {
  .llm-config-card {
    --llm-config-gutter: 12px;
  }
  .llm-config-grid {
    grid-template-columns: minmax(0, 1fr);
  }
  .llm-header-row {
    grid-template-columns: minmax(0, 1fr) 40px;
  }
  .llm-header-row > :deep(.v-input) {
    grid-column: 1;
  }
  .llm-header-remove {
    grid-column: 2;
    grid-row: 1 / span 2;
  }
}
</style>
