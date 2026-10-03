import { SEED_ROWS } from './seed'
import type { CalibrationTodo, EntryRow } from './types'

// 本地数据结构版本：升级时靠它识别旧版演示记录并完成迁移。
export const SCHEMA_VERSION = 2
export const VERSION_KEY = 'hydrology-monitor-station:version'

// 需要做演示数据迁移 / 有效期兜底的模块：检定、巡检、站房台账共用同一批站房。
export const MANAGED_KEYS = ['calibration', 'inspection', 'stationhouse'] as const
export type ManagedKey = (typeof MANAGED_KEYS)[number]

export type BootstrapOutcome = {
  entries: Record<string, EntryRow[]>
  changed: boolean
  version: number
}

// 检定结论默认按有效期一年安排；无检定日期的从今天起算。
export const VALIDITY_FALLBACK_YEARS = 1
// 证书临期窗口：已合格但 30 天内到期的，也算一条待办。
export const EXPIRING_SOON_DAYS = 30

export function parseDate(value: unknown): Date | null {
  if (typeof value !== 'string') {
    return null
  }
  const text = value.trim()
  const matched = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text)
  if (!matched) {
    return null
  }
  const year = Number(matched[1])
  const month = Number(matched[2])
  const day = Number(matched[3])
  const date = new Date(year, month - 1, day)
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

export function addYears(value: string, years: number, now: Date): string {
  const base = parseDate(value) ?? now
  const next = new Date(base.getFullYear() + years, base.getMonth(), base.getDate())
  return formatDate(next)
}

// 站点统一编号规则：ST-001 青峰水文站 / ST-002 白沙水位站 / ST-003 石门雨量站。
export function stationCode(value: unknown): string {
  const matched = /^([A-Z]+-\d{3})/.exec(String(value ?? '').trim())
  return matched ? matched[1] : ''
}

// 旧版种子里，模块自身的业务字段写的全是「xxx样例N」占位文案。
// 注意只看旧版种子真正写过占位文案的业务字段：像「有效期至」这类用户也可能
// 填出非法值的字段不能算，否则会把正常业务记录误判成旧样例丢弃。
const LEGACY_MARKER_FIELDS: Record<ManagedKey, string[]> = {
  calibration: ['仪器名称', '检定单位', '检定结论', '检定状态'],
  inspection: ['巡检人员', '检查项目', '发现问题', '处理措施', '巡检状态'],
  stationhouse: ['维护类型', '维护内容', '维护单位', '维护状态'],
}

export function isLegacySampleRow(row: EntryRow, key?: ManagedKey): boolean {
  const fields = key ? LEGACY_MARKER_FIELDS[key] : [...new Set(Object.values(LEGACY_MARKER_FIELDS).flat())]
  return fields.some((field) => typeof row[field] === 'string' && String(row[field]).includes('样例'))
}

function fallbackExpiry(row: EntryRow, now: Date): string {
  return addYears(String(row['检定日期'] ?? ''), VALIDITY_FALLBACK_YEARS, now)
}

// 有效期兜底：检定记录的「有效期至」为空或不是合法日期时，按检定日期顺延一年。
// 只补有效期，不动状态和待办标记，重复执行时已有的值保持不变。
export function normalizeCalibrationRow(row: EntryRow, now: Date): boolean {
  if (parseDate(row['有效期至'])) {
    return false
  }
  row['有效期至'] = fallbackExpiry(row, now)
  return true
}

// 旧版（v1）三个模块种子第一条记录的默认标记：只有与默认值不一致，才说明
// 用户在旧样例上做过状态流转，迁移到新版演示数据时要保留这些录入结果。
const LEGACY_DEFAULT_FLAGS: Record<ManagedKey, { status: string; pending: boolean; abnormal: boolean }> = {
  calibration: { status: '待送检', pending: true, abnormal: false },
  inspection: { status: '待巡检', pending: true, abnormal: false },
  stationhouse: { status: '待安排', pending: true, abnormal: false },
}

function mergeModule(key: ManagedKey, rows: EntryRow[], now: Date): boolean {
  let changed = false
  const canonical = SEED_ROWS[key] ?? []

  // 记录编号是业务主键；旧版种子可能只有 id，用 id 兜底。
  const identityOf = (row: EntryRow): string =>
    `${String(row['记录编号'] ?? '')}#${Number(row.id)}`

  // 旧版示例记录按 id 就地迁移成新版演示数据，绝不新增，避免重复。
  const canonicalById = new Map<number, EntryRow>()
  for (const demo of canonical) {
    canonicalById.set(Number(demo.id), demo)
  }

  const usedIdentities = new Set<string>()
  const next: EntryRow[] = []

  for (const row of rows) {
    if (isLegacySampleRow(row, key)) {
      const replacement = canonicalById.get(Number(row.id))
      if (replacement) {
        // 就地升级到新版演示数据；但用户在旧版上做过的状态流转要保留，
        // 只在与旧版种子默认标记不一致时覆盖新种子的默认值。
        const legacyDefault = LEGACY_DEFAULT_FLAGS[key]
        const merged: EntryRow = { ...replacement }
        if (String(row.status) !== legacyDefault.status) {
          merged.status = String(row.status)
        }
        if (row.pending !== legacyDefault.pending) {
          merged.pending = Boolean(row.pending)
        }
        if (row.abnormal !== legacyDefault.abnormal) {
          merged.abnormal = Boolean(row.abnormal)
        }
        next.push(merged)
        usedIdentities.add(identityOf(replacement))
        changed = true
        continue
      }
      // 对不上新版槽位的旧样例：直接丢弃（纯占位记录，没有业务价值）。
      changed = true
      continue
    }

    // 已有业务数据一律保留，初始化只跳过、不覆盖。
    usedIdentities.add(identityOf(row))
    next.push(row)
  }

  // 补齐缺失的演示记录：新环境或被用户清空后都能稳定复现三类仪器与对应待办。
  let nextId = next.reduce((max, row) => Math.max(max, Number(row.id) || 0), 0)
  for (const demo of canonical) {
    const identity = identityOf(demo)
    if (usedIdentities.has(identity)) {
      continue
    }
    const row: EntryRow = { ...demo }
    if (next.some((item) => Number(item.id) === Number(demo.id))) {
      row.id = ++nextId
    } else {
      nextId = Math.max(nextId, Number(demo.id))
    }
    next.push(row)
    usedIdentities.add(identity)
    changed = true
  }

  // 检定记录统一做有效期兜底。
  if (key === 'calibration') {
    for (const row of next) {
      if (normalizeCalibrationRow(row, now)) {
        changed = true
      }
    }
  }

  next.sort((a, b) => Number(a.id) - Number(b.id))
  rows.length = 0
  rows.push(...next)
  return changed
}

