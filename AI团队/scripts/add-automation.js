const fs = require('fs');

// Add automation route
let c = fs.readFileSync('F:\\v3.0_backup_2026-05-05\\frontend-v2\\src\\main.js', 'utf-8');
c = c.replace(
  "  { path: '/health', component: () => import('./views/Health.vue'), meta: { auth: true } },",
  "  { path: '/automation', component: () => import('./views/Automation.vue'), meta: { auth: true } },\n  { path: '/health', component: () => import('./views/Health.vue'), meta: { auth: true } },"
);
fs.writeFileSync('F:\\v3.0_backup_2026-05-05\\frontend-v2\\src\\main.js', c, 'utf-8');
console.log('Route added');

// Add automation nav
let a = fs.readFileSync('F:\\v3.0_backup_2026-05-05\\frontend-v2\\src\\App.vue', 'utf-8');
a = a.replace(
  '<router-link to="/health" class="nav-item" title="健康">\n          <span class="nav-icon">❤️</span><span>系统健康</span>\n        </router-link>',
  '<router-link to="/automation" class="nav-item" title="自动化">\n          <span class="nav-icon">⚡</span><span>自动化设置</span>\n        </router-link>\n        <router-link to="/health" class="nav-item" title="健康">\n          <span class="nav-icon">❤️</span><span>系统健康</span>\n        </router-link>'
);
fs.writeFileSync('F:\\v3.0_backup_2026-05-05\\frontend-v2\\src\\App.vue', a, 'utf-8');
console.log('Nav added');
