const fs = require('fs');
const path = require('path');
const https = require('https');
const QRCode = require('qrcode');

const ILINK_BASE = 'https://ilinkai.weixin.qq.com';
const ACCOUNTS_DIR = path.join(process.env.USERPROFILE, '.openclaw', 'openclaw-weixin', 'accounts');

function httpsGet(urlPath) {
  return new Promise((resolve, reject) => {
    https.get(ILINK_BASE + urlPath, {
      timeout: 20000,
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36', 'Accept': 'application/json' }
    }, res => {
      let d = ''; res.on('data', c => d += c);
      res.on('end', () => { try { resolve(JSON.parse(d)); } catch(e) { resolve({}); } });
    }).on('error', reject);
  });
}

module.exports = {
  async generateQR() {
    try {
      const r = await httpsGet('/ilink/bot/get_bot_qrcode?bot_type=3');
      if (r && r.qrcode) {
        var wxUrl = r.qrcode_img_content || '';
        // ⭐ 关键修复：用 qrcode 包生成真实的二维码图片（data URL）
        var qrHash = r.qrcode;
        var wxUrlForQR = wxUrl || ('https://liteapp.weixin.qq.com/q/' + qrHash + '?bot_type=3');
        var qrImage = await QRCode.toDataURL(wxUrlForQR, { width: 280, margin: 2, errorCorrectionLevel: 'M' });
        // 返回：qrcode=图片dataURL供前端显示，qrToken=hash供轮询状态
        return { ok: true, qrcode: qrImage, qrToken: qrHash, wxUrl: wxUrl };
      }
      return { ok: false, error: '获取二维码失败: ' + JSON.stringify(r).substring(0, 100) };
    } catch(e) {
      return { ok: false, error: e.message };
    }
  },

  async pollQRStatus(qrcode, timeout = 300000) {
    const start = Date.now();
    let lastStatus = '';
    // qrcode 参数可能是 hash 也可能是完整 URL，提取 hash
    var qrHash = qrcode || '';
    // 如果传入了完整 URL，从中提取 hash
    if (qrHash.includes('qrcode=')) {
      var m = qrHash.match(/qrcode=([a-f0-9]+)/i);
      if (m) qrHash = m[1];
    }
    if (!qrHash) return { ok: false, status: 'invalid', error: '无效的二维码标识' };

    // Single check (frontend polls every 2s, we query ilink once)
    try {
      const r = await httpsGet('/ilink/bot/get_qrcode_status?qrcode=' + encodeURIComponent(qrHash));
      const status = r.status || '';
      if (status === 'confirmed' && r.bot_token) {
        try {
          var listPath = path.join(ACCOUNTS_DIR, '..', 'accounts.json');
          var oldList = [];
          try { oldList = JSON.parse(fs.readFileSync(listPath, 'utf8')); } catch(e) {}
          oldList.forEach(function(id) {
            try { fs.unlinkSync(path.join(ACCOUNTS_DIR, id + '.json')); } catch(e) {}
            try { fs.unlinkSync(path.join(ACCOUNTS_DIR, id + '.sync.json')); } catch(e) {}
            try { fs.unlinkSync(path.join(ACCOUNTS_DIR, id + '.context-tokens.json')); } catch(e) {}
          });
          if (!fs.existsSync(ACCOUNTS_DIR)) fs.mkdirSync(ACCOUNTS_DIR, { recursive: true });
          const token = r.bot_token;
          const id = token.substring(0, 12) + '-im-bot';
          fs.writeFileSync(path.join(ACCOUNTS_DIR, id + '.json'), JSON.stringify({
            token, savedAt: new Date().toISOString(),
            baseUrl: ILINK_BASE,
            userId: r.openid || r.userId || ''
          }), 'utf8');
          fs.writeFileSync(listPath, JSON.stringify([id], null, 2), 'utf8');
        } catch(e) { console.log('[wx-qrcode] 保存失败:', e.message); }
        return { ok: true, bound: true, userId: r.openid || r.userId || '' };
      }
      if (status === 'expired' || status === 'canceled') {
        return { ok: false, bound: false, status: status, error: status === 'expired' ? '二维码已过期' : '扫码已取消' };
      }
      // Still pending/not yet scanned
      return { ok: true, bound: false, status: status || 'pending' };
    } catch(e) {
      return { ok: false, bound: false, error: e.message };
    }
;
  },

  isBound() {
    try {
      if (!fs.existsSync(ACCOUNTS_DIR)) return false;
      var listPath = path.join(ACCOUNTS_DIR, '..', 'accounts.json');
      if (!fs.existsSync(listPath)) return false;
      return JSON.parse(fs.readFileSync(listPath, 'utf8')).length > 0;
    } catch(e) { return false; }
  },

  getBoundUser() {
    try {
      if (!this.isBound()) return null;
      var listPath = path.join(ACCOUNTS_DIR, '..', 'accounts.json');
      var accounts = JSON.parse(fs.readFileSync(listPath, 'utf8'));
      if (accounts.length === 0) return null;
      var f = path.join(ACCOUNTS_DIR, accounts[0] + '.json');
      return fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : null;
    } catch(e) { return null; }
  }
};
