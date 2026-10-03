import {
  CALIBRATION_KEY,
  reconcileCalibrationRows,
} from './calibration'
import { SEED_ROWS } from './seed'
import type { EntryRow } from './types'

// 本地持久化：数据放在 localStorage 里，刷新、关掉再打开都还在。
const STORAGE_KEY = 'hydrology-monitor-station:entries'
// 本地数据结构版本：旧版本数据按版本号迁移，迁移逻辑只在升版时执行一次。
const VERSION_KEY = 'hydrology-monitor-station:version'
const CURRENT_VERSION = 2

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function seedSnapshot(): Record<string, EntryRow[]> {
  const snapshot: Record<string, EntryRow[]> = {}
  for (const [key, rows] of Object.entries(SEED_ROWS)) {
    snapshot[key] = clone(rows)
  }
  return snapshot
}

type StorageBackend = {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

function getBackend(): StorageBackend | null {
  if (typeof window === 'undefined' || !window.localStorage) {
    return null
  }
  return window.localStorage
}

function persist(backend: StorageBackend | null, rows: Record<string, EntryRow[]>): void {
  if (backend) {
    backend.setItem(STORAGE_KEY, JSON.stringify(rows))
  }
}

// 检定模块对账：迁移旧示例、补齐演示数据、有效期兜底；其他模块保持原样。
function reconcileModules(
  rows: Record<string, EntryRow[]>,
): { rows: Record<string, EntryRow[]>; changed: boolean } {
  const calibration = rows[CALIBRATION_KEY]
  if (!calibration) {
    return { rows, changed: false }
  }
  const result = reconcileCalibrationRows(calibration)
  if (!result.changed) {
    return { rows, changed: false }
  }
  return { rows: { ...rows, [CALIBRATION_KEY]: result.rows }, changed: true }
}

// 启动初始化：
// - 全新环境：播种当前版本演示数据；
// - 旧版本（含旧版仪器检定占位示例）：迁移到新版本，旧示例记录替换为新演示数据且不重复；
// - 已有业务数据：用户录入一律跳过保留，只补缺的内置演示记录；
// - 重复初始化：结果幂等，不改变已录入内容。
export function bootstrapStore(backend?: StorageBackend): Record<string, EntryRow[]> {
  const storage = backend ?? getBackend()
  const fallback = seedSnapshot()
  if (!storage) {
    return fallback
  }

  const raw = storage.getItem(STORAGE_KEY)
  const version = Number(storage.getItem(VERSION_KEY)) || 1

  if (!raw) {
    const seeded = seedSnapshot()
    const { rows } = reconcileModules(seeded)
    persist(storage, rows)
    storage.setItem(VERSION_KEY, String(CURRENT_VERSION))
    cache = rows
    return rows
  }

  let parsed: Record<string, EntryRow[]>
  try {
    parsed = JSON.parse(raw) as Record<string, EntryRow[]>
    if (!parsed || typeof parsed !== 'object') {
      throw new Error('invalid entries payload')
    }
  } catch {
    const seeded = seedSnapshot()
    persist(storage, seeded)
    storage.setItem(VERSION_KEY, String(CURRENT_VERSION))
    cache = seeded
    return seeded
  }

  // 新版本里新增的模块：旧库缺键时补演示数据；已有的键完全以浏览器里的数据为准。
  let next: Record<string, EntryRow[]> = { ...fallback, ...parsed }
  if (version < CURRENT_VERSION) {
    const reconciled = reconcileModules(next)
    next = reconciled.rows
    storage.setItem(VERSION_KEY, String(CURRENT_VERSION))
    persist(storage, next)
  }
  cache = next
  return next
}

let cache: Record<string, EntryRow[]> | null = null

// 清掉内存缓存，下次读取重新走初始化。页面正常运行用不到；
// 构建前检查需要在同一进程里模拟多个独立环境时使用。
export function resetStoreCache(): void {
  cache = null
}

export function allRows(): Record<string, EntryRow[]> {
  if (cache === null) {
    cache = bootstrapStore()
  }
  return cache
}

export function listRows(key: string): EntryRow[] {
  return allRows()[key] ?? []
}

export function saveRows(key: string, rows: EntryRow[]): void {
  const next = { ...allRows(), [key]: rows }
  cache = next
  const backend = getBackend()
  if (backend) {
    backend.setItem(STORAGE_KEY, JSON.stringify(next))
  }
}

export function resetRows(key: string): EntryRow[] {
  const rows = clone(SEED_ROWS[key] ?? [])
  saveRows(key, rows)
  return rows
}

export function storageKey(): string {
  return STORAGE_KEY
}

export function storageVersionKey(): string {
  return VERSION_KEY
}

export { CURRENT_VERSION as STORE_VERSION }
