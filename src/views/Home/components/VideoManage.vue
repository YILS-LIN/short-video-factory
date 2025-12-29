<template>
  <div class="w-full h-full">
    <v-form class="w-full h-full" :disabled="disabled">
      <v-sheet class="h-full p-2 flex flex-col" border rounded>
        <div class="flex gap-2 mb-2">
          <v-text-field
            v-model="appStore.videoAssetsFolder"
            :label="t('videoManage.assetsFolderLabel')"
            density="compact"
            hide-details
            readonly
          >
          </v-text-field>
          <v-btn
            class="mt-[2px]"
            prepend-icon="mdi-folder-open"
            :disabled="disabled"
            @click="handleSelectFolder"
          >
            {{ t('common.select') }}
          </v-btn>
        </div>

        <div class="flex-1 h-0 w-full border">
          <div
            v-if="videoAssets.length"
            class="w-full max-h-full overflow-y-auto grid grid-cols-3 gap-2 p-2"
          >
            <div
              class="w-full h-full max-h-[200px]"
              v-for="(item, index) in videoAssets"
              :key="index"
            >
              <VideoAutoPreview
                :asset="item"
                @loaded="
                  (info) => {
                    videoInfoList[index] = info
                  }
                "
              />
            </div>
          </div>
          <v-empty-state
            v-else
            :headline="t('empty.noContent')"
            :text="t('empty.hintSelectFolder')"
          ></v-empty-state>
        </div>

        <div class="my-2">
          <v-btn
            block
            prepend-icon="mdi-refresh"
            :disabled="disabled || !appStore.videoAssetsFolder"
            :loading="refreshAssetsLoading"
            @click="refreshAssets"
          >
            {{ t('actions.refreshAssets') }}
          </v-btn>
        </div>
      </v-sheet>
    </v-form>
  </div>
</template>

<script lang="ts" setup>
import { h, onMounted, ref, toRaw } from 'vue'
import { useTranslation } from 'i18next-vue'
import { useAppStore } from '@/store'
import { useToast } from 'vue-toastification'
import { ListFilesFromFolderRecord } from '~/electron/types'
import { RenderVideoParams } from '~/electron/ffmpeg/types'
import VideoAutoPreview, { VideoInfo } from '@/components/VideoAutoPreview.vue'
import ActionToastEmbed from '@/components/ActionToastEmbed.vue'
import random from 'random'

const toast = useToast()
const appStore = useAppStore()
const { t } = useTranslation()

defineProps<{
  disabled?: boolean
}>()

// 选择文件夹
const handleSelectFolder = async () => {
  const folderPath = await window.electron.selectFolder({
    title: t('dialogs.selectAssetsFolderTitle'),
    defaultPath: appStore.videoAssetsFolder,
  })
  console.log('用户选择分镜素材文件夹，绝对路径：', folderPath)
  if (folderPath) {
    appStore.videoAssetsFolder = folderPath
    refreshAssets()
  }
}

// 刷新素材库
const videoAssets = ref<ListFilesFromFolderRecord[]>([])
const refreshAssetsLoading = ref(false)
const refreshAssets = async () => {
  if (!appStore.videoAssetsFolder) {
    return
  }
  refreshAssetsLoading.value = true
  try {
    const assets = await window.electron.listFilesFromFolder({
      folderPath: appStore.videoAssetsFolder,
    })
    console.log(`素材库刷新:`, assets)
    videoAssets.value = assets.filter((asset) => asset.name.endsWith('.mp4'))
    if (!videoAssets.value.length) {
      if (assets.length) {
        toast.warning(t('videoManage.noMp4InFolder'))
      } else {
        toast.warning(t('videoManage.emptyFolder'))
      }
    } else {
      toast.success(t('videoManage.readSuccess'))
    }
  } catch (error: any) {
    console.dir(error)
    const errorMessage = error?.error?.message || error?.message || error
    toast.error({
      component: {
        // 使用vnode方式创建自定义错误弹窗实例，以获得良好的类型提示
        render: () =>
          h(ActionToastEmbed, {
            message: t('videoManage.readFailed'),
            detail: String(errorMessage),
            actionText: t('actions.copyErrorDetail'),
            onActionTirgger: () => {
              navigator.clipboard.writeText(
                JSON.stringify({
                  message: t('videoManage.readFailed'),
                  detail: String(errorMessage),
                }),
              )
              toast.success(t('success.copySuccess'))
            },
          }),
      },
    })
  } finally {
    refreshAssetsLoading.value = false
  }
}
onMounted(() => {
  refreshAssets()
})

