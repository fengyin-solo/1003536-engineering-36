import type { EntryRow } from './types'

// 仪器检定域：演示数据、有效期兜底、待办派生、旧版本示例迁移都集中在这里，
// 检定页、巡检待办、站房维护台账三处共用同一份派生结果，避免各写一套对不上。

export const CALIBRATION_KEY = 'calibration'

export const CALIBRATION_STATUS = {
  pending: '待送检',
  sending: '送检中',
  passed: '已合格',
  failed: '不合格',
  disabled: '已停用',
} as const

// 终态：进入终态的记录不再挂待办。
const FINAL_STATUSES = new Set<string>([CALIBRATION_STATUS.disabled])
// 异常态：不合格的仪器需要处置。
const ABNORMAL_STATUSES = new Set<string>([CALIBRATION_STATUS.failed])

// 已合格且距有效期到期不足该天数时，提醒提前安排复检。
const RENEW_NOTICE_DAYS = 30

// 旧版本示例记录里这些字段都是同一句占位文案，靠它识别需要迁移的历史数据。
const LEGACY_PLACEHOLDER = '仪器检定样例'

// 演示仪器的检定日期都固定在 2026-10-03 前后，保证任何新环境启动都能稳定复现：
// 既有已过期需送检的，也有临期需复检的，还有不合格需处置的。
export const CALIBRATION_DEMO_ROWS: EntryRow[] = [
  {
    id: 1,
    status: CALIBRATION_STATUS.pending,
    pending: true,
    abnormal: false,
    记录编号: 'CALI-DEMO-001',
    仪器编号: 'YQ-SW-0001',
    仪器名称: '转子式流速仪',
    检定单位: '省水文仪器计量检定中心',
    检定日期: '2025-08-10',
    有效期至: '2026-08-10',
    检定结论: '上次检定已到期，需重新送检',
    检定状态: CALIBRATION_STATUS.pending,
  },
  {
    id: 2,
    status: CALIBRATION_STATUS.sending,
    pending: true,
    abnormal: false,
    记录编号: 'CALI-DEMO-002',
    仪器编号: 'YQ-SW-0002',
    仪器名称: '压力式水位计',
    检定单位: '市计量测试研究院',
    检定日期: '2026-09-28',
    有效期至: '',
    检定结论: '已送出，等待检定结果',
    检定状态: CALIBRATION_STATUS.sending,
  },
  {
    id: 3,
    status: CALIBRATION_STATUS.passed,
    pending: false,
    abnormal: false,
    记录编号: 'CALI-DEMO-003',
    仪器编号: 'YQ-YL-0001',
    仪器名称: '翻斗式雨量计',
    检定单位: '省水文仪器计量检定中心',
    检定日期: '2025-10-23',
    有效期至: '2026-10-23',
    检定结论: '检定合格',
    检定状态: CALIBRATION_STATUS.passed,
  },
  {
    id: 4,
    status: CALIBRATION_STATUS.passed,
    pending: false,
    abnormal: false,
    记录编号: 'CALI-DEMO-004',
    仪器编号: 'YQ-HD-0001',
    仪器名称: '超声波测深仪',
    检定单位: '市计量测试研究院',
    检定日期: '2025-06-18',
    有效期至: '2026-06-18',
    检定结论: '检定合格，有效期已过需复检',
    检定状态: CALIBRATION_STATUS.passed,
  },
  {
    id: 5,
    status: CALIBRATION_STATUS.passed,
    pending: false,
    abnormal: false,
    记录编号: 'CALI-DEMO-005',
    仪器编号: 'YQ-SL-0001',
    仪器名称: '电子天平（泥沙称量）',
    检定单位: '省水文仪器计量检定中心',
    检定日期: '2026-04-12',
    有效期至: '',
    检定结论: '检定合格',
    检定状态: CALIBRATION_STATUS.passed,
  },
  {
    id: 6,
    status: CALIBRATION_STATUS.failed,
    pending: true,
    abnormal: true,
    记录编号: 'CALI-DEMO-006',
    仪器编号: 'YQ-WQ-0001',
    仪器名称: '便携式多参数水质仪',
    检定单位: '市计量测试研究院',
    检定日期: '2026-09-20',
    有效期至: '',
    检定结论: '检定不合格，禁止继续使用',
    检定状态: CALIBRATION_STATUS.failed,
  },
  {
    id: 7,
    status: CALIBRATION_STATUS.disabled,
    pending: false,
    abnormal: false,
    记录编号: 'CALI-DEMO-007',
    仪器编号: 'YQ-SW-0003',
    仪器名称: '老式直立式水尺（备机）',
    检定单位: '省水文仪器计量检定中心',
    检定日期: '2024-03-01',
    有效期至: '2025-03-01',
    检定结论: '仪器老化已停用',
    检定状态: CALIBRATION_STATUS.disabled,
  },
]

