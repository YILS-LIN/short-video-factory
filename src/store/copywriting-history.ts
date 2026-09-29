import type { CreativeStrategy } from '@/lib/llm/diversity'

const STORAGE_KEY = 'copywriting-history-v1'
const MAX_TASKS = 20
const MAX_ENTRIES_PER_TASK = 5
const MAX_ENTRY_CHARACTERS = 6000
const MAX_DATABASE_STORAGE_BYTES = 1_000_000
const MAX_HISTORY_PROMPT_ENTRIES = 3

export interface CopywritingHistoryEntry {
  id: string
  text: string
  strategyId: string
  createdAt: number
  complete: boolean
}

interface HistoryTask {
  updatedAt: number
  queue: string[]
  lastStrategyId?: string
  entries: CopywritingHistoryEntry[]
}

interface HistoryDatabase {
  version: 1
  tasks: Record<string, HistoryTask>
}

const emptyDatabase = (): HistoryDatabase => ({ version: 1, tasks: {} })
const availableStorage = () => {
  try {
    return typeof localStorage === 'undefined' ? undefined : localStorage
  } catch {
    return undefined
  }
}

const isValidEntry = (entry: unknown): entry is CopywritingHistoryEntry => {
  if (!entry || typeof entry !== 'object') return false
  const value = entry as Partial<CopywritingHistoryEntry>
  return (
    typeof value.id === 'string' &&
    typeof value.text === 'string' &&
    typeof value.strategyId === 'string' &&
    typeof value.createdAt === 'number' &&
    typeof value.complete === 'boolean'
  )
}

const readDatabase = (): HistoryDatabase => {
  try {
    const raw = availableStorage()?.getItem(STORAGE_KEY)
    if (!raw) return emptyDatabase()
    const parsed = JSON.parse(raw) as Partial<HistoryDatabase>
    if (parsed.version !== 1 || !parsed.tasks || typeof parsed.tasks !== 'object')
      return emptyDatabase()
    const tasks = Object.create(null) as Record<string, HistoryTask>
    for (const [key, rawTask] of Object.entries(parsed.tasks)) {
      if (!rawTask || typeof rawTask !== 'object') continue
      const task = rawTask as Partial<HistoryTask>
      tasks[key] = {
        updatedAt: typeof task.updatedAt === 'number' ? task.updatedAt : 0,
        queue: Array.isArray(task.queue)
          ? task.queue.filter((item): item is string => typeof item === 'string')
          : [],
        lastStrategyId: typeof task.lastStrategyId === 'string' ? task.lastStrategyId : undefined,
        entries: Array.isArray(task.entries)
          ? task.entries.filter(isValidEntry).slice(-MAX_ENTRIES_PER_TASK)
          : [],
      }
    }
    return { version: 1, tasks }
  } catch {
    return emptyDatabase()
  }
}

const trimDatabase = (database: HistoryDatabase) => {
  const orderedTasks = Object.entries(database.tasks).sort(
    (left, right) => right[1].updatedAt - left[1].updatedAt,
  )
  database.tasks = Object.fromEntries(orderedTasks.slice(0, MAX_TASKS))

  let serialized = JSON.stringify(database)
  // localStorage strings are stored as UTF-16 code units in browser implementations.
  while (serialized.length * 2 > MAX_DATABASE_STORAGE_BYTES) {
    const oldestEntry = Object.entries(database.tasks)
      .flatMap(([key, task]) => task.entries.map((entry, index) => ({ key, task, entry, index })))
      .sort((left, right) => left.entry.createdAt - right.entry.createdAt)[0]
    if (!oldestEntry) break
    oldestEntry.task.entries.splice(oldestEntry.index, 1)
    if (!oldestEntry.task.entries.length) delete database.tasks[oldestEntry.key]
    serialized = JSON.stringify(database)
  }
  return serialized
}

const writeDatabase = (database: HistoryDatabase) => {
  try {
    const storage = availableStorage()
    if (!storage) return false
    storage.setItem(STORAGE_KEY, trimDatabase(database))
    return true
  } catch {
    return false
  }
}

