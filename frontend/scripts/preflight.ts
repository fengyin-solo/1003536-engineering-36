/* eslint-disable no-console */
// 构建前检查：用固定“今天”核对本地初始化逻辑。
//   1. 新环境初始化后稳定复现待送检 / 已合格 / 不合格三类仪器及对应巡检待办；
//   2. 检定状态、巡检待办、站房维护台账取到同一批站房数据；
//   3. 旧版示例记录能迁移且不重复，已有业务数据跳过不覆盖；
//   4. 重复初始化不改变已录入结果；
//   5. 有效期兜底：空值 / 非法值按检定日期顺延一年。
// 通过 scripts/run-preflight.mjs 用 esbuild 打包后在 Node 里执行。
import assert from 'node:assert/strict'

import {
  bootstrapEntries,
  calibrationTodos,
  isLegacySampleRow,
  parseDate,
  sharedStationCodes,
} from '../src/data/bootstrap'
import { allRows, listRows, resetCache, resetRows, runAction } from './preflight-store'

const NOW = new Date(2026, 9, 3) // 2026-10-03
let passed = 0
function check(name: string, fn: () => void): void {
  fn()
  passed += 1
  console.log(`  ✓ ${name}`)
}

// --- 1. 新环境初始化：三类仪器 + 对应待办 -----------------------------------
const fresh = bootstrapEntries(null, NOW).entries
const freshCalibration = fresh['calibration']

check('初始化后检定仪器包含待送检、已合格、不合格三类状态', () => {
  const statuses = new Set(freshCalibration.map((row) => String(row.status)))
  for (const expected of ['待送检', '已合格', '不合格']) {
    assert.ok(statuses.has(expected), `缺少状态：${expected}`)
  }
})

check('初始化后所有检定记录的有效期至都能解析为日期（含兜底）', () => {
  for (const row of freshCalibration) {
    assert.ok(parseDate(row['有效期至']), `记录 ${String(row['记录编号'])} 有效期兜底失败`)
  }
})

check('待送检仪器的空有效期按今天顺延一年（2027-10-03）', () => {
  const row = freshCalibration.find((item) => String(item['记录编号']) === 'CALI-0001')
  assert.ok(row)
  assert.equal(row!['有效期至'], '2027-10-03')
})

check('三类仪器各自派生出巡检待办', () => {
  const todos = calibrationTodos(freshCalibration, NOW)
  const byRecord = new Map(todos.map((todo) => [todo.记录编号, todo]))
  assert.ok(byRecord.has('CALI-0001'), '待送检仪器应有待办')
  assert.equal(byRecord.get('CALI-0001')!.urgency, 'submit')
  assert.ok(byRecord.has('CALI-0003'), '不合格仪器应有返修待办')
  assert.equal(byRecord.get('CALI-0003')!.urgency, 'failed')
  assert.ok(byRecord.has('CALI-0004'), '已过期的合格仪器应有重新送检待办')
  assert.equal(byRecord.get('CALI-0004')!.urgency, 'overdue')
  assert.ok(!byRecord.has('CALI-0002'), '有效期内的合格仪器不应产生待办')
  assert.equal(todos.length, 3)
})

// --- 2. 同一批数据：检定状态 / 巡检待办 / 站房台账 ---------------------------
check('检定仪器、巡检待办、站房维护台账使用同一批站房编号', () => {
  const shared = sharedStationCodes(fresh)
  assert.deepEqual(shared.calibration, ['ST-001', 'ST-002', 'ST-003'])
  assert.deepEqual(shared.stationhouse, ['ST-001', 'ST-002', 'ST-003'])
  for (const code of shared.todos) {
    assert.ok(shared.stationhouse.includes(code), `待办站房 ${code} 在站房台账里找不到`)
  }
  assert.ok(shared.todos.includes('ST-001'))
  assert.ok(shared.todos.includes('ST-002'))
  assert.ok(shared.todos.includes('ST-003'))
})

