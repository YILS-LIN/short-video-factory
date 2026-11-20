import { beforeEach, describe, expect, it, vi } from 'vitest'
import random from 'random'
import { planVideoSegments, resolveSegmentSettings } from '../../src/lib/video-segments'

vi.mock('random', () => ({ default: { int: vi.fn() } }))

const pickInt = vi.mocked(random.int)
const plan = (mode: unknown, duration: number, sourceDurations: Record<string, number>, order?: unknown) =>
  planVideoSegments({
    assets: Object.keys(sourceDurations).map((path) => ({ path, name: path })),
    duration,
    settings: resolveSegmentSettings(mode, order),
    readDuration: async (path) => sourceDurations[path],
    onUnreadable: vi.fn(),
  })

describe('video segment planning', () => {
  beforeEach(() => {
    pickInt.mockReset().mockImplementation((min = 0) => min)
  })

  it.each([
    ['standard', 15],
    ['long', 30],
  ])('caps %s clips at %s seconds', async (mode, cap) => {
    const result = await plan(mode, 40, { a: 40 })
    expect(result.timeRanges).toEqual(
      [
        ['0.000', `${cap}.000`],
        [`${cap}.000`, '40.000'],
      ].flatMap(([start, end]) =>
        cap === 15 && start === '15.000'
          ? [
              [start, '30.000'],
              ['30.000', end],
            ]
          : [[start, end]],
      ),
    )
  })

  it('extends a first round of short random cuts before repeating a source', async () => {
    const result = await plan('standard', 28, { a: 20, b: 20 })
    expect(result).toEqual({
      videoFiles: ['a', 'b'],
      timeRanges: [
        ['0.000', '15.000'],
        ['0.000', '13.000'],
      ],
    })
  })

  it('uses both gaps around a random cut before allowing overlap', async () => {
    pickInt.mockImplementation((min = 0, max = min) => (max === 38_000 ? 10_000 : min))
    const result = await plan('standard', 42, { a: 40 })
    expect(result.timeRanges).toEqual([
      ['10.000', '25.000'],
      ['25.000', '40.000'],
      ['0.000', '10.000'],
      ['10.000', '12.000'],
    ])
  })

  it('avoids an adjacent same-source clip whenever another eligible source exists', async () => {
    const result = await plan('standard', 42, { a: 20, b: 20 })
    expect(result.videoFiles).toEqual(['a', 'b', 'a', 'b', 'a'])
    expect(result.timeRanges).toEqual([
      ['0.000', '15.000'],
      ['0.000', '15.000'],
      ['15.000', '20.000'],
      ['15.000', '20.000'],
      ['0.000', '2.000'],
    ])
  })

  it('uses whole files in shuffled order and only trims the final clip', async () => {
    pickInt.mockImplementation((min = 0, max = min) => max)
    const result = await plan('whole', 37.125, { a: 12, b: 34 })
    expect(result).toEqual({
      videoFiles: ['b', 'a'],
      timeRanges: [
        ['0.000', '34.000'],
        ['0.000', '3.125'],
      ],
    })
    expect(pickInt.mock.calls).toEqual([
      [0, 1],
      [0, 0],
    ])
  })

  it('repeats whole files from the beginning when total footage is insufficient', async () => {
    const result = await plan('whole', 11.125, { a: 4, b: 5 })
    expect(result).toEqual({
      videoFiles: ['a', 'b', 'a'],
      timeRanges: [
        ['0.000', '4.000'],
        ['0.000', '5.000'],
        ['0.000', '2.125'],
      ],
    })
  })

  it('uses natural filename order, skips unreadable clips, and loops in that same order', async () => {
    const result = await plan('whole', 5, { '10.mp4': 2, '2.mp4': 2, '1.mp4': NaN }, 'filename')
    expect(result.videoFiles).toEqual(['2.mp4', '10.mp4', '2.mp4'])
    expect(result.timeRanges).toEqual([['0.000', '2.000'], ['0.000', '2.000'], ['0.000', '1.000']])
    expect(pickInt).not.toHaveBeenCalled()
  })

  it('ignores filename order outside whole mode', async () => {
    const result = await plan('standard', 2, { '10.mp4': 5, '2.mp4': 5 }, 'filename')
    expect(result.videoFiles).toEqual(['10.mp4'])
    expect(pickInt).toHaveBeenCalled()
  })

  it.each(['standard', 'long', 'whole'])('bounds the number of %s segments', async (mode) => {
    await expect(plan(mode, 1, { a: 0.001 })).rejects.toMatchObject({
      code: 'segmentLimit',
      limit: 100,
    })
  })
})
