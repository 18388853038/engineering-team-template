/**
 * skill-doc-design — 由 Skill Importer 从 SKILL.md 自动生成
 * 
 */
module.exports = async function handler(args) {
  const input = args.query || args.input || args.text || args.url || args.command || '';
  const results = [];

  
  try {
    results.push({
      note: 'skill-doc-design 技能说明文档已就绪',
      description: ``,
      commands: [{"lang":"","code":"执行: ls -la /root/.openclaw/media/inbound/\n筛选: 最近5分钟内上传的文件（排除临时文件）\n输出: 文件列表"},{"lang":"","code":"分析:\n  - 提取所有文件的公共关键词\n  - 生成候选文件夹名（如：飞奕多联机空调集中控制和计费软件）\n  \n询问用户:\n  \"检测到 X 个文件:\n   - file1.docx\n   - file2.docx\n   \n   建议文件夹名: XXX\n   确认用这个名？还是你另外起一个？\""},{"lang":"","code":"执行:\n  mkdir -p /workspace/{文件夹名}\n  mv /inbound/xxx.docx /workspace/{文件夹名}/"},{"lang":"","code":"输出: 提取的文本内容（关键章节：功能需求、技术架构、模块设计、通信协议等）"},{"lang":"","code":"询问用户:\n  \"设计文档需要包含哪些章节？\n   \n   可选章节：\n   ✓ 功能需求\n   ✓ 系统架构\n   ✓ 模块设计（含接口定义）\n   ✓ 数据结构定义\n   ✓ 通信协议（MQTT/Modbus/蓝牙）\n   ✓ 存储设计（Flash分区/数据库）\n   ✓ API设计\n   ✓ 接口定义\n   ✓ 错误处理\n   ✓ 部署方案\n   \n   需要哪些？需要补充什么？\""}]
    });
  } catch(e) {
    results.push({ error: e.message });
  }

  return {
    type: 'generic',
    skill: 'skill-doc-design',
    results,
    note: '由 SKILL.md 自动生成'
  };
};