// --- 3. 有效期兜底：非法值同样处理 -------------------------------------------
check('有效期是非法文案时按检定日期顺延一年', () => {
  const outcome = bootstrapEntries(
    {
      calibration: [
        {
          id: 99,
          status: '已合格',
          pending: false,
          abnormal: false,
          记录编号: 'CALI-0999',
          仪器编号: 'YQ-0999',
          仪器名称: '自登记仪器',
          所属站点: 'ST-001 青峰水文站',
          检定单位: '检定机构',
          检定日期: '2026-05-01',
          有效期至: '仪器检定样例1',
          检定结论: '合格',
          检定状态: '合格有效',
        },
      ],
    },
    NOW,
  )
  const target = outcome.entries['calibration'].find(
    (row) => String(row['记录编号']) === 'CALI-0999',
  )
  assert.ok(target)
  assert.equal(target!['有效期至'], '2027-05-01')
})

// --- 4. 重复初始化幂等，不改变已录入结果 --------------------------------------
const once = bootstrapEntries(null, NOW).entries
const onceSnapshot = JSON.stringify(once)
check('相同数据重复初始化结果完全一致（不新增、不改动）', () => {
  const twice = bootstrapEntries(once, NOW)
  assert.equal(JSON.stringify(twice.entries), onceSnapshot)
  assert.equal(twice.entries['calibration'].length, freshCalibration.length)
})

check('重复初始化不改变用户已流转的状态，且不产生重复记录', () => {
  const moved = bootstrapEntries(null, NOW).entries
  const target = moved['calibration'].find((row) => String(row['记录编号']) === 'CALI-0001')
  assert.ok(target)
  target.status = '送检中'
  const again = bootstrapEntries(moved, NOW)
  const rows = again.entries['calibration']
  const matches = rows.filter((row) => String(row['记录编号']) === 'CALI-0001')
  assert.equal(matches.length, 1)
  assert.equal(matches[0].status, '送检中')
})

// --- 5. 旧版示例记录迁移：就地升级、不重复，业务数据保留 ----------------------
type LegacyRow = {
  id: number
  status: string
  pending: boolean
  abnormal: boolean
  记录编号: string
  文本字段: string
}

function legacyRows(label: string, moduleKey: string, markerField: string): LegacyRow[] {
  return [1, 2, 3].map((id) => ({
    id,
    status: '待送检',
    pending: true,
    abnormal: false,
    记录编号: `OLD-${moduleKey}-000${id}`,
    文本字段: `${label}${id}`,
    [markerField]: `${label}${id}`,
  }))
}

const legacy: Record<string, LegacyRow[]> = {
  calibration: legacyRows('仪器检定样例', 'CALI', '仪器名称'),
  inspection: legacyRows('巡检记录样例', 'INSP', '巡检人员'),
  stationhouse: legacyRows('站房维护样例', 'HOUSE', '维护内容'),
}
// 用户把旧样例 CALI id=1 流转成了已合格：迁移时保留这个录入结果。
legacy.calibration[0].status = '已合格'
legacy.calibration[0].pending = false
// 用户额外登记过的业务记录，任何时候都不能被动到。
legacy.calibration.push({
  id: 42,
  status: '待送检',
  pending: true,
  abnormal: false,
  记录编号: 'CALI-U-0042',
  文本字段: '用户自登记仪器（非样例）',
  仪器编号: 'YQ-U-0042',
  仪器名称: '自购便携式流速仪',
  所属站点: 'ST-001 青峰水文站',
  检定单位: '厂家计量站',
  检定日期: '2026-08-01',
  有效期至: '',
  检定结论: '待检定',
  检定状态: '待送检',
} as LegacyRow)

const migrated = bootstrapEntries(legacy as never, NOW).entries

check('旧版示例记录被识别为待迁移数据', () => {
  assert.ok(isLegacySampleRow(legacy.calibration[1] as never, 'calibration'))
})

