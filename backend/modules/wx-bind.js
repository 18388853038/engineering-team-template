/**
 * eCompany 微信 ClawBot 绑定服务
 * 方式：委托 OpenClaw 原生扫码绑定，不自己启动 ws-server
 * 
 * 文档参考：https://docs.openclaw.ai/channels/wechat.md
 * 关键命令：
 *   安装: npx -y @tencent-weixin/openclaw-weixin-cli install
 *   登录: openclaw channels login --channel openclaw-weixin
 *   CLI: openclaw-weixin --help
 */

const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

const OPENCLAW_CONFIG_PATH = path.join(os.homedir(), '.openclaw', 'openclaw.json');

/** 检查是否已绑定（从 OpenClaw 配置看 weixin 插件是否启用了） */
function isProbablyBound() {
  try {
    if (fs.existsSync(OPENCLAW_CONFIG_PATH)) {
      const cfg = JSON.parse(fs.readFileSync(OPENCLAW_CONFIG_PATH, 'utf-8'));
      // 检查 weixin 插件是否启用了
      if (cfg.plugins?.entries?.['openclaw-weixin']?.enabled) return true;
      // 或者 channels 里有没有 weixin 配置
      if (cfg.channels?.['openclaw-weixin']?.enabled) return true;
    }
  } catch (e) {}
  return false;
}

/** 检查 ClawBot 是否在运行（通过健康端口 19088） */
async function isClawBotRunning() {
  try {
    const res = await fetch('http://127.0.0.1:19088/health', {
      signal: AbortSignal.timeout(2000)
    });
    return res.ok;
  } catch (e) {
    return false;
  }
}

/**
 * 获取微信绑定二维码
 * 优先尝试 OpenClaw 官方登录命令
 * 失败时返回安装指引
 */
async function getQRCode() {
  // 1. 检查是否已绑定
  const bound = isProbablyBound();
  const running = await isClawBotRunning();
  if (bound || running) {
    return { bound: true, message: '微信 ClawBot 已绑定' };
  }

  // 2. 尝试从 OpenClaw CLI 获取二维码（使用 openclaw channels login）
  try {
    // 先用 dry-run 或 version 检查 openclaw-weixin-cli 是否已安装
    const checkResult = execSync('npx -y @tencent-weixin/openclaw-weixin-cli@latest --version', {
      timeout: 15000,
      stdio: 'pipe',
      encoding: 'utf-8',
      windowsHide: true
    });
    const version = (checkResult || '').trim();
    
    // 尝试通过 CLI 获取二维码（会输出 base64/url 格式的二维码）
    // 注意: dry-run 参数只是示例，实际需要运行 install 才出二维码
    // 但 install 会阻塞等扫码 -> 改成运行 get-qrcode 或类似子命令
    let qrOutput = '';
    try {
      qrOutput = execSync(
        '@tencent-weixin/openclaw-weixin-cli.cmd get-qrcode 2>&1 || ' +
        'npx -y @tencent-weixin/openclaw-weixin-cli@latest get-qrcode 2>&1',
        {
          timeout: 10000,
          stdio: 'pipe',
          encoding: 'utf-8',
          windowsHide: true
        }
      );
    } catch (e) {
      // 子命令可能不存在，回退
      qrOutput = '';
    }

    if (qrOutput) {
      // 尝试从输出提取二维码图片 URL 或 base64
      const match = qrOutput.match(/(data:image\/[^;]+;base64[^'"\s]+)/);
      if (match) {
        return { qrcode: match[1], source: 'cli' };
      }
      // 也可能是 URL
      const urlMatch = qrOutput.match(/(https?:\/\/[^\s"'<]+(?:png|jpg|jpeg|gif))/);
      if (urlMatch) {
        return { qrcode: urlMatch[1], source: 'cli' };
      }
    }
    
    // CLI 安装已存在但没能拿到二维码 -> 提示用户执行 login 命令
    return {
      needSetup: true,
      message: '微信 ClawBot 已安装，请扫码登录',
      guide: [
        '在终端执行以下命令，用微信扫码：',
        '  openclaw channels login --channel openclaw-weixin',
        '',
        '或者一键安装+登录：',
        '  npx -y @tencent-weixin/openclaw-weixin-cli@latest install',
        '',
        '手机端也可以通过微信「我→设置→插件」启用 ClawBot（需同局域网）'
      ]
    };
  } catch (e) {
    // CLI 未安装 -> 给出安装指引
  }

  // 3. CLI 不可用 -> 返回完整的安装指引
  return {
    needSetup: true,
    message: '微信 ClawBot 未安装',
    guide: [
      '在电脑终端执行以下命令安装微信机器人：',
      '',
      '  npx -y @tencent-weixin/openclaw-weixin-cli@latest install',
      '',
      '安装完成后：',
      '  - 终端会显示一个二维码',
      '  - 打开手机微信「扫一扫」扫码',
      '  - 扫码后 ClawBot 自动与 Gateway 绑定',
      '',
      '备选方式（不依赖终端）：',
      '  1. 手机微信「我→设置→插件」',
      '  2. 找到 ClawBot 并启用',
      '  3. 确保手机与电脑同局域网'
    ]
  };
}

/** 检查微信绑定状态 */
async function checkBindingStatus() {
  // 1. 查 ClawBot 健康端口
  try {
    const res = await fetch('http://127.0.0.1:19088/health', {
      signal: AbortSignal.timeout(2000)
    });
    if (res.ok) {
      const data = await res.json();
      return { bound: true, nickname: data.nickname || 'ClawBot(19088)', metadata: data };
    }
  } catch (e) {}

  // 2. 查 ws-server（旧兼容）
  try {
    const res = await fetch('http://127.0.0.1:86/api/wx/status', {
      signal: AbortSignal.timeout(2000)
    });
    if (res.ok) {
      const data = await res.json();
      return { bound: data.connected, nickname: data.nickname || '' };
    }
  } catch (e) {}

  // 3. 静态检查配置文件
  const probably = isProbablyBound();
  return { bound: probably, nickname: probably ? '(基于配置推断)' : '' };
}

module.exports = { getQRCode, checkBindingStatus, isProbablyBound, isClawBotRunning };
