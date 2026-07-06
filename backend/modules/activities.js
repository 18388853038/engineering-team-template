// backend/modules/activities.js
// 最近动态 API 模块
// 为 Chat.vue 的动态面板提供数据

function registerActivitiesAPI(registerRoute) {
  // GET /api/activities - 获取最近动态列表
  registerRoute('GET', '/api/activities', async (req, res) => {
    try {
      // 模拟数据 - 实际项目中应从数据库读取
      const activities = [
        {
          id: 1,
          user: 'CEO',
          avatar: '👔',
          action: '启动了每日晨会',
          time: '2 分钟前',
          type: 'meeting'
        },
        {
          id: 2,
          user: 'CTO',
          avatar: '💻',
          action: '完成了代码审查',
          time: '15 分钟前',
          type: 'code'
        },
        {
          id: 3,
          user: 'CFO',
          avatar: '💰',
          action: '批准了预算申请',
          time: '1 小时前',
          type: 'approval'
        },
        {
          id: 4,
          user: 'CMO',
          avatar: '📈',
          action: '发布了新品营销方案',
          time: '2 小时前',
          type: 'marketing'
        },
        {
          id: 5,
          user: 'COO',
          avatar: '⚙️',
          action: '优化了运营流程',
          time: '3 小时前',
          type: 'operations'
        }
      ];

      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({
        ok: true,
        activities: activities
      }));
    } catch (error) {
      console.error('[Activities API] 获取动态失败:', error);
      res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({
        ok: false,
        error: '获取动态失败: ' + error.message
      }));
    }
  });

  console.log('[Activities API] 已注册 /api/activities 路由');
}

module.exports = { registerActivitiesAPI };
