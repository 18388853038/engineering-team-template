/**
 * dy-skill-i18n — 由 Skill Importer 从 SKILL.md 自动生成
 * 处理前端国际化翻译工作。当用户提到需要做国际化、i18n、翻译、多语言支持时使用此 skill。主要功能：1) 识别代码中的硬编码静态文字；2) 判断是否应使用现有公共翻译或需要新增；3) 将翻译添加到对应的语言文件中；4) 将硬编码替换为国际化调用；5) 检查翻译完整性和正确性。
 */
module.exports = async function handler(args) {
  const input = args.query || args.input || args.text || args.url || args.command || '';
  const results = [];

  
  try {
    results.push({
      note: 'dy-skill-i18n 技能说明文档已就绪',
      description: `处理前端国际化翻译工作。当用户提到需要做国际化、i18n、翻译、多语言支持时使用此 skill。主要功能：1) 识别代码中的硬编码静态文字；2) 判断是否应使用现有公共翻译或需要新增；3) 将翻译添加到对应的语言文件中；4) 将硬编码替换为国际化调用；5) 检查翻译完整性和正确性。`,
      commands: [{"lang":"","code":"lang/\n├── common/        # 公共翻译\n│   ├── zh.ts\n│   └── en.ts\n├── module/        # 模块翻译\n│   ├── product/\n│   ├── order/\n│   └── ...\n└── index.ts"},{"lang":"","code":"lang/\n├── zh_CN.ts\n├── en_US.ts\n└── index.ts"},{"lang":"","code":"IF 项目有 common/ 或类似的公共目录 THEN\n  IF 翻译是通用性质的 THEN\n    添加到公共目录\n  ELSE\n    添加到对应模块目录\nELSE\n  添加到主语言文件中，使用模块前缀区分"},{"lang":"","code":"通用性质 = 任何模块都可能用到\n- 操作类：新增、编辑、删除、查看、导入、导出、提交、审核\n- 提示类：确定、取消、关闭，保存、成功、失败\n- 占位符类：请输入、请选择、开始日期、结束日期\n- 表格类：序号、操作、状态\n\n模块特有 = 只有特定模块使用\n- 产品名称、产品编码、产品分类\n- 订单号、订单状态\n- 客户名称、客户电话"},{"lang":"typescript","code":"// zh_CN.ts\nexport default {\n  common: {\n    action: { add: \"新增\", edit: \"编辑\" },\n  },\n  product: {\n    name: \"产品名称\",\n    code: \"产品编码\",\n  },\n  order: {\n    no: \"订单号\",\n    status: \"订单状态\",\n  },\n};"}]
    });
  } catch(e) {
    results.push({ error: e.message });
  }

  return {
    type: 'git',
    skill: 'dy-skill-i18n',
    results,
    note: '由 SKILL.md 自动生成'
  };
};
