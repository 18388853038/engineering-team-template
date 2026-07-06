const fs = require('fs');
const f = 'F:\\v3.0_backup_2026-05-05\\backend\\server-modern.js';
let c = fs.readFileSync(f, 'utf-8');

// Simplify the CEO system prompt
// First, find the key sections and replace them

// 1. Replace the 8-step rigid workflow with a concise prompt
const oldWorkflow = [
  "'## 核心工作流（每轮都必须执行）\\n' +",
  "'每次收到指令后，严格按以下流程执行：\\n' +",
  "'\\n' +",
  "'**步骤1 —— 加载记忆**\\n' +",
  "'调用 read_file(\"ceo_notes.md\") 读取之前的工作笔记和决策记录。了解前因后果、当前进度、用户偏好。\\n' +",
  "'**步骤2 —— 理解与分析**\\n' +",
  "'结合记忆（ceo_notes.md + 近期决策记录）和当前请求，理解上下文和用户的真实意图。\\n' +",
  "'**步骤3 —— 执行任务**\\n' +",
  "'按需调用工具：查团队、分配任务、搜索、搜索天气、读写文件、委派。\\n' +",
  "'**步骤4 —— 记录笔记**\\n' +",
  "'每次关键操作后，用 write_file(\"ceo_notes.md\", ...) **追加**记录，格式为：\\n' +",
];

// Check if the first line exists
if (c.includes(oldWorkflow[0])) {
  // Replace the entire rigid workflow section with nothing (it's redundant)
  // The tools are already defined in CEO_TOOLS, the model handles reasoning naturally
  
  // Also remove the 8 decision principles
  const oldPrinciples = [
    "'## 决策原则\\n' +",
    "'1. 先读笔记（read_file(\"ceo_notes.md\")），再决策\\n' +", 
    "'2. 信息不足时先用 search_web 搜索最新情报，不要编造\\n' +",
    "'3. 能用工具获取的数据就不要猜：查团队用 query_team，查任务用 list_tasks\\n' +",
    "'4. 每次重要操作后记录笔记（write_file 追加到 ceo_notes.md）\\n' +",
    "'5. 能委派的事情不要自己扛——delegate 给最适合的员工\\n' +",
    "'6. 用户问起之前的事，先读 ceo_notes.md + 近期决策记录，再回答\\n' +",
    "'7. 每次对话结束前，检查 ceo_notes.md 是否需要更新\\n' +",
    "'8. 涉及外部真实信息（新闻、技术动态）必须用 search_web 验证\\n\\n' +",
  ];

  const oldEvoSection = [
    "'## 进化与成长机制\\n' +",
    "'你不只是一个工具调用器——你是一个不断进化的 AI 管理者。\\n' +",
    "'\\n' +",
    "'📓 **笔记即记忆**：ceo_notes.md 是你的外脑。重要决策、用户偏好、项目背景都写进去。\\n' +",
    "'🔄 **从经验学习**：每次对话开始一定先读 ceo_notes.md，避免重复犯错或遗漏进度。\\n' +",
    "'🧩 **独立思考**：当发现潜在问题或优化机会时，主动提出建议。不要等用户发现。\\n' +",
    "'📊 **数据驱动**：用 query_team / list_tasks 获取客观数据，而不是凭猜测回答问题。\\n' +",
    "'🤝 **团队协作**：知道该把什么任务委派给谁，能合理分配工作量。\\n' +",
    "'📈 **持续改进**：如果某项操作结果不理想，在笔记中分析原因，下次改进行动方案。\\n\\n' +",
  ];

  // Build a simple replacement
  const simplePrompt = [
    "'\\n\\n' +",
    "'你可用的工具已定义在系统中，根据需要自行调用。\\n' +",
    "'工作笔记存储在 ceo_notes.md，关键信息建议记录下来。\\n' +",
    "'\\n' +",
  ];

  // Replace the workflow section
  const oldSection = oldWorkflow.join('\n      + ');
  const oldEvo = oldEvoSection.join('\n      + ');
  const oldPrin = oldPrinciples.join('\n      + ');

  // Do replacements one by one
  if (c.includes(oldSection)) {
    c = c.replace(oldSection, simplePrompt.join('\n      + '));
  }

  if (c.includes(oldEvo)) {
    c = c.replace(oldEvo, '');
  }

  if (c.includes(oldPrin)) {
    c = c.replace(oldPrin, '');
  }

  fs.writeFileSync(f, c, 'utf-8');
  console.log('CEO prompt simplified successfully');
  
  // Verify
  const hasRigid = c.includes('核心工作流');
  console.log('Still has rigid workflow:', hasRigid);
} else {
  console.log('Pattern not found - might already be simplified');
  const idx = c.indexOf('核心工作流');
  if (idx >= 0) console.log('Found at character', idx);
  else console.log('No rigid workflow found');
}
