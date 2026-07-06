const fs = require('fs');
const f = 'F:\\v3.0_backup_2026-05-05\\frontend\\dist\\index.html';
let c = fs.readFileSync(f, 'utf-8');

// Remove old injected code (from script start to API definition)
const scriptTag = '<script>';
const scriptStart = c.indexOf(scriptTag) + scriptTag.length;
const apiDef = c.indexOf('window.API = {', scriptStart);

// Remove injected code that was placed before API definition
c = c.substring(0, scriptStart) + '\n' + c.substring(apiDef);

// Find end of API object
const apiEnd = c.indexOf('};', apiDef) + 2;

// Insert login code AFTER API is defined
const loginJS = `

// ========== Login Auth ==========
var AUTH_TOKEN = localStorage.getItem('ecompany_token') || '';
function verifyLogin(){
  var inp=document.getElementById('loginToken');
  var err=document.getElementById('loginError');
  var token=inp?inp.value.trim():'';
  if(!token&&!AUTH_TOKEN){if(err)err.textContent='Please enter token';return;}
  token=token||AUTH_TOKEN;
  var x=new XMLHttpRequest();
  x.open('POST',API._base+'/api/auth/verify',true);
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
        if(err)err.textContent='Invalid token';
        localStorage.removeItem('ecompany_token');
      }
    }catch(e){if(err)err.textContent='Error: '+e.message;}
  };
  x.onerror=function(){if(err)err.textContent='Cannot reach server';};
  x.send(JSON.stringify({token:token}));
}
if(AUTH_TOKEN)setTimeout(verifyLogin,500);
`;

c = c.substring(0, apiEnd) + loginJS + c.substring(apiEnd);

// Wrap API calls with auth header
c = c.replace(
  'x.onload=function(){cb(x.status,JSON.parse(x.responseText||\'{}\'));};' +
  '  x.onerror=function(){cb(0,{error:\'网络错误\'});};' +
  '  x.send();',
  'x.onload=function(){cb(x.status,JSON.parse(x.responseText||\'{}\'));};' +
  '  x.onerror=function(){cb(0,{error:\'网络错误\'});};' +
  '  if(AUTH_TOKEN)x.setRequestHeader(\'Authorization\',\'Bearer \'+AUTH_TOKEN);' +
  '  x.send();'
);

c = c.replace(
  'x.onload=function(){try{cb(x.status,JSON.parse(x.responseText||\'{}\'))}catch(e){cb(x.status,{error:\'Parse error\'})};' +
  '  x.onerror=function(){cb(0,{error:\'网络错误\'});};' +
  '  x.send(JSON.stringify(data));',
  'x.onload=function(){try{cb(x.status,JSON.parse(x.responseText||\'{}\'))}catch(e){cb(x.status,{error:\'Parse error\'})};' +
  '  x.onerror=function(){cb(0,{error:\'网络错误\'});};' +
  '  if(AUTH_TOKEN)x.setRequestHeader(\'Authorization\',\'Bearer \'+AUTH_TOKEN);' +
  '  x.send(JSON.stringify(data));'
);

fs.writeFileSync(f, c, 'utf-8');
console.log('Login system fixed');
