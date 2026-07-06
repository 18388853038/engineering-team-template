/**
 * browser-automation — 正式版 handler
 * 使用项目内嵌的 Chromium 浏览器，无外部依赖
 * 
 * 功能: 网页截图、提取标题、获取HTML、提取文本内容
 * 
 * 用法:
 *   handler({ cmd: 'screenshot', url: 'https://...', output: 'path.png' })
 *   handler({ cmd: 'title', url: 'https://...' })
 *   handler({ cmd: 'html', url: 'https://...' })
 *   handler({ cmd: 'content', url: 'https://...', selector: 'body' })
 *   handler({ cmd: 'search', url: 'https://...', keyword: '...' })
 */
const path = require('path');
const { execSync } = require('child_process');
const fs = require('fs');

// handler.js 位于: F:\eCompany-Dev\backend\skills-runner\browser-automation\
// 项目根目录: F:\eCompany-Dev\
const PROJECT_ROOT = path.resolve(__dirname, '..', '..', '..');
const NODE = path.join(PROJECT_ROOT, 'node.exe');
const SCRIPT = path.join(PROJECT_ROOT, 'browser-auto-embedded.cjs');

module.exports = async function handler(args) {
  const cmd = args.cmd || args.action || 'help';
  const url = args.url || args.target || '';
  const output = args.output || args.file || '';
  const selector = args.selector || 'body';
  const keyword = args.keyword || args.query || '';

  try {
    let result;
    switch (cmd) {
      case 'screenshot': {
        const outPath = output || path.join(PROJECT_ROOT, `screenshot_${Date.now()}.png`);
        const cmdLine = `"${NODE}" "${SCRIPT}" screenshot "${url}" "${outPath}"`;
        execSync(cmdLine, { encoding: 'utf-8', timeout: 45000 });
        const stats = fs.statSync(outPath);
        result = {
          success: true,
          action: 'screenshot',
          url,
          output: outPath,
          size_bytes: stats.size
        };
        break;
      }
      case 'title': {
        const cmdLine = `"${NODE}" "${SCRIPT}" title "${url}"`;
        const out = execSync(cmdLine, { encoding: 'utf-8', timeout: 45000 });
        const titleMatch = out.match(/Title:\s*(.*)/);
        result = {
          success: true,
          action: 'title',
          url,
          title: titleMatch ? titleMatch[1].trim() : out.trim()
        };
        break;
      }
      case 'html': {
        const cmdLine = `"${NODE}" "${SCRIPT}" html "${url}"`;
        const out = execSync(cmdLine, { encoding: 'utf-8', timeout: 45000 });
        // Strip [browser-auto-embedded] header lines
        const lines = out.split('\n').filter(l => !l.startsWith('['));
        const html = lines.join('\n').trim();
        result = {
          success: true,
          action: 'html',
          url,
          html_length: html.length,
          html_preview: html.substring(0, 2000)
        };
        break;
      }
      case 'content': {
        const cmdLine = `"${NODE}" "${SCRIPT}" content "${url}" "${selector}"`;
        const out = execSync(cmdLine, { encoding: 'utf-8', timeout: 45000 });
        const lines = out.split('\n').filter(l => !l.startsWith('['));
        const content = lines.join('\n').trim();
        result = {
          success: true,
          action: 'content',
          url,
          selector,
          content_length: content.length,
          content: content.substring(0, 5000)
        };
        break;
      }
      case 'search': {
        if (!keyword) {
          return { type: 'browser-automation', skill: 'browser-automation', results: [{ error: '缺少搜索关键词' }] };
        }
        const searchUrl = `https://www.baidu.com/s?wd=${encodeURIComponent(keyword)}`;
        const cmdLine = `"${NODE}" "${SCRIPT}" content "${searchUrl}" "body"`;
        const out = execSync(cmdLine, { encoding: 'utf-8', timeout: 45000 });
        const lines = out.split('\n').filter(l => !l.startsWith('['));
        const content = lines.join('\n').trim();
        result = {
          success: true,
          action: 'search',
          keyword,
          content_length: content.length,
          content: content.substring(0, 5000)
        };
        break;
      }
      default:
        return {
          type: 'browser-automation',
          skill: 'browser-automation',
          results: [{
            available_commands: [
              { cmd: 'screenshot', params: 'url [output]', desc: '网页截图' },
              { cmd: 'title', params: 'url', desc: '获取网页标题' },
              { cmd: 'html', params: 'url', desc: '获取网页HTML源码' },
              { cmd: 'content', params: 'url [selector]', desc: '提取网页文本内容' },
              { cmd: 'search', params: 'url keyword', desc: '搜索并获取结果' }
            ]
          }]
        };
    }

    return {
      type: 'browser-automation',
      skill: 'browser-automation',
      results: [result],
      note: '正式版 — 内嵌 Chromium，可打包转移'
    };
  } catch (e) {
    return {
      type: 'browser-automation',
      skill: 'browser-automation',
      results: [{ error: e.message, stderr: e.stderr?.trim() }],
      note: '调用失败'
    };
  }
};