check('旧版示例记录就地迁移为新版演示数据，不产生重复', () => {
  for (const key of ['calibration', 'inspection', 'stationhouse'] as const) {
    const codes = migrated[key].map((row) => String(row['记录编号']))
    assert.equal(new Set(codes).size, codes.length, `${key} 迁移后出现重复记录编号`)
    assert.ok(!codes.some((code) => code.startsWith('OLD-')), `${key} 旧样例记录编号残留`)
  }
  // 3 条旧样例槽位 + 1 条用户记录（其中 id=1 就地迁移），演示记录仍为 4 条。
  const calibrationCodes = migrated.calibration.map((row) => String(row['记录编号']))
  assert.equal(calibrationCodes.filter((code) => /^CALI-000\d$/.test(code)).length, 4)
})

check('迁移保留用户已录入的状态（id=1 仍是已合格）', () => {
  const row = migrated.calibration.find((item) => Number(item.id) === 1)
  assert.ok(row)
  assert.equal(row!.status, '已合格')
})

check('迁移不覆盖用户自登记记录，并为其补齐有效期兜底', () => {
  const userRow = migrated.calibration.find((row) => String(row['记录编号']) === 'CALI-U-0042')
  assert.ok(userRow)
  assert.equal(userRow!['仪器名称'], '自购便携式流速仪')
  assert.equal(userRow!['有效期至'], '2027-08-01')
})

check('迁移结果再次初始化保持稳定', () => {
  const snapshot = JSON.stringify(migrated)
  const again = bootstrapEntries(migrated, NOW)
  assert.equal(JSON.stringify(again.entries), snapshot)
})

// --- 6. 经本地存储完整读写链路：三个页面同源、重复初始化幂等 -------------------
check('localStorage 读写链路：检定页 / 巡检待办 / 站房台账取到同一批数据', () => {
  const store = new Map<string, string>()
  installLocalStorageShim(store)

  // 首次启动：空存储完成播种与初始化。
  resetCache()
  const seeded = JSON.parse(JSON.stringify(allRows()))
  const calibration = listRows('calibration')
  const stationhouse = listRows('stationhouse')
  const todos = calibrationTodos(calibration, NOW)
  assert.equal(calibration.length, 4)
  const stationCodes = new Set(stationhouse.map((row) => String(row['站点编号'])))
  for (const todo of todos) {
    assert.ok(stationCodes.has(todo.站点编号), `站房台账缺少待办所属站房 ${todo.站点编号}`)
  }
  assert.equal(store.get('hydrology-monitor-station:version'), '2')

  // 模拟刷新：冷启动再读一遍，拿到的是同一批播种结果。
  resetCache()
  assert.deepEqual(JSON.parse(JSON.stringify(allRows())), seeded)

  // 用户在检定页执行状态流转后，巡检待办立刻反映同一批数据。
  runAction('calibration', 1, '送出检定')
  assert.equal(
    calibrationTodos(listRows('calibration'), NOW).some((todo) => todo.id === 1),
    true,
  )
  resetRows('inspection')
  const afterUserAction = JSON.parse(JSON.stringify(allRows()))

  // 再次初始化（模拟刷新 / 重复初始化）不改变已录入结果。
  resetCache()
  assert.deepEqual(JSON.parse(JSON.stringify(allRows())), afterUserAction)
})

console.log(`\n前检查通过：${passed} 项断言全部成功。`)

// --- 极简 localStorage 垫片（避免依赖浏览器环境）------------------------------
function installLocalStorageShim(store: Map<string, string>): void {
  const shim = {
    getItem: (key: string) => (store.has(key) ? store.get(key)! : null),
    setItem: (key: string, value: string) => void store.set(key, String(value)),
    removeItem: (key: string) => void store.delete(key),
    clear: () => store.clear(),
  }
  ;(globalThis as { window?: unknown }).window = { localStorage: shim }
  ;(globalThis as { localStorage?: unknown }).localStorage = shim
}
