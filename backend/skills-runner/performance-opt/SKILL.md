---
name: performance-opt
description: 前端/Node.js 性能优化指南，涵盖 Vue 3、Vite 构建、Node.js 后端优化
---

# Performance Opt - 性能优化

## 适用场景
- Vue 3 SPA 性能优化
- Vite/Rolldown 构建优化
- Node.js 后端响应速度优化
- 数据库查询优化
- 前端加载性能优化

## Vue 3 性能优化

### 1. 组件优化
```javascript
// ✅ 使用 v-memo 缓存静态内容
<div v-memo="[item.id, item.status]">
  {{ item.name }} - {{ item.status }}
</div>

// ✅ 函数式组件（无状态）
const StaticHeader = (props) => h('h1', props.title)

// ✅ 合理使用 computed 缓存
// ❌ 每次渲染都计算
const fullName = firstName + ' ' + lastName
// ✅ 仅依赖变化时重新计算
const fullName = computed(() => firstName.value + ' ' + lastName.value)
```

### 2. 列表渲染优化
```javascript
// ✅ 始终指定 :key（唯一且稳定）
<div v-for="item in items" :key="item.id">

// ✅ 虚拟滚动（大数据列表）
// 使用 vue-virtual-scroller 或 @tanstack/vue-virtual
// ❌ 不：一次性渲染 10000 条
// ✅ 好：只渲染可视区域的 20 条
```

### 3. 懒加载
```javascript
// ✅ 路由懒加载
const routes = [
  { path: '/dashboard', component: () => import('./views/Dashboard.vue') }
]

// ✅ 组件懒加载
const HeavyComponent = defineAsyncComponent(() =>
  import('./HeavyComponent.vue')
)
```

## Vite/Rolldown 构建优化

```javascript
// vite.config.js - 优化配置
export default defineConfig({
  build: {
    target: 'es2020',           // 更现代的 target = 更小的 polyfill
    cssCodeSplit: true,          // 按需加载 CSS
    rollupOptions: {
      output: {
        manualChunks: {          // 手动分包，利用缓存
          vendor: ['vue', 'vue-router'],
          ui: ['element-plus'],
        }
      }
    }
  }
})
```

## Node.js 后端优化

### 1. 异步处理
```javascript
// ✅ 并发执行独立任务
const [users, posts] = await Promise.all([
  getUsers(),
  getPosts()
]);

// ✅ 使用流处理大文件
const stream = fs.createReadStream('large-file.csv');
stream.pipe(parser);
```

### 2. 缓存策略
```javascript
// ✅ 内存缓存高频数据
const cache = new Map();
function getCached(key, ttl = 60000) {
  const item = cache.get(key);
  if (item && Date.now() - item.time < ttl) return item.data;
  return null;
}
```

### 3. 数据库优化
```sql
-- ✅ 只查需要的列（禁止 SELECT *）
SELECT id, name, email FROM users;

-- ✅ 分页查询
SELECT * FROM logs ORDER BY id DESC LIMIT 50 OFFSET 0;
```

## 性能检测命令

```bash
# Vue 性能分析
npm run build -- --report

# Node.js 性能分析
node --prof server.js
node --prof-process isolate-*.log > processed.txt

# 基准测试
npx autocannon -c 100 -d 10 http://localhost:3000/api/health
```
