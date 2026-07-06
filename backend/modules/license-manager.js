/**
 * license-manager.js — eCompany 试用版许可管理器
 *
 * 功能：
 * 1. 读取机器硬件特征码（主板序列号、硬盘序列号、MAC地址）
 * 2. 生成唯一机器绑定码
 * 3. 首次运行记录激活时间
 * 4. 每次启动检查：机器码是否一致 + 是否在30天试用期内
 * 5. 超期自动拒绝启动
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const os = require('os');

const LICENSE_FILE = path.join(__dirname, '..', 'license.info');
const TRIAL_DAYS = 30;

/**
 * 获取机器特征码
 * 组合多个硬件标识生成唯一ID
 */
function getMachineFingerprint() {
  var parts = [];

  // 1. CPU 信息
  try {
    var cpus = os.cpus();
    if (cpus && cpus.length > 0) {
      parts.push(cpus[0].model || '');
      parts.push(cpus.length.toString());
    }
  } catch(e) {}

  // 2. 网卡 MAC 地址
  try {
    var nets = os.networkInterfaces();
    for (var name in nets) {
      var addrs = nets[name];
      for (var i = 0; i < addrs.length; i++) {
        if (addrs[i].mac && addrs[i].mac !== '00:00:00:00:00:00') {
          parts.push(addrs[i].mac);
          break;
        }
      }
      if (parts.length > 1) break; // 取第一个非虚拟网卡
    }
  } catch(e) {}

  // 3. 主机名
  try {
    parts.push(os.hostname());
  } catch(e) {}

  // 4. 操作系统信息
  try {
    parts.push(os.platform());
    parts.push(os.arch());
    parts.push(os.release());
  } catch(e) {}

  // 5. Windows 特定：硬盘序列号（通过 wmic）
  if (process.platform === 'win32') {
    try {
      var cp = require('child_process');
      var out = cp.execSync('wmic diskdrive get serialnumber /format:csv', { encoding: 'utf-8', timeout: 3000 });
      var lines = out.trim().split('\n').filter(function(l) { return l.trim(); });
      if (lines.length > 1) {
        parts.push(lines[lines.length - 1].split(',')[1] || '');
      }
    } catch(e) {}
  }

  // 生成固定长度的哈希
  var raw = parts.join('|');
  return crypto.createHash('sha256').update(raw).digest('hex').substring(0, 16);
}

/**
 * 首次激活：记录机器码和激活时间
 */
function activateTrial() {
  try {
    var machineCode = getMachineFingerprint();
    var now = new Date();
    var expiresAt = new Date(now.getTime() + TRIAL_DAYS * 24 * 60 * 60 * 1000);

    var license = {
      machineCode: machineCode,
      activatedAt: now.toISOString(),
      expiresAt: expiresAt.toISOString(),
      version: 'trial',
      trialDays: TRIAL_DAYS
    };

    fs.writeFileSync(LICENSE_FILE, JSON.stringify(license, null, 2), 'utf-8');
    return { ok: true, message: '试用激活成功', expiresAt: expiresAt.toISOString(), daysLeft: TRIAL_DAYS };
  } catch (e) {
    return { ok: false, error: '激活失败: ' + e.message };
  }
}

/**
 * 验证许可状态
 * 检查：机器码是否匹配 + 是否在有效期内
 */
function verifyLicense() {
  try {
    // 读取许可文件
    if (!fs.existsSync(LICENSE_FILE)) {
      // 首次运行，自动激活
      return activateTrial();
    }

    var raw = fs.readFileSync(LICENSE_FILE, 'utf-8');
    var license = JSON.parse(raw);

    // 检查机器码
    var currentMachine = getMachineFingerprint();
    if (license.machineCode !== currentMachine) {
      return {
        ok: false,
        error: '许可绑定机器不匹配',
        message: '此试用版已在另一台电脑上激活，请购买正式版',
        fatal: true
      };
    }

    // 检查有效期
    var now = new Date();
    var expiresAt = new Date(license.expiresAt);
    var daysLeft = Math.floor((expiresAt.getTime() - now.getTime()) / (24 * 60 * 60 * 1000));

    if (now > expiresAt) {
      return {
        ok: false,
        error: '试用已过期',
        message: '30天试用期已结束，请购买正式版',
        activatedAt: license.activatedAt,
        expiresAt: license.expiresAt,
        expiredDays: Math.abs(daysLeft),
        fatal: true
      };
    }

    return {
      ok: true,
      message: '试用版运行中',
      activatedAt: license.activatedAt,
      expiresAt: license.expiresAt,
      daysLeft: daysLeft,
      machineCode: license.machineCode
    };
  } catch (e) {
    return { ok: false, error: '许可验证异常: ' + e.message, fatal: false };
  }
}

/**
 * 获取许可状态（不触发激活，只查询）
 */
function getLicenseStatus() {
  try {
    if (!fs.existsSync(LICENSE_FILE)) {
      return { ok: false, status: 'unactivated', message: '首次启动将自动激活30天试用' };
    }
    var raw = fs.readFileSync(LICENSE_FILE, 'utf-8');
    var license = JSON.parse(raw);
    var now = new Date();
    var expiresAt = new Date(license.expiresAt);
    var daysLeft = Math.floor((expiresAt.getTime() - now.getTime()) / (24 * 60 * 60 * 1000));

    return {
      ok: daysLeft > 0,
      status: daysLeft > 0 ? 'active' : 'expired',
      activatedAt: license.activatedAt,
      expiresAt: license.expiresAt,
      daysLeft: Math.max(0, daysLeft),
      machineCode: license.machineCode
    };
  } catch (e) {
    return { ok: false, status: 'error', error: e.message };
  }
}

module.exports = {
  getMachineFingerprint,
  activateTrial,
  verifyLicense,
  getLicenseStatus
};
