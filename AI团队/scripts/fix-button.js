const fs = require('fs');
const f = 'F:\\v3.0_backup_2026-05-05\\frontend\\dist\\index.html';
let c = fs.readFileSync(f, 'utf-8');

// Fix 1: Remove onclick from HTML button, we'll bind it in JS
c = c.replace(
  '<button onclick="verifyLogin()">🔑 验证</button>',
  '<button id="loginBtn">🔑 验证</button>'
);

// Fix 2: After verifyLogin function definition, bind the button click
c = c.replace(
  'if(AUTH_TOKEN)setTimeout(verifyLogin,500);',
  'if(AUTH_TOKEN)setTimeout(verifyLogin,500);\ndocument.getElementById(\'loginBtn\').onclick=verifyLogin;\ndocument.getElementById(\'loginToken\').onkeydown=function(e){if(e.key===\'Enter\')verifyLogin();};'
);

fs.writeFileSync(f, c, 'utf-8');
console.log('Fixed button binding');