// 演示记录编号集合：对账时只碰这些内置演示数据，用户录入的记录一律不动。
const DEMO_RECORD_NUMBERS = new Set(CALIBRATION_DEMO_ROWS.map((row) => String(row.记录编号)))

export function isDemoRecordNumber(recordNumber: unknown): boolean {
  return DEMO_RECORD_NUMBERS.has(String(recordNumber ?? ''))
}

// 旧版本示例记录：字段是「仪器检定样例N」占位文案、且没有演示记录编号。
export function isLegacyDemoRow(row: EntryRow): boolean {
  if (isDemoRecordNumber(row.记录编号)) {
    return false
  }
  const placeholders = ['有效期至', '检定结论', '检定状态', '仪器名称']
  return placeholders.some((field) => String(row[field] ?? '').includes(LEGACY_PLACEHOLDER))
}

export function parseDate(value: unknown): Date | null {
  if (typeof value !== 'string' || value.trim() === '') {
    return null
  }
  const matched = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim())
  if (!matched) {
    return null
  }
  const year = Number(matched[1])
  const month = Number(matched[2])
  const day = Number(matched[3])
  if (month < 1 || month > 12 || day < 1 || day > 31) {
    return null
  }
  const date = new Date(year, month - 1, day)
  // 过滤 2 月 30 日这种被 Date 自动进位的输入。
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    return null
  }
  return date
}

