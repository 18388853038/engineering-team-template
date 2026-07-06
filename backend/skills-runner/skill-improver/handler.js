/**
 * skill-improver — 由 Skill Importer 从 SKILL.md 自动生成
 * 定期审查所有已安装技能，诊断问题、识别缺口、提出优化建议，Hermes 式
 */
module.exports = async function handler(args) {
  const input = args.query || args.input || args.text || args.url || args.command || '';
  const results = [];

  
  try {
    results.push({
      note: 'skill-improver 技能说明文档已就绪',
      description: `定期审查所有已安装技能，诊断问题、识别缺口、提出优化建议，Hermes 式`,
      commands: [{"lang":"","code":"技能目录扫描\n    ↓\n逐一加载 SKILL.md\n    ↓\n4 维度评分（每项 0-5 分）\n    ↓\n生成失分项列表\n    ↓\n输出优化报告\n    ↓\n等待 CEO 确认后执行修改"},{"lang":"","code":"CEO: \"看看 xxx 技能还能不能优化\"\n    ↓\n定位该技能的 SKILL.md\n    ↓\n分析实际使用记录 + 当前最佳实践\n    ↓\n输出优化建议\n    ↓\nCEO 确认 → 修改文件"}]
    });
  } catch(e) {
    results.push({ error: e.message });
  }

  return {
    type: 'generic',
    skill: 'skill-improver',
    results,
    note: '由 SKILL.md 自动生成'
  };
};
