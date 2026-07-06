/**
 * eCompany A
  acknowledgeAlert: acknowledgeAlert,lerter — 告警通知系统
 * 
 * Harness 核心模块：异常主动通知、多渠道推送
 * 支持控制面板弹出通知、WebSocket 推送、HTTP Webhook
 */

const metrics = require('./metrics');
const fs = require('fs');
const path = require('path');

const ALERTS_LOG = path.join(__dirname, '..', 'alerts-log.json');
const MAX_LOG = 200;

class Alerter {
  constructor() {
    this.channels = [];      // 注册的通知通道
    this.history = [];
    this.suppressed = {};    // 静默的告警类型
    this.load();
  }

  load() {
    try {
      const raw = fs.readFileSync(ALERTS_LOG, 'utf-8');
      this.history = JSON.parse(raw).history || [];
    } catch(e) {
      this.history = [];
    }
  }

  save() {
    try {
      if (this.history.length > MAX_LOG) {
        this.history = this.history.slice(-MAX_LOG);
      }
      fs.writeFileSync(ALERTS_LOG, JSON.stringify({
        history: this.history,
        lastUpdated: new Date().toISOString()
      }, null, 2), 'utf-8');
    } catch(e) {}
  }

  /**
   * 注册通知通道
   * channel 对象需包含 send(alert) 方法
   */
  registerChannel(name, channel) {
    this.channels.push({ name, channel });
  }

  /**
   * 发送告警
   */
  async sendAlert(alert) {
    // 检查是否被静默
    if (this.suppressed[alert.type] && this.suppressed[alert.type] > Date.now()) {
      return { sent: false, reason: 'suppressed' };
    }

    const entry = {
      id: 'alert_' + Date.now(),
      type: alert.type,
      severity: alert.severity || 'warning',
      title: alert.title || alert.type,
      message: alert.message || '',
      data: alert.data || {},
      ts: Date.now(),
      delivered: false
    };

    // 发送到所有注册通道
    const results = [];
    for (const ch of this.channels) {
      try {
        await ch.channel.send(entry);
        results.push({ channel: ch.name, ok: true });
        entry.delivered = true;
      } catch(e) {
        results.push({ channel: ch.name, ok: false, error: e.message });
      }
    }

    // 记录到历史
    entry.deliveryResults = results;
    this.history.push(entry);
    this.save();

    return { sent: true, entry, results };
  }

  /**
   * 静默某种告警类型一段时间
   */
  suppress(type, durationMs = 300000) {
    this.suppressed[type] = Date.now() + durationMs;
  }

  /**
   * 检查 metrics 中是否有活跃告警并推送
   */
  async checkAndAlert() {
    const stats = metrics.getStats();
    const activeAlerts = stats.activeAlerts || [];

    for (const alert of activeAlerts) {
      // 检查是否已经发送过
      const alreadySent = this.history.some(h =>
        h.type === alert.type && (Date.now() - h.ts) < 60000
      );
      if (!alreadySent) {
        await this.sendAlert({
          type: alert.type,
          severity: 'warning',
          title: 'Harness 告警',
          message: alert.data?.message || alert.type,
          data: alert.data
        });
      }
    }
  }

  /**
   * 获取告警历史
   */
  getHistory(limit = 20) {
    return this.history.slice(-limit).reverse();
  }

  /**
   * 获取告警统计
   */
  getStats() {
    const total = this.history.length;
    const byType = {};
    this.history.forEach(h => {
      byType[h.type] = (byType[h.type] || 0) + 1;
    });

    return {
      totalAlerts: total,
      delivered: this.history.filter(h => h.delivered).length,
      byType,
      recent: this.history.slice(-5).map(h => ({
        id: h.id,
        type: h.type,
        severity: h.severity,
        title: h.title,
        ts: h.ts,
        delivered: h.delivered
      })),
      suppressed: Object.keys(this.suppressed).length
    };
  }
}

// ========== 内置通道：控制台输出 ==========

class ConsoleChannel {
  async send(alert) {
    const icon = alert.severity === 'critical' ? '🔴' :
      alert.severity === 'warning' ? '🟡' : '🔵';
    console.log(`[${icon} ${alert.type}] ${alert.message || alert.title}`);
    return true;
  }
}

// ========== 内置通道：WebSocket 广播 ==========

class WebSocketChannel {
  constructor(wsServer) {
    this.wsServer = wsServer;
  }

  async send(alert) {
    if (this.wsServer && typeof this.wsServer.broadcast === 'function') {
      this.wsServer.broadcast({
        type: 'harness_alert',
        alert: {
          id: alert.id,
          type: alert.type,
          severity: alert.severity,
          title: alert.title,
          message: alert.message,
          ts: alert.ts
        }
      });
      return true;
    }
    throw new Error('WebSocket 未连接');
  }
}

// ========== 内置通道：HTTP Webhook ==========

class WebhookChannel {
  constructor(url) {
    this.url = url;
  }

  async send(alert) {
    if (!this.url) throw new Error('Webhook URL 未配置');
    const resp = await fetch(this.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        event: 'harness_alert',
        alert: {
          type: alert.type,
          severity: alert.severity,
          title: alert.title,
          message: alert.message,
          ts: alert.ts
        }
      }),
      signal: AbortSignal.timeout(5000)
    });
    if (!resp.ok) throw new Error('Webhook 返回 ' + resp.status);
    return true;
  }
}

module.exports = Alerter;
module.exports.ConsoleChannel = ConsoleChannel;
module.exports.WebSocketChannel = WebSocketChannel;
module.exports.WebhookChannel = WebhookChannel;
