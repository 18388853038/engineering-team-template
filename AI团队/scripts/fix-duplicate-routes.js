const fs = require('fs');
const f = 'F:\\v3.0_backup_2026-05-05\\backend\\server-modern.js';
let c = fs.readFileSync(f, 'utf-8');

// Remove the first auth route (lines 471-483) - the one I injected
const pattern = `// ========== 网络搜索路由 ==========
// ========== 权限认证 ==========
registerRoute(['POST'], /^\\/api\\/auth\\/verify$/, async (req, res) => {
  const body = await parseBody(req);
  const token = body.token || body.TOKEN || body.accessToken || body.AccessToken || '';
  // 有效令牌列表
  const validTokens = [
    process.env.AUTH_TOKEN || 'ecompany-token-2026',
    'admin-token-2026',
    'ecompany-token-2026'
  ];
  const ok = validTokens.includes(token);
  json(res, { ok: ok, verified: ok, token: ok ? token : null });
});


`;

if (c.includes(pattern)) {
  c = c.replace(pattern, '');
  console.log('Removed first auth route');
} else {
  console.log('Pattern not found, trying shorter match...');
  // Try to find and remove by searching for the key text
  const start = c.indexOf('// ========== 权限认证 ==========');
  if (start >= 0) {
    const searchWebStart = c.indexOf('// ========== 网络搜索路由 ==========');
    // Remove from the auth comment to the v4 route
    const v4Start = c.indexOf('// ========== v4 CEO 调度路由 ==========');
    if (v4Start > start) {
      // Find the end of this auth route block (the line with json res)
      const jsonLine = c.indexOf('json(res, { ok: ok, verified: ok, token: ok ? token : null });', start);
      if (jsonLine > 0) {
        const afterJson = c.indexOf('\n', jsonLine);
        const endOfBlock = c.indexOf('\n\n', jsonLine);
        const removeEnd = endOfBlock > 0 ? endOfBlock : afterJson + 1;
        c = c.substring(0, start) + c.substring(removeEnd);
        console.log('Removed via fallback method');
      }
    }
  }
}

fs.writeFileSync(f, c, 'utf-8');
