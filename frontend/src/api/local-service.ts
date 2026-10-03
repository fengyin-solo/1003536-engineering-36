import {
  CALIBRATION_KEY,
  deriveCalibrationTodos,
  normalizeCalibrationRow,
} from '@/data/calibration'
// 各模块除「停用/驳回」类负向动作外，还需要显式标红的状态（检定不合格必须进入异常待办）。
const ABNORMAL_STATUSES_BY_KEY: Record<string, string[]> = {
  [CALIBRATION_KEY]: ['不合格'],
}
import { MODULE_BY_KEY } from '@/data/modules'
import { allRows, listRows, resetRows, saveRows } from '@/data/local-store'
import type {
  ActionResult,
  CalibrationTodo,
  EntryRow,
  ModuleMeta,
  OverviewResult,
  PageResult,
} from '@/data/types'

// 会写进数据的「往回走」动作：命中就把这条记录标成异常态，看板上能一眼看出来。
const NEGATIVE_ACTIONS = ['撤销', '作废', '拒绝', '驳回', '停用', '忽略', '下线', '回滚']

export function moduleMeta(key: string): ModuleMeta {
  const meta = MODULE_BY_KEY.get(key)
  if (!meta) {
    throw new Error(`没有登记名为 ${key} 的业务模块`)
  }
  return meta
}

export function filterRows(rows: EntryRow[], filters: Record<string, string>): EntryRow[] {
  const pairs = Object.entries(filters).filter(([, value]) => value.trim() !== '')
  if (pairs.length === 0) {
    return rows
  }
  return rows.filter((row) =>
    pairs.every(([field, value]) => String(row[field] ?? '').includes(value.trim())),
  )
}

export function listEntries(key: string, filters: Record<string, string> = {}): PageResult {
  const matched = filterRows(listRows(key), filters)
  return { items: matched, total: matched.length, page: 1, size: matched.length }
}

export function runAction(key: string, id: number, action: string): ActionResult {
  const meta = moduleMeta(key)
  const target = meta.actionTargets[action]
  if (!target) {
    return { ok: false, message: `${meta.entity}没有登记「${action}」这个动作` }
  }
  const rows = listRows(key)
  const index = rows.findIndex((row) => Number(row.id) === id)
  if (index < 0) {
    return { ok: false, message: `没有找到编号为 ${id} 的${meta.entity}` }
  }
  const current = String(rows[index].status)
  if (current === target) {
    return { ok: false, message: `${meta.entity}已经是「${target}」，不用重复操作` }
  }
  const lastStatus = meta.statuses[meta.statuses.length - 1]
  const abnormalStatuses = new Set(ABNORMAL_STATUSES_BY_KEY[key] ?? [])
  const updated: EntryRow = {
    ...rows[index],
    status: target,
    pending: target !== lastStatus,
    abnormal:
      abnormalStatuses.has(target) ||
      NEGATIVE_ACTIONS.some((verb) => action.startsWith(verb)),
  }
  const next = [...rows]
  next[index] = updated
  saveRows(key, next)
  return { ok: true, message: `${meta.entity}已${action}，当前状态「${target}」` }
}

export function resetModule(key: string): PageResult {
  resetRows(key)
  return listEntries(key)
}

export function exportEntries(key: string): { filename: string; content: string } {
  const meta = moduleMeta(key)
  const header = ['编号', ...meta.fields, '当前状态']
  const lines = [header.join(',')]
  for (const row of listRows(key)) {
    lines.push([row.id, ...meta.fields.map((field) => row[field] ?? ''), row.status].join(','))
  }
  return { filename: `${meta.name}-清单.csv`, content: `\uFEFF${lines.join('\n')}` }
}

export function downloadEntries(key: string): void {
  const { filename, content } = exportEntries(key)
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  document.body.removeChild(anchor)
  URL.revokeObjectURL(url)
}

export function loadOverview(): OverviewResult {
  const rows = allRows()
  const modules = [...MODULE_BY_KEY.values()].map((meta) => {
    const entries = rows[meta.key] ?? []
    return {
      name: meta.name,
      created: entries.length,
      pending: entries.filter((row) => row.pending).length,
      abnormal: entries.filter((row) => row.abnormal).length,
    }
  })
  const cards = [
    { label: '业务模块', value: modules.length },
    { label: '登记总量', value: modules.reduce((sum, item) => sum + item.created, 0) },
    { label: '待处理', value: modules.reduce((sum, item) => sum + item.pending, 0) },
    { label: '异常量', value: modules.reduce((sum, item) => sum + item.abnormal, 0) },
  ]
  return { cards, modules }
}

// 仪器检定记录读取：统一走 normalize，检定状态字段、有效期兜底、pending/abnormal
// 都在同一处保证一致，检定页、巡检待办、站房台账拿到的永远是同一批校准后的数据。
export function listCalibrationRows(): EntryRow[] {
  return listRows(CALIBRATION_KEY).map(normalizeCalibrationRow)
}

// 检定页的状态统计：待送检 / 已合格 / 不合格三类仪器计数，直接取同一份检定数据。
export function calibrationStatusSummary(): { label: string; value: number }[] {
  const rows = listCalibrationRows()
  const count = (status: string) => rows.filter((row) => String(row.status) === status).length
  return [
    { label: '待送检仪器', value: count('待送检') + count('送检中') },
    { label: '已合格仪器', value: count('已合格') },
    { label: '不合格仪器', value: count('不合格') },
  ]
}

// 检定待办的唯一数据源。巡检页和站房台账都调用它，保证取到同一批检定数据。
// today 仅测试/检查时注入固定基准日，生产代码不传，取当天。
export function calibrationTodos(today?: Date): CalibrationTodo[] {
  return deriveCalibrationTodos(listCalibrationRows(), today)
}

// 巡检待办：直接取仪器检定派生的待办，另一个页面与检定页看到的是同一批数据。
export function inspectionCalibrationTodos(today?: Date): CalibrationTodo[] {
  return calibrationTodos(today)
}

// 站房维护台账：仪器检定相关的维护台账同样取这批待办，
// 不合格/待送检仪器的复检与处置要落到站房维护工作里。
export function stationhouseCalibrationLedger(today?: Date): CalibrationTodo[] {
  return calibrationTodos(today)
}
