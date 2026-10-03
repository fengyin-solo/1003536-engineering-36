#!/usr/bin/env node
// 构建前检查：仪器检定记录本地初始化的一致性核对。
// 用项目自带的 esbuild 把 TS 数据层打成一个临时 CJS 包后在 Node 里执行：
// 同时核对「检定状态、巡检待办、站房维护台账」三处能取到同一批数据，
// 并验证旧示例迁移、有效期兜底、重复初始化幂等。
import { build } from 'esbuild'
import { mkdtempSync, rmSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const frontendDir = resolve(here, '..')

const dir = mkdtempSync(join(tmpdir(), 'calibration-preflight-'))
// 单一入口同时导出数据层与服务层，保证它们用同一个模块实例和同一份缓存。
const entryPath = join(dir, 'entry.ts')
writeFileSync(
  entryPath,
  [
    "export * from '@/data/local-store'",
    "export * from '@/data/calibration'",
    "export * from '@/api/local-service'",
  ].join('\n'),
)
const bundlePath = join(dir, 'bundle.cjs')

async function bundle() {
  await build({
    entryPoints: [entryPath],
    bundle: true,
    platform: 'node',
    format: 'cjs',
    outfile: bundlePath,
    absWorkingDir: frontendDir,
    alias: { '@': resolve(frontendDir, 'src') },
    logLevel: 'silent',
  })
}

try {
  await bundle()
} catch (error) {
  console.error(error?.message || error)
  console.error('esbuild 打包失败')
  process.exit(1)
}

// 最小 localStorage 垫片：让浏览器数据层可以在 Node 里运行。
function createMemoryStorage(initial = {}) {
  const map = new Map(Object.entries(initial))
  return {
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => {
      map.set(key, String(value))
    },
    removeItem: (key) => map.delete(key),
  }
}

// 每个场景用独立 localStorage；先清空数据层内存缓存再重新初始化，避免缓存串场。
let mod = null
function useStorage(backend) {
  globalThis.window = { localStorage: backend }
  mod.resetStoreCache()
  return mod
}

const failures = []
function check(name, condition, detail = '') {
  if (condition) {
    console.log(`  ✓ ${name}`)
  } else {
    failures.push(`${name}${detail ? ` —— ${detail}` : ''}`)
    console.error(`  ✗ ${name}${detail ? ` —— ${detail}` : ''}`)
  }
}

// 检查日期固定在演示数据设计基准日，保证任何环境下结论稳定。
const TODAY = new Date(2026, 9, 3) // 2026-10-03

async function main() {
  globalThis.window = { localStorage: createMemoryStorage() }
  mod = await import(bundlePath)

  console.log('场景一：全新环境初始化')
  {
    const backend = createMemoryStorage()
    useStorage(backend)
    const rows = mod.bootstrapStore(backend)
    const calib = rows.calibration

    const statusOf = (recordNo) => calib.find((r) => r.记录编号 === recordNo)?.status
    check(
      '演示数据覆盖待送检/已合格/不合格三类仪器',
      statusOf('CALI-DEMO-001') === '待送检' &&
        statusOf('CALI-DEMO-003') === '已合格' &&
        statusOf('CALI-DEMO-006') === '不合格',
    )

    const demo005 = calib.find((r) => r.记录编号 === 'CALI-DEMO-005')
    check(
      '已合格记录缺失有效期时按检定日 +1 年兜底（2027-04-12）',
      demo005.有效期至 === '2027-04-12',
      `实际为 ${demo005.有效期至}`,
    )
    check(
      '送检中记录不臆造有效期，保持为空',
      calib.find((r) => r.记录编号 === 'CALI-DEMO-002').有效期至 === '',
    )
    check(
      '每条记录的检定状态字段与当前状态一致',
      calib.every((r) => r.检定状态 === r.status),
    )
    check(
      '不合格仪器同时挂上 abnormal 标记',
      calib.find((r) => r.记录编号 === 'CALI-DEMO-006').abnormal === true,
    )
    check(
      '待送检/送检中记录 pending=true，停用记录 pending=false',
      calib.find((r) => r.记录编号 === 'CALI-DEMO-001').pending === true &&
        calib.find((r) => r.记录编号 === 'CALI-DEMO-007').pending === false,
    )

    // 三处入口同源核对。
    const fromCalibration = mod.deriveCalibrationTodos(mod.listCalibrationRows(), TODAY)
    const fromInspection = mod.inspectionCalibrationTodos(TODAY)
    const fromStationhouse = mod.stationhouseCalibrationLedger(TODAY)
    check(
      '检定状态页、巡检待办、站房维护台账取到同一批数据（条数一致）',
      fromCalibration.length === fromInspection.length &&
        fromCalibration.length === fromStationhouse.length &&
        fromCalibration.length > 0,
      `分别为 ${fromCalibration.length}/${fromInspection.length}/${fromStationhouse.length}`,
    )
    const signature = (list) => JSON.stringify(list)
    check(
      '三处待办内容完全相同（同一份派生结果）',
      signature(fromCalibration) === signature(fromInspection) &&
        signature(fromCalibration) === signature(fromStationhouse),
    )

    const types = new Set(fromCalibration.map((t) => t.type))
    check(
      '待办同时包含待送检、待复检、不合格待处置三类',
      types.has('待送检') && types.has('待复检') && types.has('不合格待处置'),
      `实际类型：${[...types].join('、')}`,
    )
    const failedTodo = fromCalibration.find((t) => t.type === '不合格待处置')
    check(
      '不合格仪器进入待处置待办且为紧急',
      Boolean(failedTodo) && failedTodo.记录编号 === 'CALI-DEMO-006' && failedTodo.urgent === true,
    )
    const expiredPassed = fromCalibration.find(
      (t) => t.type === '待复检' && t.记录编号 === 'CALI-DEMO-004',
    )
    check(
      '已合格但证书过期的仪器进入紧急待复检',
      Boolean(expiredPassed) && expiredPassed.urgent === true,
    )
    const nearExpiry = fromCalibration.find(
      (t) => t.type === '待复检' && t.记录编号 === 'CALI-DEMO-003',
    )
    check(
      '已合格且证书 30 天内到期的仪器进入临期待复检（非紧急）',
      Boolean(nearExpiry) && nearExpiry.urgent === false,
    )
    const stats = mod.calibrationStatusSummary()
    check(
      '检定状态统计与三类仪器数量吻合（待送检2/已合格3/不合格1）',
      stats.find((s) => s.label === '待送检仪器')?.value === 2 &&
        stats.find((s) => s.label === '已合格仪器')?.value === 3 &&
        stats.find((s) => s.label === '不合格仪器')?.value === 1,
      JSON.stringify(stats),
    )
    check(
      '初始化后写入当前数据版本标记',
      backend.getItem(mod.storageVersionKey()) === String(mod.STORE_VERSION),
    )
  }

  console.log('场景二：旧版本示例记录迁移')
  {
    const legacyRow = (id, status) => ({
      id,
      status,
      pending: true,
      abnormal: false,
      记录编号: `CALI-000${id}`,
      仪器编号: `CALI-000${id}`,
      仪器名称: `仪器检定样例${id}`,
      检定单位: `仪器检定样例${id}`,
      检定日期: `2026-09-0${id}`,
      有效期至: `仪器检定样例${id}`,
      检定结论: `仪器检定样例${id}`,
      检定状态: `仪器检定样例${id}`,
    })
    // 用户在旧版本上录入的业务数据，迁移时必须保留。
    const userRow = {
      id: 9,
      status: '待送检',
      pending: true,
      abnormal: false,
      记录编号: 'CALI-USER-2026-001',
      仪器编号: 'YQ-USER-01',
      仪器名称: '用户自购流速仪',
      检定单位: '第三方检定所',
      检定日期: '2026-05-01',
      有效期至: '',
      检定结论: '',
      检定状态: '待送检',
    }

    const backend = createMemoryStorage({
      'hydrology-monitor-station:entries': JSON.stringify({
        calibration: [legacyRow(1, '待送检'), legacyRow(2, '送检中'), legacyRow(3, '已合格'), userRow],
      }),
    })
    useStorage(backend)
    const calib = mod.bootstrapStore(backend).calibration

    check(
      '旧版占位示例记录被迁移，不再保留仪器检定样例文案',
      calib.every((r) => !String(r.仪器名称).includes('仪器检定样例')),
    )
    const demos = calib.filter((r) => String(r.记录编号).startsWith('CALI-DEMO-'))
    check(
      '迁移后 7 条新演示记录齐备且不重复',
      demos.length === 7 && new Set(demos.map((r) => r.记录编号)).size === 7,
      `演示记录 ${demos.length} 条`,
    )
    check(
      '用户已录入记录原样保留、不被覆盖',
      calib.some((r) => r.记录编号 === 'CALI-USER-2026-001' && r.仪器名称 === '用户自购流速仪'),
    )
    check('迁移后记录 id 无重复', new Set(calib.map((r) => r.id)).size === calib.length)
    check(
      '迁移后三类仪器与待办可稳定复现',
      (() => {
        const todos = mod.calibrationTodos(TODAY)
        return ['待送检', '待复检', '不合格待处置'].every((type) =>
          todos.some((t) => t.type === type),
        )
      })(),
    )

    // 再次初始化：幂等。
    const before = JSON.stringify(calib)
    const second = mod.bootstrapStore(backend).calibration
    check(
      '重复初始化不改变已录入结果（内容与顺序均不变）',
      JSON.stringify(second) === before,
    )
  }

  console.log('场景三：已有业务数据的环境（重复初始化跳过覆盖）')
  {
    const backend = createMemoryStorage()
    useStorage(backend)
    mod.bootstrapStore(backend)

    // 模拟用户在页面上的操作：把 001 标记不合格、删除一条演示记录、新增一条记录。
    const stored = JSON.parse(backend.getItem(mod.storageKey()))
    stored.calibration = stored.calibration
      .filter((r) => r.记录编号 !== 'CALI-DEMO-007')
      .map((r) =>
        r.记录编号 === 'CALI-DEMO-001'
          ? { ...r, status: '不合格', pending: true, abnormal: true, 检定状态: '不合格' }
          : r,
      )
    stored.calibration.push({
      id: 99,
      status: '送检中',
      pending: true,
      abnormal: false,
      记录编号: 'CALI-USER-2026-002',
      仪器编号: 'YQ-USER-02',
      仪器名称: '用户新增水质探头',
      检定单位: '市计量院',
      检定日期: '2026-10-01',
      有效期至: '',
      检定结论: '',
      检定状态: '送检中',
    })
    backend.setItem(mod.storageKey(), JSON.stringify(stored))

    const calib = mod.bootstrapStore(backend).calibration
    check(
      '用户流转后的状态被保留（001 仍是不合格）',
      calib.find((r) => r.记录编号 === 'CALI-DEMO-001')?.status === '不合格',
    )
    check('用户新增的记录保留', calib.some((r) => r.记录编号 === 'CALI-USER-2026-002'))
    check(
      '被用户删除的演示记录不会被重新塞回（跳过而非强制补齐）',
      !calib.some((r) => r.记录编号 === 'CALI-DEMO-007'),
    )
    const before = JSON.stringify(calib)
    const again = mod.bootstrapStore(backend).calibration
    check('再次初始化结果幂等', JSON.stringify(again) === before)

    // 走页面真实的动作流转，确认待办跟随同一批数据联动。
    const id003 = calib.find((r) => r.记录编号 === 'CALI-DEMO-003').id
    const action = mod.runAction('calibration', id003, '标记不合格')
    check('页面动作「标记不合格」执行成功', action.ok === true, action.message)
    const todos = mod.calibrationTodos(TODAY)
    const failedRecords = todos
      .filter((t) => t.type === '不合格待处置')
      .map((t) => t.记录编号)
      .sort()
    check(
      '动作流转后巡检待办与站房台账取到同一批最新检定数据',
      JSON.stringify(mod.inspectionCalibrationTodos(TODAY)) === JSON.stringify(todos) &&
        JSON.stringify(mod.stationhouseCalibrationLedger(TODAY)) === JSON.stringify(todos) &&
        failedRecords.length === 3 &&
        failedRecords.includes('CALI-DEMO-003'),
      `不合格待处置：${failedRecords.join('、')}`,
    )
  }

  console.log('场景四：有效期兜底边界')
  {
    useStorage(createMemoryStorage())
    const mk = (over) => ({
      id: 1,
      status: '已合格',
      pending: false,
      abnormal: false,
      记录编号: 'CALI-T-1',
      仪器编号: 'YQ-T-1',
      仪器名称: '兜底测试仪器',
      检定单位: '测试院',
      检定日期: '2025-01-15',
      有效期至: '',
      检定结论: '合格',
      检定状态: '已合格',
      ...over,
    })
    check(
      '合法有效期保持不变',
      mod.normalizeCalibrationRow(mk({ 有效期至: '2026-12-31' })).有效期至 === '2026-12-31',
    )
    check(
      '非法日期文本（旧占位文案）按检定日 +1 年兜底为 2026-01-15',
      mod.normalizeCalibrationRow(mk({ 有效期至: '仪器检定样例1' })).有效期至 === '2026-01-15',
    )
    check(
      '检定日也非法时以检查基准日兜底，返回合法日期',
      mod.parseDate(
        mod.normalizeCalibrationRow(mk({ 检定日期: '未知', 有效期至: '' })).有效期至,
      ) !== null,
    )
    check(
      '闰年 2 月 29 日 +1 年回退到 2 月 28 日',
      mod.normalizeCalibrationRow(mk({ 检定日期: '2024-02-29', 有效期至: '' })).有效期至 ===
        '2025-02-28',
    )
    check(
      '不合格记录不臆造有效期',
      mod.normalizeCalibrationRow(mk({ status: '不合格', 有效期至: '' })).有效期至 === '',
    )
  }

  console.log('场景五：源码层面三处共用同一数据源')
  {
    const panelSource = readFileSync(
      resolve(frontendDir, 'src', 'components', 'CalibrationTodoPanel.vue'),
      'utf8',
    )
    check(
      '共享面板的三个入口选择器均来自 local-service',
      panelSource.includes('calibrationTodos') &&
        panelSource.includes('inspectionCalibrationTodos') &&
        panelSource.includes('stationhouseCalibrationLedger'),
    )
    const serviceSource = readFileSync(
      resolve(frontendDir, 'src', 'api', 'local-service.ts'),
      'utf8',
    )
    check(
      '巡检待办与站房台账直接复用 calibrationTodos（同源不另写）',
      /export function inspectionCalibrationTodos\([^)]*\)[\s\S]*?return calibrationTodos\(today\)/.test(
        serviceSource,
      ) &&
        /export function stationhouseCalibrationLedger\([^)]*\)[\s\S]*?return calibrationTodos\(today\)/.test(
          serviceSource,
        ),
    )
    const inspectionView = readFileSync(
      resolve(frontendDir, 'src', 'views', 'inspection', 'index.vue'),
      'utf8',
    )
    check(
      '巡检页挂载的待办面板使用 inspection 变体',
      inspectionView.includes('CalibrationTodoPanel') &&
        /<CalibrationTodoPanel[^>]*variant="inspection"/.test(inspectionView),
    )
    const stationhouseView = readFileSync(
      resolve(frontendDir, 'src', 'views', 'stationhouse', 'index.vue'),
      'utf8',
    )
    check(
      '站房页挂载的台账面板使用 stationhouse 变体',
      stationhouseView.includes('CalibrationTodoPanel') &&
        /<CalibrationTodoPanel[^>]*variant="stationhouse"/.test(stationhouseView),
    )
  }

  rmSync(dir, { recursive: true, force: true })

  if (failures.length) {
    console.error(`\n构建前检查未通过：${failures.length} 项`)
    for (const item of failures) {
      console.error(`  - ${item}`)
    }
    process.exit(1)
  }
  console.log('\n构建前检查全部通过：检定状态、巡检待办、站房维护台账同源且初始化幂等。')
}

main().catch((error) => {
  rmSync(dir, { recursive: true, force: true })
  console.error(error)
  process.exit(1)
})
