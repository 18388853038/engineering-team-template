const fs = require('fs');
const f = 'F:\\v3.0_backup_2026-05-05\\frontend\\dist\\index.html';
let c = fs.readFileSync(f, 'utf-8');

// Inject auth header into API.get
c = c.replace(
  "x.open('GET', this._base + path, true);\n    x.onload = function() { cb(x.status, JSON.parse(x.responseText || '{}')); };\n    x.onerror = function() { cb(0, { error: '网络错误' }); };\n    x.s",
  "x.open('GET', this._base + path, true);\n    if(AUTH_TOKEN)x.setRequestHeader('Authorization','Bearer '+AUTH_TOKEN);\n    x.onload = function() { cb(x.status, JSON.parse(x.responseText || '{}')); };\n    x.onerror = function() { cb(0, { error: '网络错误' }); };\n    x.s"
);

// Inject auth header into API.post
c = c.replace(
  "x.open('POST', this._base + path, true);\n    x.setRequestHeader('Content-Type', 'application/json');\n    x.onload = function() {\n      try { cb(x.status, JSON.parse(x.responseText || '{}')); }\n      catch(e) { cb(x.status, { error: 'Parse error' }); }\n    };\n    x.onerror = function() { cb(0, { error: '网络错误' }); };\n    x.send(JSON.stringify(data));",
  "x.open('POST', this._base + path, true);\n    x.setRequestHeader('Content-Type', 'application/json');\n    if(AUTH_TOKEN)x.setRequestHeader('Authorization','Bearer '+AUTH_TOKEN);\n    x.onload = function() {\n      try { cb(x.status, JSON.parse(x.responseText || '{}')); }\n      catch(e) { cb(x.status, { error: 'Parse error' }); }\n    };\n    x.onerror = function() { cb(0, { error: '网络错误' }); };\n    x.send(JSON.stringify(data));"
);

fs.writeFileSync(f, c, 'utf-8');
console.log('Auth headers injected into API.get and API.post');