// 本地初始化：幂等。返回结构里的 changed 表示本次是否按规则处理过数据
// （首次播种、迁移或兜底时为 true；幂等执行时内容不变，持久化仍可安全重复写入）。
export function bootstrapEntries(
  stored: Record<string, EntryRow[]> | null | undefined,
  now: Date = new Date(),
): BootstrapOutcome {
  const entries: Record<string, EntryRow[]> = JSON.parse(
    JSON.stringify(stored ?? SEED_ROWS),
  ) as Record<string, EntryRow[]>

  let changed = !stored
  // 新模块（种子里有、存储里没有）先播种，和原有 readStorage 的合并行为保持一致。
  for (const [key, demoRows] of Object.entries(SEED_ROWS)) {
    if (!Array.isArray(entries[key])) {
      entries[key] = JSON.parse(JSON.stringify(demoRows)) as EntryRow[]
      changed = true
    }
  }
  for (const key of MANAGED_KEYS) {
    if (mergeModule(key, entries[key] as EntryRow[], now)) {
      changed = true
    }
  }
  return { entries, changed, version: SCHEMA_VERSION }
}

// 从检定数据派生巡检待办：巡检页的待办直接取同一批检定记录，不另存一份。
export function calibrationTodos(
  calibrationRows: EntryRow[],
  now: Date = new Date(),
): CalibrationTodo[] {
  const todos: CalibrationTodo[] = []
  for (const row of calibrationRows) {
    const status = String(row.status ?? '')
    const expiryText = String(row['有效期至'] ?? '')
    const expiry = parseDate(expiryText)
    const daysToExpiry = expiry
      ? Math.round((expiry.getTime() - new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()) / 86400000)
      : null

    let reason = ''
    let urgency: CalibrationTodo['urgency'] | null = null
    if (status === '待送检' || status === '送检中') {
      reason = '仪器待送检，需要安排送检定机构'
      urgency = 'submit'
    } else if (status === '不合格') {
      reason = '检定不合格，停用并安排返修后重新检定'
      urgency = 'failed'
    } else if (status === '已合格' && daysToExpiry !== null && daysToExpiry < 0) {
      reason = '检定证书已过期，需重新送检'
      urgency = 'overdue'
    } else if (status === '已合格' && daysToExpiry !== null && daysToExpiry <= EXPIRING_SOON_DAYS) {
      reason = `检定证书将于 ${expiryText} 到期，请提前安排复检`
      urgency = 'expiring'
    }
    if (!urgency) {
      continue
    }

    todos.push({
      id: Number(row.id),
      记录编号: String(row['记录编号'] ?? ''),
      仪器编号: String(row['仪器编号'] ?? ''),
      仪器名称: String(row['仪器名称'] ?? ''),
      所属站点: String(row['所属站点'] ?? ''),
      站点编号: stationCode(row['所属站点']) || stationCode(row['记录编号']),
      status,
      有效期至: expiryText,
      daysToExpiry,
      reason,
      urgency,
    })
  }

  const urgencyRank: Record<CalibrationTodo['urgency'], number> = {
    overdue: 0,
    failed: 1,
    submit: 2,
    expiring: 3,
  }
  return todos.sort((a, b) => {
    const rankGap = urgencyRank[a.urgency] - urgencyRank[b.urgency]
    if (rankGap !== 0) {
      return rankGap
    }
    const av = a.daysToExpiry ?? Number.MAX_SAFE_INTEGER
    const bv = b.daysToExpiry ?? Number.MAX_SAFE_INTEGER
    return av - bv
  })
}

// 同一批数据核对：检定仪器、检定巡检待办、站房台账涉及的站房必须能对上。
export function sharedStationCodes(entries: Record<string, EntryRow[]>): {
  calibration: string[]
  todos: string[]
  stationhouse: string[]
} {
  const calibrationRows = entries['calibration'] ?? []
  const codes = (rows: EntryRow[], field: string) =>
    [...new Set(rows.map((row) => stationCode(row[field])).filter(Boolean))].sort()
  return {
    calibration: codes(calibrationRows, '所属站点'),
    stationhouse: codes(entries['stationhouse'] ?? [], '站点编号'),
    todos: [...new Set(calibrationTodos(calibrationRows).map((todo) => todo.站点编号).filter(Boolean))].sort(),
  }
}
