/**
 * eCompany Agent 消息总线模块 (P1)
 * 功能：事件发布/订阅、消息队列、事件持久化
 * 集成到 server-modern.js 使用
 */

const fs = require('fs');
const path = require('path');

const BASE = path.join(__dirname, '..');
const EVENTS_FILE = path.join(BASE, 'events.json');
const MAX_EVENTS = 500;

// ========== EventBus (内存事件总线) ==========
class EventBus {
  constructor() {
    this._subscribers = {};
  }

  subscribe(eventType, callback) {
    if (!this._subscribers[eventType]) {
      this._subscribers[eventType] = [];
    }
    this._subscribers[eventType].push(callback);
    var self = this;
    return function unsubscribe() {
      var idx = (self._subscribers[eventType] || []).indexOf(callback);
      if (idx >= 0) self._subscribers[eventType].splice(idx, 1);
    };
  }

  publish(eventType, data) {
    var event = {
      id: uuid(),
      type: eventType,
      data: data || {},
      timestamp: new Date().toISOString()
    };
    // 同步通知订阅者
    var subs = this._subscribers[eventType] || [];
    for (var i = 0; i < subs.length; i++) {
      try { subs[i](event); } catch(e) { console.error('[EventBus] subscriber error:', e.message); }
    }
    // 持久化
    EventStore.save(event);
    return event;
  }

  unsubscribe(eventType, callback) {
    var idx = (this._subscribers[eventType] || []).indexOf(callback);
    if (idx >= 0) this._subscribers[eventType].splice(idx, 1);
  }

  getSubscriberCount(eventType) {
    return (this._subscribers[eventType] || []).length;
  }
}

// ========== 消息队列 (Agent间点对点消息) ==========
class MessageQueue {
  constructor() {
    this._queues = {};
  }

  send(from, to, type, content, data) {
    if (!this._queues[to]) this._queues[to] = [];
    var msg = {
      id: uuid(),
      from: from,
      to: to,
      type: type || 'message',
      content: content || '',
      data: data || {},
      read: false,
      timestamp: new Date().toISOString()
    };
    this._queues[to].push(msg);
    // 限制每个Agent的消息队列大小
    if (this._queues[to].length > 200) {
      this._queues[to] = this._queues[to].slice(-200);
    }
    return msg;
  }

  poll(agentId) {
    return (this._queues[agentId] || []).filter(function(m) { return !m.read; });
  }

  markRead(agentId, messageId) {
    var queue = this._queues[agentId] || [];
    for (var i = 0; i < queue.length; i++) {
      if (queue[i].id === messageId) {
        queue[i].read = true;
        return true;
      }
    }
    return false;
  }

  markAllRead(agentId) {
    var queue = this._queues[agentId] || [];
    for (var i = 0; i < queue.length; i++) {
      queue[i].read = true;
    }
    return queue.length;
  }

  getAll(agentId) {
    return this._queues[agentId] || [];
  }
}

// ========== 事件持久化 ==========
var EventStore = {
  _events: [],

  loadEvents() {
    try {
      if (fs.existsSync(EVENTS_FILE)) {
        var raw = fs.readFileSync(EVENTS_FILE, 'utf-8');
        if (raw.charCodeAt(0) === 0xFEFF || raw.charCodeAt(0) === 239) {
          raw = raw.replace(/^[\uFEFF\xEF\xBB\xBF]+/, '');
        }
        this._events = JSON.parse(raw);
      }
    } catch(e) {
      this._events = [];
    }
  },

  saveEvents() {
    try {
      if (this._events.length > MAX_EVENTS) {
        this._events = this._events.slice(-MAX_EVENTS);
      }
      fs.writeFileSync(EVENTS_FILE, JSON.stringify(this._events, null, 2), 'utf-8');
    } catch(e) {
      console.error('[EventStore] save error:', e.message);
    }
  },

  save(event) {
    this._events.push(event);
    this.saveEvents();
  },

  query(options) {
    this.loadEvents();
    var events = this._events;
    if (options) {
      if (options.since) {
        var sinceTs = new Date(options.since).getTime();
        events = events.filter(function(e) { return new Date(e.timestamp).getTime() >= sinceTs; });
      }
      if (options.types) {
        var typesArr = options.types.split(',').map(function(s) { return s.trim(); }).filter(Boolean);
        if (typesArr.length > 0) {
          events = events.filter(function(e) { return typesArr.indexOf(e.type) >= 0; });
        }
      }
      if (options.limit) {
        events = events.slice(0, options.limit);
      }
    }
    return events;
  },

  getRecent(count) {
    this.loadEvents();
    return this._events.slice(-(count || 50));
  },

  clear() {
    this._events = [];
    this.saveEvents();
  }
};

// 初始化：加载历史事件
EventStore.loadEvents();

function uuid() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    var r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

// ========== 单例导出 ==========
var eventBus = new EventBus();
var messageQueue = new MessageQueue();

module.exports = {
  EventBus: EventBus,
  eventBus: eventBus,
  MessageQueue: MessageQueue,
  messageQueue: messageQueue,
  EventStore: EventStore
};
