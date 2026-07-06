const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');
const BASE = __dirname;
const LICENSE_FILE = path.join(BASE, '..', 'config', 'license.json');
const STATS_FILE = path.join(BASE, '..', 'data', 'usage-stats.json');

function getMachineId() {
    try {
        var cpu = execSync('wmic cpu get processorid /format:value', { encoding: 'utf-8', timeout: 3000 }).trim();
        var board = execSync('wmic baseboard get serialnumber /format:value', { encoding: 'utf-8', timeout: 3000 }).trim();
        var cpuId = (cpu.match(/=(\S+)/) || ['', 'unknown'])[1];
        var boardId = (board.match(/=(\S+)/) || ['', 'unknown'])[1];
        return (cpuId + boardId).replace(/\s/g, '').substring(0, 32);
    } catch(e) {
        var ifaces = os.networkInterfaces();
        for (var name in ifaces) {
            for (var i = 0; i < ifaces[name].length; i++) {
                if (!ifaces[name][i].internal && ifaces[name][i].mac !== '00:00:00:00:00:00') {
                    return ifaces[name][i].mac.replace(/:/g, '');
                }
            }
        }
        return 'unknown-' + Date.now().toString(36);
    }
}

var TIERS = {
    free: { name: '免费版', price: 0, employees: 5, dailyChats: 50, maxTasks: 10, channels: 0, maxFileSize: 5*1024*1024, memoryDays: 3, customModel: false, skills: false, modelTier: 'basic' },
    pro: { name: '专业版', price: 29, employees: 15, dailyChats: 500, maxTasks: 50, channels: 1, maxFileSize: 20*1024*1024, memoryDays: 30, customModel: true, skills: true, modelTier: 'standard' },
    business: { name: '企业版', price: 69, employees: 45, dailyChats: -1, maxTasks: -1, channels: 3, maxFileSize: 100*1024*1024, memoryDays: -1, customModel: true, skills: true, modelTier: 'premium' },
    lifetime: { name: '终身会员', price: 699, employees: -1, dailyChats: -1, maxTasks: -1, channels: -1, maxFileSize: -1, memoryDays: -1, customModel: true, skills: true, modelTier: 'all', privateDeploy: false }
};

function loadLicense() {
    try {
        if (fs.existsSync(LICENSE_FILE)) { var d = JSON.parse(fs.readFileSync(LICENSE_FILE, 'utf-8')); if (d.tier && TIERS[d.tier]) return d; }
    } catch(e) {}
    return { tier: 'free', activatedAt: null, licenseKey: '', expiresAt: null, machineId: '' };
}

function saveLicense(data) {
    var dir = path.dirname(LICENSE_FILE); if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(LICENSE_FILE, JSON.stringify(data, null, 2), 'utf-8');
}

function loadStats() {
    try { if (fs.existsSync(STATS_FILE)) return JSON.parse(fs.readFileSync(STATS_FILE, 'utf-8')); } catch(e) {}
    return { chatCount: 0, chatDate: new Date().toISOString().split('T')[0], totalApiCalls: 0 };
}

function saveStats(data) {
    var dir = path.dirname(STATS_FILE); if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(STATS_FILE, JSON.stringify(data, null, 2), 'utf-8');
}

function getMemberStatus() {
    var license = loadLicense();
    var tier = TIERS[license.tier] || TIERS.free;
    var stats = loadStats();
    var today = new Date().toISOString().split('T')[0];
    if (stats.chatDate !== today) { stats.chatCount = 0; stats.chatDate = today; saveStats(stats); }
    var remaining = tier.dailyChats > 0 ? Math.max(0, tier.dailyChats - stats.chatCount) : -1;
    var isLimited = tier.dailyChats > 0 && stats.chatCount >= tier.dailyChats;
    return {
        tier: license.tier, tierName: tier.name, activatedAt: license.activatedAt,
        licenseKey: license.licenseKey ? license.licenseKey.substring(0, 8) + '****' : '',
        machineId: license.machineId ? license.machineId.substring(0, 8) + '****' : '',
        limits: {
            employees: tier.employees, dailyChats: tier.dailyChats, remainingChats: remaining,
            isChatLimited: isLimited, maxTasks: tier.maxTasks, channels: tier.channels,
            maxFileSize: tier.maxFileSize, memoryDays: tier.memoryDays,
            customModel: tier.customModel, skills: tier.skills, modelTier: tier.modelTier
        },
        usage: { todayChats: stats.chatCount, totalApiCalls: stats.totalApiCalls || 0 },
        allTiers: Object.keys(TIERS).map(function(k) {
            var t = TIERS[k];
            return {
                id: k, name: t.name, price: t.price,
                employees: t.employees > 0 ? t.employees : '不限',
                dailyChats: t.dailyChats > 0 ? t.dailyChats + '/天' : '不限',
                channels: t.channels > 0 ? t.channels + '个' : (t.channels === 0 ? '无' : '不限'),
                customModel: t.customModel ? '✅' : '❌',
                skills: t.skills ? '✅' : '❌',
                memoryDays: t.memoryDays > 0 ? t.memoryDays + '天' : '永久'
            };
        })
    };
}

function activateLicense(key, userName) {
    var match = key.match(/^eC-(pro|business|lifetime)-([a-f0-9]{16})$/i);
    if (!match) return { ok: false, error: '激活码格式无效，正确格式: eC-<等级>-<16位密钥>' };
    var tier = match[1].toLowerCase();
    if (!TIERS[tier]) return { ok: false, error: '未知等级' };
    var machineId = getMachineId();
    var license = { tier: tier, activatedAt: new Date().toISOString(), licenseKey: key, machineId: machineId, expiresAt: null, userName: userName || '' };
    saveLicense(license);
    return { ok: true, tier: tier, tierName: TIERS[tier].name, machineId: machineId.substring(0, 8) + '****' };
}

function checkLimit(action, value) {
    var license = loadLicense(); var tier = TIERS[license.tier] || TIERS.free;
    switch(action) {
        case 'chat': return tier.dailyChats < 0 || value <= tier.dailyChats;
        case 'employee': return tier.employees < 0 || value <= tier.employees;
        case 'task': return tier.maxTasks < 0 || value <= tier.maxTasks;
        case 'channel': return tier.channels < 0 || value <= tier.channels;
        case 'fileSize': return tier.maxFileSize < 0 || value <= tier.maxFileSize;
        case 'customModel': return !!tier.customModel;
        case 'skills': return !!tier.skills;
        default: return true;
    }
}

function recordChat() {
    var stats = loadStats(); var today = new Date().toISOString().split('T')[0];
    if (stats.chatDate !== today) { stats.chatCount = 1; stats.chatDate = today; } else stats.chatCount++;
    stats.totalApiCalls = (stats.totalApiCalls || 0) + 1;
    saveStats(stats); return stats.chatCount;
}

module.exports = { TIERS: TIERS, getMemberStatus: getMemberStatus, activateLicense: activateLicense, checkLimit: checkLimit, recordChat: recordChat, loadLicense: loadLicense };