/**
 * document-pro — 由 Skill Importer 从 SKILL.md 自动生成
 * 文档处理技能 - 让 AI 能够读取、解析、提取 PDF、DOCX、PPT 等文档的关键信息。当用户要求分析文档、提取内容、总结报告时触发此技能。
 */
module.exports = async function handler(args) {
  const input = args.query || args.input || args.text || args.url || args.command || '';
  const results = [];

  
  try {
    const { execSync } = require('child_process');
    const pyCode = input || `from pptx import Presentation

prs = Presentation(\"presentation.pptx\")
for slide in prs.slides:
    for shape in slide.shapes:
        if shape.has_text_frame:
            print(shape.text)`;
    const out = execSync('python -c ' + JSON.stringify(pyCode), { encoding: 'utf-8', timeout: 10000 });
    results.push({ output: out.trim() });
  } catch(e) {
    results.push({ error: e.message });
  }

  return {
    type: 'python',
    skill: 'document-pro',
    results,
    note: '由 SKILL.md 自动生成'
  };
};
