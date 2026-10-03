import { createApp } from 'vue'
import { createPinia } from 'pinia'

import App from './App.vue'
import router from './router'
import { bootstrapStore } from './data/local-store'
import './styles/global.css'

// 挂载前先完成本地数据初始化：播种演示数据、迁移旧示例、有效期兜底，
// 保证新环境一启动三类仪器与对应待办都能稳定复现。
bootstrapStore()

const app = createApp(App)
app.use(createPinia())
app.use(router)
app.mount('#app')
