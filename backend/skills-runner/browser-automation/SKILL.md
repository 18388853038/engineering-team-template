---
name: "browser-automation"
description: "内嵌浏览器自动化，基于Chromium实现网页截图、内容提取、数据采集。当用户需要访问网页、抓取数据、截图、提取网页标题或内容、自动化浏览器操作时使用此技能。"
metadata: { "openclaw": { "emoji": "🌐" } }
---

# Browser Automation 浏览器自动化

基于内嵌 Chromium 的浏览器自动化技能，**无需安装任何外部依赖**，可随项目整体打包转移。

## 功能

| 功能 | 说明 | 示例 |
|:---|:---|:---|
| 📸 **网页截图** | 全页面截图保存为PNG | `screenshot https://example.com` |
| 📝 **获取标题** | 提取网页title标签内容 | `title https://example.com` |
| 📄 **获取HTML** | 获取网页完整HTML源码 | `html https://example.com` |
| 🔍 **提取内容** | 按CSS选择器提取文本 | `content https://example.com div.main` |
| 🔎 **搜索内容** | 在目标网站搜索关键词 | `search https://example.com keyword` |

## 使用场景

- 网页数据采集与爬取
- 竞品分析、价格监控
- 社交媒体内容抓取
- 网页自动化测试
- 网站监控与截图存档
- 电商商品信息提取（京东、淘宝等）

## 技术特点

- 🚀 **内嵌 Chromium** — 浏览器引擎打包在项目内，无需系统安装
- 📦 **零外部依赖** — 所有组件均在项目目录内
- 🔄 **可打包转移** — 复制整个项目目录到新机器即可使用
- ⚡ **无头模式** — 后台运行，不干扰用户操作
- 🛡️ **超时保护** — 45秒自动超时，防止死锁

## 参数说明

| 参数 | 类型 | 必填 | 说明 |
|:---|:---|:---:|:---|
| `cmd` | string | ✅ | 操作类型: screenshot/title/html/content/search |
| `url` | string | ✅ | 目标网页URL |
| `output` | string | ❌ | 截图保存路径（仅screenshot） |
| `selector` | string | ❌ | CSS选择器（仅content，默认body） |
| `keyword` | string | ❌ | 搜索关键词（仅search） |
