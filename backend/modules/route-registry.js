'use strict';
/**
 * modules/route-registry.js — 共享路由注册中心
 * 
 * server-modern.js 和 routes/*.js 都 require 这个模块来共享同一个 ROUTES 数组。
 * server-modern.js 需要改为使用这个模块的 registerRoute 和 ROUTES。
 * 
 * 但为了不破坏 server-modern.js 的现有逻辑，我们提供一个包装方案：
 * 1. 这个模块创建 ROUTES 数组和 registerRoute 函数
 * 2. 在 server-modern.js 第286行不创建新的 ROUTES，而是引用这里的
 * 3. routes/*.js 通过 require 得到同一个引用
 */

// ROUTES 数组（共享引用）
const ROUTES = [];

function registerRoute(methods, pattern, handler) {
  if (typeof methods === 'string') methods = [methods];
  ROUTES.push({ methods, pattern, handler });
}

function matchRoute(method, pathname) {
  for (const r of ROUTES) {
    if (r.methods.includes(method)) {
      const m = pathname.match(r.pattern);
      if (m) return { handler: r.handler, match: m };
    }
  }
  return null;
}

module.exports = { ROUTES, registerRoute, matchRoute };