// 获取视频分镜随机素材片段
const videoInfoList = ref<VideoInfo[]>([])
const getVideoSegments = (options: { duration: number }) => {
  // 视频资源总时长
  const videeAssetsTotalDuration = videoInfoList.value.reduce((pre, cur) => pre + cur.duration, 0)

  // 判断素材库视频时长是否过短
  if (videeAssetsTotalDuration < 1) {
    throw new Error(t('errors.assetsDurationInsufficient'))
  }

  // 判断素材库是否满足TTS时长要求
  // if (videeAssetsTotalDuration < options.duration) {
  //   throw new Error(t('errors.assetsDurationInsufficient'))
  // }

  // 搜集随机素材片段
  const segments: Pick<RenderVideoParams, 'videoFiles' | 'timeRanges'> = {
    videoFiles: [],
    timeRanges: [],
  }
  const minSegmentDuration = 2
  const maxSegmentDuration = 15

  let currentTotalDuration = 0
  let tempVideoAssets = structuredClone(toRaw(videoAssets.value))
  const trunc3 = (n: number) => ((n * 1e3) << 0) / 1e3
  while (currentTotalDuration < options.duration) {
    // 如果素材库中没有剩余素材，时长还不够，重新来一轮
    if (tempVideoAssets.length === 0) {
      tempVideoAssets = structuredClone(toRaw(videoAssets.value))
      continue
    }

    // 获取一个随机素材以及相关信息
    const randomAsset = random.choice(tempVideoAssets)!
    const randomAssetIndex = videoAssets.value.findIndex((asset) => asset.path === randomAsset.path)
    const randomAssetInfo = videoInfoList.value[randomAssetIndex]

    // 删除已选素材
    tempVideoAssets.splice(randomAssetIndex, 1)

    // 如果素材时长小于最小片段时长，直接添加
    if (randomAssetInfo.duration < minSegmentDuration) {
      segments.videoFiles.push(randomAsset.path)
      segments.timeRanges.push([String(0), String(randomAssetInfo.duration)])
      currentTotalDuration = trunc3(currentTotalDuration + randomAssetInfo.duration)
      continue
    }

    // 如果素材时长大于最小片段时长，随机一个片段
    let randomSegmentDuration = random.float(
      minSegmentDuration,
      Math.min(maxSegmentDuration, randomAssetInfo.duration),
    )

    // 处理最后一个片段时长超出规划时长情况
    if (currentTotalDuration + randomSegmentDuration > options.duration) {
      randomSegmentDuration = options.duration - currentTotalDuration
    }

    // 处理最后一个片段时长小于最小片段时长情况
    if (options.duration - currentTotalDuration - randomSegmentDuration < minSegmentDuration) {
      if (options.duration - currentTotalDuration < randomAssetInfo.duration) {
        randomSegmentDuration = options.duration - currentTotalDuration
      }
    }

    let randomSegmentStart = random.float(0, randomAssetInfo.duration - randomSegmentDuration)

    segments.videoFiles.push(randomAsset.path)
    segments.timeRanges.push([
      String(trunc3(randomSegmentStart)),
      String(trunc3(randomSegmentStart + randomSegmentDuration)),
    ])
    currentTotalDuration = trunc3(currentTotalDuration + randomSegmentDuration)

    console.table([
      {
        素材名称: randomAsset.name,
        素材时长: randomAssetInfo.duration,
        片段开始: trunc3(randomSegmentStart),
        片段时长: trunc3(randomSegmentDuration),
      },
    ])
  }

  console.log('随机素材片段总时长:', currentTotalDuration)
  console.log('随机素材片段汇总:', segments)

  return segments
}

defineExpose({ getVideoSegments })
</script>

<style lang="scss" scoped>
//
</style>
