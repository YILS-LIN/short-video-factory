// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { creativeStrategies, buildDiversityInstructions } from '../../src/lib/llm/diversity'
import { assessSimilarity } from '../../src/lib/llm/similarity'
import {
  clearCopywritingHistory,
  getCopywritingHistory,
  getCopywritingTaskId,
  saveCopywritingHistory,
  takeNextCreativeStrategy,
} from '../../src/store/copywriting-history'

afterEach(() => clearCopywritingHistory())

describe('diversity strategy and history', () => {
  it('rotates through strategies without replacement and avoids a repeated cycle boundary', () => {
    const taskId = getCopywritingTaskId({ request: '需求', systemPromptMode: 'off' })
    const firstCycle = creativeStrategies.map(() =>
      takeNextCreativeStrategy(taskId, creativeStrategies),
    )
    expect(new Set(firstCycle.map(({ id }) => id)).size).toBe(creativeStrategies.length)
    const next = takeNextCreativeStrategy(taskId, creativeStrategies)
    expect(next.id).not.toBe(firstCycle.at(-1)?.id)
  })

  it('separates task history by prompt and prompt mode but not model configuration', () => {
    const taskA = getCopywritingTaskId({
      request: '  同一需求\r\n第二行  ',
      systemPromptMode: 'builtin',
      systemPrompt: 'rules',
    })
    const taskB = getCopywritingTaskId({
      request: '同一需求\n第二行',
      systemPromptMode: 'builtin',
      systemPrompt: 'rules',
    })
    const taskC = getCopywritingTaskId({
      request: '同一需求\n第二行',
      systemPromptMode: 'custom',
      systemPrompt: 'rules',
    })
    expect(taskA).toBe(taskB)
    expect(taskA).not.toBe(taskC)
  })

  it('keeps a bounded, newest-first history and supports clearing it', () => {
    const taskId = getCopywritingTaskId({ request: '历史测试', systemPromptMode: 'off' })
    for (let index = 0; index < 6; index += 1)
      saveCopywritingHistory(taskId, `第 ${index} 篇文案`, 'scene')
    expect(getCopywritingHistory(taskId).map(({ text }) => text)).toEqual([
      '第 5 篇文案',
      '第 4 篇文案',
      '第 3 篇文案',
    ])
    expect(clearCopywritingHistory()).toBe(true)
    expect(getCopywritingHistory(taskId)).toEqual([])
  })

  it('quotes history as reference material and preserves user requirements in its instruction', () => {
    const instructions = buildDiversityInstructions(
      creativeStrategies[0],
      [{ text: '历史文案正文', strategyId: 'scene' }],
      '首稿内容',
    )
    expect(instructions).toContain('用户明确提出的事实')
    expect(instructions).toContain('历史文案正文')
    expect(instructions).toContain('首稿内容')
  })
})

describe('copy similarity assessment', () => {
  it('detects exact duplicate after punctuation and whitespace normalization', () => {
    expect(
      assessSimilarity('欢迎来到这里！今天一起开始。', [
        { id: 'old', text: '欢迎 来到这里 今天一起开始', complete: true },
      ]),
    ).toMatchObject({ highlySimilar: true, score: 1, reason: 'exact' })
  })

  it('does not mark short or same-topic but differently worded scripts as duplicates', () => {
    expect(
      assessSimilarity('这款产品方便日常使用。', [
        { id: 'old', text: '这款产品适合放在办公室。', complete: true },
      ]).highlySimilar,
    ).toBe(false)
    expect(
      assessSimilarity('为忙碌的早晨准备一份简单早餐，可以节省时间，也能让一天的开始更从容。', [
        {
          id: 'old',
          text: '早上时间紧张时，提前准备一顿方便的早餐，让你不用匆忙，也能轻松开启新一天。',
          complete: true,
        },
      ]).highlySimilar,
    ).toBe(false)
  })

  it('flags a long script that differs only by small wording changes', () => {
    const original =
      '今天我们来聊聊这款便携咖啡机。它体积小巧，操作简单，适合通勤、旅行和办公室使用。只需加入咖啡粉和热水，按下按钮即可快速制作一杯咖啡。无需复杂设置，也不用占用太多空间，让你在忙碌的日常里随时享受一杯喜欢的咖啡。'
    const lightlyEdited =
      '今天我们来聊聊这款便携咖啡机。它体积小巧，操作简单，适合通勤、旅行和办公室使用。只需加入咖啡粉和热水，按下按钮即可轻松制作一杯咖啡。无需复杂设置，也不用占用太多空间，让你在忙碌的日常里随时享受一杯喜欢的咖啡。'
    expect(
      assessSimilarity(lightlyEdited, [{ id: 'old', text: original, complete: true }])
        .highlySimilar,
    ).toBe(true)
  })

  it('ignores partial history entries for full-text matching', () => {
    expect(
      assessSimilarity('相同正文', [{ id: 'old', text: '相同正文', complete: false }])
        .highlySimilar,
    ).toBe(false)
  })
})
