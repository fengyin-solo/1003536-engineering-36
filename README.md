# 水文监测站网管理系统

面向水文监测站点运行、水位流量雨量数据采集、遥测设备维护与数据整编发布的水文站网管理平台。

这是一个**纯前端**管理平台：Vue 3 + Vite + TypeScript，仓库里没有后端服务。业务数据由
`frontend/src/data/` 下的本地数据层提供：首次打开用示例数据播种，之后的登记、筛选与状态流转
结果都持久化在浏览器 `localStorage` 里，刷新或重开浏览器都还在。dev server 已关掉自动打开页面，
启动后按终端打印的地址手工打开。

仪器检定模块的本地初始化有额外约定（`frontend/src/data/calibration.ts`）：

- 新环境启动即播种 7 条固定演示仪器，稳定覆盖**待送检、已合格、不合格**三类仪器，并派生
  「待送检 / 待复检 / 不合格待处置」三类对应待办；演示检定日期固定，不随启动时间漂移。
- **有效期兜底**：已合格仪器的「有效期至」缺失或无法解析时，按检定日 +1 年补齐
  （检定日也不合法时以当天兜底）；送检中、不合格、已停用的记录不臆造有效期。
- **已有业务数据一律跳过保留**：初始化只补缺、不覆盖用户录入；用户删除过的演示记录不会被塞回。
- **旧版本示例可迁移且不重复**：旧版「仪器检定样例N」占位记录在版本升级时整批替换为新演示
  数据（带版本标记，只迁移一次），用户记录原样保留，重复初始化结果幂等。
- 检定页的检定状态、**巡检页的巡检待办**、**站房维护页的维护台账**三处通过同一个选择器
  `calibrationTodos()` 取同一批检定数据，任何一处流转后三处看到的内容始终一致。

## 目录结构

```text
.
├── frontend/                 Vue 3 + Vite + TypeScript 前端（唯一运行单元）
│   ├── src/views/            每个业务模块一个页面
│   ├── src/api/local-service.ts   本地数据服务：列表、筛选、动作流转、导出
│   ├── src/data/             模块元数据 / 示例数据 / localStorage 持久化
│   ├── src/stores/           会话与筛选状态
│   └── vite.config.ts        dev server 配置（open: false，无 /api 代理）
├── .gitignore
└── docker-compose.yml
```

## 启动

```bash
cd frontend
npm install
npm run dev
```

前端默认监听 `http://127.0.0.1:5173/`，dev server 不会自动打开浏览器，需要自己访问。

生产构建：

```bash
cd frontend
npm run build
```

`npm run build` 会先执行**构建前检查**（`npm run preflight`，脚本在
`frontend/scripts/preflight.mjs`），用固定基准日核对：三类仪器演示数据齐备、有效期兜底正确、
旧示例迁移不重复、重复初始化幂等，以及检定状态 / 巡检待办 / 站房维护台账三处取到完全相同的
同一批检定数据；检查不通过会直接中断构建。也可以单独执行 `make preflight`。

## 业务模块

| 模块 | 目录 | 业务对象 | 主要字段 |
| --- | --- | --- | --- |
| 监测站点 | `station` | 水文监测站 | 站点编号、站点名称、站点类型 |
| 水位监测 | `waterlevel` | 水位记录 | 记录编号、站点编号、观测时间 |
| 流量监测 | `discharge` | 流量记录 | 记录编号、站点编号、测量方法 |
| 雨量观测 | `rainfall` | 雨量记录 | 记录编号、站点编号、观测时段 |
| 水质检测 | `waterquality` | 水质检测报告 | 报告编号、采样站点、采样时间 |
| 断面测量 | `crosssection` | 断面测量记录 | 记录编号、站点编号、断面名称 |
| 遥测设备 | `telemetry` | 遥测设备 | 设备编号、设备类型、所属站点 |
| 数据整编 | `compilation` | 整编成果 | 成果编号、整编年份、站点编号 |
| 预警阈值 | `warning` | 预警阈值配置 | 配置编号、站点编号、监测类型 |
| 地下水观测 | `groundwater` | 地下水观测记录 | 记录编号、井点编号、观测日期 |
| 蒸发观测 | `evaporation` | 蒸发观测记录 | 记录编号、站点编号、观测日期 |
| 测流缆道 | `cableway` | 测流缆道 | 缆道编号、所属站点、跨度米数 |
| 泥沙监测 | `sediment` | 泥沙监测记录 | 记录编号、站点编号、采样时间 |
| 通讯系统 | `communication` | 通讯设备 | 设备编号、设备类型、所属站点 |
| 站房维护 | `stationhouse` | 站房维护记录 | 记录编号、站点编号、维护类型 |
| 仪器检定 | `calibration` | 仪器检定记录 | 记录编号、仪器编号、仪器名称 |
| 巡检记录 | `inspection` | 巡检记录 | 记录编号、站点编号、巡检日期 |
| 测报方案 | `plan` | 测报方案 | 方案编号、方案名称、适用范围 |

## 约定

- 每个模块的页面在 `frontend/src/views/<模块>/index.vue`，页面只负责渲染，读写统一走
  `frontend/src/api/local-service.ts`。
- 字段、状态、动作与流转目标集中在 `frontend/src/data/modules.ts`；示例数据在
  `frontend/src/data/seed.ts`。
- 状态流转只允许在 `local-service.ts` 里改，页面组件不做业务判断。
- 想回到初始数据：清掉浏览器里 `hydrology-monitor-station:entries` 这一项，或调用 `resetModule(模块)`；
  本地数据结构版本记录在 `hydrology-monitor-station:version`，删掉它会让旧数据重新走一遍迁移。
