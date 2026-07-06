const fs = require('fs');
const f = 'F:\\v3.0_backup_2026-05-05\\frontend\\dist\\index.html';
let c = fs.readFileSync(f, 'utf-8');

// 1. Add login CSS
const styleEnd = c.indexOf('</style>');
const loginCSS = `
/* Login Overlay */
#loginOverlay{position:fixed;top:0;left:0;width:100%;height:100%;background:linear-gradient(135deg,#0f0c29,#302b63,#24243e);display:flex;align-items:center;justify-content:center;z-index:9999}
#loginBox{background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08);border-radius:16px;padding:40px;width:360px;text-align:center}
#loginBox h1{font-size:20px;color:#fff;margin-bottom:6px}
#loginBox p{font-size:12px;color:#6b7294;margin-bottom:24px}
#loginBox input{width:100%;padding:10px 14px;border-radius:8px;border:1px solid rgba(255,255,255,0.08);background:rgba(255,255,255,0.04);color:#e0e0e0;font-size:14px;outline:none;box-sizing:border-box;margin-bottom:12px}
#loginBox input:focus{border-color:#4ecdc4}
#loginBox button{width:100%;padding:10px;border-radius:8px;border:none;background:linear-gradient(135deg,#4ecdc4,#44b3ab);color:#fff;font-size:14px;font-weight:600;cursor:pointer}
#loginBox button:hover{background:#5dd4cc}
#loginBox .error{color:#ef4444;font-size:12px;min-height:18px;margin-bottom:8px}
`;
c = c.slice(0, styleEnd + 10) + loginCSS + c.slice(styleEnd + 10);

// 2. Add login HTML
const appDiv = '<div id="app"></div>';
const loginHTML = '<div id="loginOverlay"><div id="loginBox"><h1>🏠 小龙版 eCompany</h1><p>请输入访问令牌</p><div class="error" id="loginError"></div><input type="password" id="loginToken" placeholder="输入 Token..." autofocus><button onclick="verifyLogin()">🔑 验证</button></div></div>';
c = c.replace(appDiv, appDiv + loginHTML);

// 3. Add login JS after opening script tag
const scriptStart = c.indexOf('<script>') + 8;
const loginJS = `
// ========== Login Auth ==========
var AUTH_TOKEN = localStorage.getItem('ecompany_token') || '';
function verifyLogin(){
  var inp=document.getElementById('loginToken');
  var err=document.getElementById('loginError');
  var token=inp?inp.value.trim():'';
  if(!token&&!AUTH_TOKEN){err.textContent='Please enter token';return;}
  token=token||AUTH_TOKEN;
  var x=new XMLHttpRequest();
  x.open('POST','http://127.0.0.1:8003/api/auth/verify',true);
  x.setRequestHeader('Content-Type','application/json');
  x.onload=function(){
    try{
      var d=JSON.parse(x.responseText||'{}');
      if(d.ok||d.verified){
        AUTH_TOKEN=token;
        localStorage.setItem('ecompany_token',token);
        var ov=document.getElementById('loginOverlay');
        if(ov)ov.style.display='none';
      }else{
        err.textContent='Invalid token';
        localStorage.removeItem('ecompany_token');
      }
    }catch(e){err.textContent='Error: '+e.message;}
  };
  x.onerror=function(){err.textContent='Cannot reach server';};
  x.send(JSON.stringify({token:token}));
}
if(AUTH_TOKEN)setTimeout(verifyLogin,200);

// Wrap API with auth
var _og=API.get;
API.get=function(p,cb){
  var x=new XMLHttpRequest();
  x.open('GET',API._base+p,true);
  if(AUTH_TOKEN)x.setRequestHeader('Authorization','Bearer '+AUTH_TOKEN);
  x.onload=function(){cb(x.status,JSON.parse(x.responseText||'{}'));};
  x.onerror=function(){cb(0,{error:'Network error'});};
  x.send();
};
var _op=API.post;
API.post=function(p,d,cb){
  var x=new XMLHttpRequest();
  x.open('POST',API._base+p,true);
  x.setRequestHeader('Content-Type','application/json');
  if(AUTH_TOKEN)x.setRequestHeader('Authorization','Bearer '+AUTH_TOKEN);
  x.onload=function(){
    try{cb(x.status,JSON.parse(x.responseText||'{}'));}
    catch(e){cb(x.status,{error:'Parse error'});}
  };
  x.onerror=function(){cb(0,{error:'Network error'});};
  x.send(JSON.stringify(d));
};
`;
c = c.slice(0, scriptStart) + loginJS + c.slice(scriptStart);

fs.writeFileSync(f, c, 'utf-8');
console.log('Login added OK');