export function formatDate(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

// 检定有效期默认按检定日起算一整年。
export function plusOneYear(base: Date): Date {
  const next = new Date(base)
  next.setFullYear(next.getFullYear() + 1)
  // 处理 2 月 29 日进位问题，统一回退到 2 月 28 日。
  if (next.getDate() !== base.getDate()) {
    next.setDate(0)
  }
  return next
}

// 有效期兜底：已合格记录的「有效期至」缺失或无法解析时，按检定日 + 1 年补齐；
// 检定日也不合法时以当前日期兜底。其他状态（送检中/不合格/停用）不臆造有效期。
export function fallbackExpiryDate(row: EntryRow, today: Date = new Date()): string | null {
  if (String(row.status) !== CALIBRATION_STATUS.passed) {
    return null
  }
  if (parseDate(row.有效期至)) {
    return null
  }
  const base = parseDate(row.检定日期) ?? new Date(today.getFullYear(), today.getMonth(), today.getDate())
  return formatDate(plusOneYear(base))
}

// 统一校验记录的派生标记：检定状态字段跟随当前状态，pending/abnormal 按状态重算。
// 这样即便是旧版本数据或用户手工流转后的记录，三类状态与待办也始终对得上。
export function normalizeCalibrationRow(row: EntryRow): EntryRow {
  const status = String(row.status ?? '')
  const normalized: EntryRow = {
    ...row,
    status,
    检定状态: status,
    pending: !FINAL_STATUSES.has(status),
    abnormal: ABNORMAL_STATUSES.has(status),
  }
  const fallback = fallbackExpiryDate(normalized)
  if (fallback !== null) {
    normalized.有效期至 = fallback
  }
  return normalized
}

export type CalibrationTodoType = '待送检' | '待复检' | '不合格待处置'

export type CalibrationTodo = {
  type: CalibrationTodoType
  urgent: boolean
  recordId: number
  记录编号: string
  仪器编号: string
  仪器名称: string
  检定日期: string
  有效期至: string
  状态: string
  说明: string
}

function diffDays(from: Date, to: Date): number {
  const a = new Date(from.getFullYear(), from.getMonth(), from.getDate())
  const b = new Date(to.getFullYear(), to.getMonth(), to.getDate())
  return Math.round((b.getTime() - a.getTime()) / 86_400_000)
}

// 检定待办派生规则（三类仪器各对应一类待办）：
// 1. 待送检：证书已到期或没有有效证书，需尽快送出；
// 2. 已合格：证书临期（30 天内）或已过期，需安排复检；
// 3. 不合格：禁止继续使用，需维修后复检或报废处置。
export function deriveCalibrationTodos(rows: EntryRow[], today: Date = new Date()): CalibrationTodo[] {
  const todos: CalibrationTodo[] = []
  const now = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  for (const rawRow of rows) {
    const row = normalizeCalibrationRow(rawRow)
    const status = String(row.status)
    const expiry = parseDate(row.有效期至)
    const base: Omit<CalibrationTodo, 'type' | 'urgent' | '说明'> = {
      recordId: Number(row.id),
      记录编号: String(row.记录编号 ?? ''),
      仪器编号: String(row.仪器编号 ?? ''),
      仪器名称: String(row.仪器名称 ?? ''),
      检定日期: String(row.检定日期 ?? ''),
      有效期至: String(row.有效期至 ?? ''),
      状态: status,
    }
    if (status === CALIBRATION_STATUS.pending || status === CALIBRATION_STATUS.sending) {
      const expired = expiry === null || expiry.getTime() < now.getTime()
      todos.push({
        ...base,
        type: '待送检',
        urgent: expired,
        说明: expired
          ? '检定证书已到期（或尚无有效证书），请尽快送出检定'
          : '仪器待送检，请在证书到期前完成检定',
      })
      continue
    }
    if (status === CALIBRATION_STATUS.passed) {
      if (expiry === null) {
        todos.push({
          ...base,
          type: '待复检',
          urgent: true,
          说明: '有效期信息缺失已按检定日 +1 年兜底，请核实后安排复检',
        })
        continue
      }
      const daysLeft = diffDays(now, expiry)
      if (daysLeft < 0) {
        todos.push({
          ...base,
          type: '待复检',
          urgent: true,
          说明: `检定证书已过期 ${-daysLeft} 天，请立即安排复检`,
        })
      } else if (daysLeft <= RENEW_NOTICE_DAYS) {
        todos.push({
          ...base,
          type: '待复检',
          urgent: false,
          说明: `检定证书将于 ${daysLeft} 天后到期，请提前安排复检`,
        })
      }
      continue
    }
    if (status === CALIBRATION_STATUS.failed) {
      todos.push({
        ...base,
        type: '不合格待处置',
        urgent: true,
        说明: '检定不合格，仪器已停用并挂牌，需维修复检或报废处置',
      })
    }
  }
  const typeWeight: Record<CalibrationTodoType, number> = {
    不合格待处置: 0,
    待送检: 1,
    待复检: 2,
  }
  return todos.sort((a, b) => {
    if (a.type !== b.type) {
      return typeWeight[a.type] - typeWeight[b.type]
    }
    if (a.urgent !== b.urgent) {
      return a.urgent ? -1 : 1
    }
    return a.recordId - b.recordId
  })
}

// 检定模块初始化对账：
// - 旧版本示例（占位文案）整批迁移为新演示数据；
// - 已有的用户录入记录全部保留（跳过，不覆盖）；
// - 缺失的演示数据按记录编号补齐，已存在的演示记录保留现状（重复初始化不改变已录入结果）；
// - 已合格记录缺失的有效期统一兜底；
// - id 去重并保持演示记录在前、用户记录在后，顺序稳定，重复执行结果不变。
export function reconcileCalibrationRows(stored: EntryRow[]): { rows: EntryRow[]; changed: boolean } {
  const legacyStored = stored.filter(isLegacyDemoRow)
  const retainedStored = stored.filter((row) => !isLegacyDemoRow(row))
  const beforeSignature = JSON.stringify(stored)

  const usedIds = new Set<number>()
  const next: EntryRow[] = []

  const takeId = (preferred: number): number => {
    let id = preferred
    while (usedIds.has(id)) {
      id += 1
    }
    usedIds.add(id)
    return id
  }

  // 1. 演示数据：已有同记录编号的保留现状，缺失的从模板补齐。
  for (const demo of CALIBRATION_DEMO_ROWS) {
    const existing = retainedStored.find((row) => String(row.记录编号) === String(demo.记录编号))
    if (existing) {
      const normalized = normalizeCalibrationRow(existing)
      normalized.id = takeId(Number(existing.id))
      next.push(normalized)
    } else {
      const fresh = normalizeCalibrationRow({ ...demo, id: demo.id })
      fresh.id = takeId(Number(demo.id))
      next.push(fresh)
    }
  }

  // 2. 用户录入（以及旧版本上已做过修改、不再是纯占位文案的记录）原样保留，仅补齐派生标记与有效期。
  const userRows = retainedStored.filter((row) => !isDemoRecordNumber(row.记录编号))
  for (const row of userRows) {
    const normalized = normalizeCalibrationRow(row)
    normalized.id = takeId(Number(row.id))
    next.push(normalized)
  }

  const afterSignature = JSON.stringify(next)
  // 旧示例被迁移、或确实有内容变化时才算 changed；纯重复对账不再落盘。
  const changed = legacyStored.length > 0 || beforeSignature !== afterSignature
  return { rows: next, changed }
}
