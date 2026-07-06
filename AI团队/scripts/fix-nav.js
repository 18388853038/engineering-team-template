const fs = require('fs');
const f = 'F:\\v3.0_backup_2026-05-05\\frontend\\dist\\index.html';
let c = fs.readFileSync(f, 'utf-8');

// Lines 146-147 have nested settings tab wrapping channels tab
// Fix: split into two separate divs
const oldLine = `<div class="nav-tab" :class="{active:nav==='settings'}" @click="nav='settings'">⚙️ 设置\n  <div class="nav-tab" :class="{active:nav==='channels'}" @click="loadChannels();nav='channels'">📡 通道</div></div>`;
const newLine = `<div class="nav-tab" :class="{active:nav==='settings'}" @click="nav='settings'">⚙️ 设置</div>\n  <div class="nav-tab" :class="{active:nav==='channels'}" @click="loadChannels();nav='channels'">📡 通道</div>`;

if (c.includes(oldLine)) {
  c = c.replace(oldLine, newLine);
  console.log('Fixed nested tabs');
} else {
  // Manual replacement - find and replace exact text
  c = c.replace(
    `"nav='settings'">⚙️ 设置\n  <div class="nav-tab" :class="{active:nav==='channels'}" @click="loadChannels();nav='channels'">📡 通道</div></div>`,
    `"nav='settings'">⚙️ 设置</div>\n  <div class="nav-tab" :class="{active:nav==='channels'}" @click="loadChannels();nav='channels'">📡 通道</div>`
  );
  console.log('Fixed nested tabs (method 2)');
}

fs.writeFileSync(f, c, 'utf-8');
console.log('Done');
