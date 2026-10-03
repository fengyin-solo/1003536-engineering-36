// 仅供构建前检查脚本使用：复用浏览器侧本地存储实现，并补一个 Node 友好的
// 缓存复位入口与状态流转函数（页面正式入口仍走 @/api/local-service）。
import { MODULE_BY_KEY } from '../src/data/modules'
import {
  __resetCacheForTest,
  allRows as rawAllRows,
  resetRows,
  saveRows,
} from '../src/data/local-store'
import type { EntryRow } from '../src/data/types'

// 前检查固定“今天”为 2026-10-03，保证有效期兜底断言可复现。
export const PREFLIGHT_NOW = new Date(2026, 9, 3)

export function allRows() {
  return rawAllRows(PREFLIGHT_NOW)
}

export function listRows(key: string) {
  return rawAllRows(PREFLIGHT_NOW)[key] ?? []
}

export { resetRows, saveRows }

// 复位模块级内存缓存，强制下一次读取重新走 localStorage 初始化链路。
export function resetCache(): void {
  __resetCacheForTest()
}

// 与 local-service.runAction 同规则的简化版：只覆盖前检查用到的状态流转，
// 避免引入 '@/...' 路径别名（Node 直接执行时无法解析）。
const NEGATIVE_ACTIONS = ['撤销', '作废', '拒绝', '驳回', '停用', '忽略', '下线', '回滚', '不合格']

export function runAction(key: string, id: number, action: string): void {
  const meta = MODULE_BY_KEY.get(key)
  if (!meta) {
    throw new Error(`未知模块 ${key}`)
  }
  const target = meta.actionTargets[action]
  if (!target) {
    throw new Error(`未登记动作 ${action}`)
  }
  const rows = listRows(key)
  const index = rows.findIndex((row) => Number(row.id) === id)
  if (index < 0) {
    throw new Error(`找不到 id=${id}`)
  }
  const updated: EntryRow = {
    ...rows[index],
    status: target,
    pending: target !== meta.statuses[meta.statuses.length - 1],
    abnormal: NEGATIVE_ACTIONS.some((verb) => action.startsWith(verb)),
  }
  const next = [...rows]
  next[index] = updated
  saveRows(key, next)
}
