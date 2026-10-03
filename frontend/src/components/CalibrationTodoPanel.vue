<template>
  <section class="calib-todo-panel" :data-variant="variant">
    <header class="calib-todo-head">
      <h3>{{ panelTitle }}</h3>
      <span class="calib-todo-hint">{{ panelHint }}</span>
    </header>
    <table v-if="todos.length" class="data-table calib-todo-table">
      <thead>
        <tr>
          <th>待办类型</th>
          <th>仪器编号</th>
          <th>仪器名称</th>
          <th>检定日期</th>
          <th>有效期至</th>
          <th>当前状态</th>
          <th>处理说明</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="item in todos" :key="`${item.recordId}-${item.type}`">
          <td>
            <span class="todo-tag" :class="{ urgent: item.urgent }">{{ item.type }}</span>
          </td>
          <td>{{ item.仪器编号 }}</td>
          <td>{{ item.仪器名称 }}</td>
          <td>{{ item.检定日期 || '—' }}</td>
          <td>{{ item.有效期至 || '—' }}</td>
          <td>{{ item.状态 }}</td>
          <td>{{ item.说明 }}</td>
        </tr>
      </tbody>
    </table>
    <p v-else class="empty-state">暂无仪器检定相关待办，三类仪器均在有效状态</p>
    <footer class="calib-todo-foot">
      共 {{ todos.length }} 项待办（待送检 {{ countOf('待送检') }} ·
      待复检 {{ countOf('待复检') }} ·
      不合格待处置 {{ countOf('不合格待处置') }}），数据来源：仪器检定
    </footer>
  </section>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'

import {
  calibrationTodos,
  inspectionCalibrationTodos,
  stationhouseCalibrationLedger,
} from '@/api/local-service'
import type { CalibrationTodo } from '@/data/types'

// 检定页 / 巡检页 / 站房台账三个入口共用这个面板，
// 三个入口最终都调用 calibrationTodos，保证取到的是同一批检定数据。
const props = defineProps<{ variant?: 'calibration' | 'inspection' | 'stationhouse' }>()

const variant = props.variant ?? 'calibration'

const panelTitle = {
  calibration: '检定待办（按仪器检定状态派生）',
  inspection: '巡检待办（来自仪器检定数据）',
  stationhouse: '站房维护台账 · 仪器检定联动待办',
}[variant]

const panelHint = {
  calibration: '待送检、待复检、不合格处置三类待办均由检定记录统一派生',
  inspection: '巡检时需关注的仪器检定事项，与仪器检定页同源',
  stationhouse: '仪器复检与不合格处置同步纳入站房维护台账',
}[variant]

const selector = {
  calibration: calibrationTodos,
  inspection: inspectionCalibrationTodos,
  stationhouse: stationhouseCalibrationLedger,
}[variant]

const todos = ref<CalibrationTodo[]>([])

function countOf(type: CalibrationTodo['type']): number {
  return todos.value.filter((item) => item.type === type).length
}

function reload() {
  todos.value = selector()
}

defineExpose({ reload })

onMounted(reload)
</script>

<style scoped>
.calib-todo-panel {
  background: #fff;
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 12px;
  margin: 0 0 16px;
}
.calib-todo-head {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  margin-bottom: 8px;
}
.calib-todo-head h3 {
  margin: 0;
  font-size: 14px;
}
.calib-todo-hint {
  color: var(--muted);
  font-size: 12px;
}
.calib-todo-table {
  margin-bottom: 8px;
}
.todo-tag {
  display: inline-block;
  border-radius: 999px;
  padding: 2px 10px;
  font-size: 12px;
  background: #eef2f7;
  color: #334155;
}
.todo-tag.urgent {
  background: #fee4e2;
  color: #b42318;
}
.calib-todo-foot {
  font-size: 12px;
  color: var(--muted);
}
</style>
