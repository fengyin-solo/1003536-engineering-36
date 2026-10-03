import { bootstrapEntries, SCHEMA_VERSION, VERSION_KEY } from './bootstrap'
import { SEED_ROWS } from './seed'
import type { EntryRow } from './types'

// 本地持久化：数据放在 localStorage 里，刷新、关掉再打开都还在。
const STORAGE_KEY = 'hydrology-monitor-station:entries'

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function hasStorage(): boolean {
  return typeof window !== 'undefined' && !!window.localStorage
}

function persist(entries: Record<string, EntryRow[]>): void {
  if (!hasStorage()) {
    return
  }
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(entries))
  window.localStorage.setItem(VERSION_KEY, String(SCHEMA_VERSION))
}

// 读存储并跑一次本地初始化：新环境播种、旧版样例迁移、有效期兜底都在这里完成。
function readStorage(now: Date = new Date()): Record<string, EntryRow[]> {
  if (!hasStorage()) {
    return clone(SEED_ROWS)
  }
  let stored: Record<string, EntryRow[]> | null = null
  const raw = window.localStorage.getItem(STORAGE_KEY)
  if (raw) {
    try {
      stored = JSON.parse(raw) as Record<string, EntryRow[]>
    } catch {
      // 存储损坏：落回种子数据重新初始化。
      stored = null
    }
  }
  const outcome = bootstrapEntries(stored, now)
  // changed=true 只表示“按规则处理过”，幂等时内容不会变化；持久化仍可安全重复执行。
  persist(outcome.entries)
  return outcome.entries
}

let cache: Record<string, EntryRow[]> | null = null

export function allRows(now: Date = new Date()): Record<string, EntryRow[]> {
  if (cache === null) {
    cache = readStorage(now)
  }
  return cache
}

// 构建前检查用：清掉内存缓存，强制重新走一遍 localStorage 初始化链路。
export function __resetCacheForTest(): void {
  cache = null
}

// 供测试 / 外部重新初始化使用：确保存储已读入后，再跑一遍幂等的初始化流程。
export function initLocalStore(now: Date = new Date()): Record<string, EntryRow[]> {
  if (cache === null) {
    cache = readStorage(now)
  } else {
    const outcome = bootstrapEntries(cache, now)
    cache = outcome.entries
    persist(cache)
  }
  return cache
}

export function listRows(key: string): EntryRow[] {
  return allRows()[key] ?? []
}

export function saveRows(key: string, rows: EntryRow[]): void {
  const next = { ...allRows(), [key]: rows }
  cache = next
  persist(next)
}

export function resetRows(key: string): EntryRow[] {
  const rows = clone(SEED_ROWS[key] ?? [])
  saveRows(key, rows)
  return rows
}

export function storageKey(): string {
  return STORAGE_KEY
}
