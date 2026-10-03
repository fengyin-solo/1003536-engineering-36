/** 纯前端数据层的公共类型：与全栈版后端返回的结构保持一致，换回后端时页面不用改。 */

export type EntryRow = {
  id: number
  status: string
  pending: boolean
  abnormal: boolean
  [field: string]: string | number | boolean
}

export type ModuleMeta = {
  key: string
  name: string
  entity: string
  desc: string
  fields: string[]
  statuses: string[]
  actions: string[]
  actionTargets: Record<string, string>
  metrics: string[]
}

export type PageResult = {
  items: EntryRow[]
  total: number
  page: number
  size: number
}

export type ActionResult = {
  ok: boolean
  message: string
}

export type OverviewResult = {
  cards: { label: string; value: number }[]
  modules: { name: string; created: number; pending: number; abnormal: number }[]
}

// 检定仪器派生的巡检待办：结构定义在 types，实现在 bootstrap，页面通过 local-service 取用。
export type CalibrationTodo = {
  id: number
  记录编号: string
  仪器编号: string
  仪器名称: string
  所属站点: string
  站点编号: string
  status: string
  有效期至: string
  daysToExpiry: number | null
  reason: string
  urgency: 'overdue' | 'failed' | 'submit' | 'expiring'
}
