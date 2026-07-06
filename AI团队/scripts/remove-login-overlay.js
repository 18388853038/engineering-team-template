const fs = require('fs');
const f = 'F:\\v3.0_backup_2026-05-05\\frontend\\dist\\index.html';
let c = fs.readFileSync(f, 'utf-8');

// Remove the login overlay HTML
c = c.replace('<div id="loginOverlay"><div id="loginBox"><h1>🏠 小龙版 eCompany</h1><p>请输入访问令牌</p><div class="error" id="loginError"></div><input type="password" id="loginToken" placeholder="输入 Token..." autofocus><button id="loginBtn">🔑 验证</button></div></div>', '');

// Remove the injected login JS
c = c.replace(/\n\/\/ ========== Login Auth ==========[\s\S]*?if\(AUTH_TOKEN\)setTimeout\(verifyLogin,500\);[\s]*\n?/g, '\n');

// Remove the button binding code
c = c.replace(/document\.getElementById\('loginBtn'\)\.onclick=verifyLogin;[\s]*document\.getElementById\('loginToken'\)\.onkeydown=function\(e\)\{if\(e\.key==='Enter'\)verifyLogin\(\);\};[\s]*/g, '\n');

// Remove login CSS
c = c.replace(/\n\/\* Login Overlay \*\/[\s\S]*?\}\n/g, '\n');

fs.writeFileSync(f, c, 'utf-8');
console.log('Login overlay removed, using backend auth instead');