const hash = (value: string, seed: number) => {
  let result = seed
  for (let index = 0; index < value.length; index += 1)
    result = Math.imul(result ^ value.charCodeAt(index), 16777619)
  return (result >>> 0).toString(36)
}

export function getCopywritingTaskId(input: {
  request: string
  systemPromptMode: string
  systemPrompt?: string
}): string {
  const canonical = JSON.stringify([
    input.systemPromptMode,
    (input.systemPrompt ?? '').trim().replace(/\r\n?/g, '\n'),
    input.request.trim().replace(/\r\n?/g, '\n'),
  ])
  return [2166136261, 2246822519, 3266489917, 668265263]
    .map((seed) => hash(canonical, seed))
    .join('-')
}

const getOrCreateTask = (database: HistoryDatabase, taskId: string): HistoryTask => {
  const task = database.tasks[taskId]
  if (task) return task
  const created: HistoryTask = { updatedAt: Date.now(), queue: [], entries: [] }
  database.tasks[taskId] = created
  return created
}

export function getCopywritingHistory(taskId: string): CopywritingHistoryEntry[] {
  const database = readDatabase()
  const task = database.tasks[taskId]
  if (!task) return []
  task.updatedAt = Date.now()
  writeDatabase(database)
  return task.entries.slice(-MAX_HISTORY_PROMPT_ENTRIES).reverse()
}

export function takeNextCreativeStrategy(
  taskId: string,
  strategies: CreativeStrategy[],
): CreativeStrategy {
  if (!strategies.length) throw new Error('At least one creative strategy is required')
  const database = readDatabase()
  const task = getOrCreateTask(database, taskId)
  const allowedIds = new Set(strategies.map(({ id }) => id))
  task.queue = [...new Set(task.queue.filter((id) => allowedIds.has(id)))]
  if (!task.queue.length) {
    task.queue = strategies.map(({ id }) => id)
    for (let index = task.queue.length - 1; index > 0; index -= 1) {
      const swapIndex = Math.floor(Math.random() * (index + 1))
      ;[task.queue[index], task.queue[swapIndex]] = [task.queue[swapIndex], task.queue[index]]
    }
    if (task.queue.length > 1 && task.queue[0] === task.lastStrategyId)
      [task.queue[0], task.queue[1]] = [task.queue[1], task.queue[0]]
  }
  const nextId = task.queue.shift()!
  task.lastStrategyId = nextId
  task.updatedAt = Date.now()
  writeDatabase(database)
  return strategies.find(({ id }) => id === nextId)!
}

export function saveCopywritingHistory(taskId: string, text: string, strategyId: string): boolean {
  const normalized = text.trim()
  if (!normalized) return false
  const database = readDatabase()
  const task = getOrCreateTask(database, taskId)
  const existing = task.entries.find((entry) => entry.text === normalized && entry.complete)
  if (existing) {
    existing.createdAt = Date.now()
    existing.strategyId = strategyId
    task.updatedAt = existing.createdAt
    task.entries = task.entries.filter((entry) => entry !== existing)
    task.entries.push(existing)
    return writeDatabase(database)
  }
  const createdAt = Date.now()
  task.entries.push({
    id: `${createdAt}-${Math.random().toString(36).slice(2, 8)}`,
    text: normalized.slice(0, MAX_ENTRY_CHARACTERS),
    strategyId,
    createdAt,
    complete: normalized.length <= MAX_ENTRY_CHARACTERS,
  })
  task.entries = task.entries.slice(-MAX_ENTRIES_PER_TASK)
  task.updatedAt = createdAt
  return writeDatabase(database)
}

export function getCopywritingHistoryTaskCount(): number {
  return Object.values(readDatabase().tasks).filter(({ entries }) => entries.length > 0).length
}

export function clearCopywritingHistory(): boolean {
  try {
    const storage = availableStorage()
    if (!storage) return false
    storage.removeItem(STORAGE_KEY)
    return true
  } catch {
    return false
  }
}
