import { createApp } from 'vue'
import { createPinia } from 'pinia'

import App from './App.vue'
import router from './router'
import { initLocalStore } from './data/local-store'
import './styles/global.css'

// 挂载前先完成本地数据初始化：播种演示数据、迁移旧版样例、补齐检定有效期兜底。
initLocalStore()

const app = createApp(App)
app.use(createPinia())
app.use(router)
app.mount('#app')
