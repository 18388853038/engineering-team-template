const fs = require('fs');
const c = fs.readFileSync('F:\\v3.0_backup_2026-05-05\\backend\\server-modern.js', 'utf-8');
const idx = c.indexOf("AGENTS_MAP.ai_ceo.description");
if (idx >= 0) {
  console.log(c.substring(idx, idx + 350));
  // Check for model info
  const hasModel = c.includes("运行环境");
  console.log("\nHas 运行环境:", hasModel);
  const ceoModel = c.indexOf("你正在运行的模型");
  if (ceoModel >= 0) console.log("CEO has model info");
} else {
  console.log("Not found");
}
