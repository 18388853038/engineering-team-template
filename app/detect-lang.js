#!/usr/bin/env node
/**
 * 系统语言检测脚本
 * 检测 Windows 系统语言并返回对应的 eCompany 语言代码
 */

const { execSync } = require('child_process');

function detectSystemLanguage() {
  try {
    // Windows: 使用 powershell 获取系统语言
    if (process.platform === 'win32') {
      const output = execSync('powershell -Command "Get-Culture | Select-Object -ExpandProperty Name"', {
        encoding: 'utf8',
        shell: 'powershell.exe'
      });
      const cultureName = output.trim();
      console.log('Detected Windows culture:', cultureName);
      
      // 映射到 eCompany 语言代码
      const langMap = {
        'zh-CN': 'zh-CN',
        'en-US': 'en-US',
        'ja-JP': 'ja-JP',
        'ko-KR': 'ko-KR',
        'zh-TW': 'zh-TW'
      };
      
      return langMap[cultureName] || 'zh-CN';
    }
    
    // macOS/Linux: 使用 environment variable
    return process.env.LANG || process.env.LANGUAGE || 'zh-CN';
  } catch (e) {
    console.error('Failed to detect system language:', e.message);
    return 'zh-CN'; // 默认中文
  }
}

// 测试
if (require.main === module) {
  const lang = detectSystemLanguage();
  console.log('System language:', lang);
}

module.exports = { detectSystemLanguage };
