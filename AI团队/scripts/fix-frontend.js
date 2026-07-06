const fs = require('fs');
const f = 'F:\\v3.0_backup_2026-05-05\\frontend\\dist\\index.html';
let c = fs.readFileSync(f, 'utf-8');
// Fix broken current ref
c = c.replace(
  'const current=ref({name_cn:" eCompany,title:AI管理系统,icon:🏢});',
  'const current=ref({name_cn:"eCompany",title:"AI管理系统",icon:"🏢"});'
);
fs.writeFileSync(f, c, 'utf-8');
console.log('Fixed');
