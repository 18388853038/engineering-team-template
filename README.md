# 🐉 eCompany Dev — AI 虚拟公司团队协作管理平台

> 一个由 AI 员工组成的虚拟公司管理平台，支持多模态沟通、任务调度、团队成员协作，以及12+渠道的实时消息对接。

---

## ✨ 功能特性

### 🤖 AI 员工矩阵
- **48 位专职 AI 员工**：按能力矩阵分角色（CEO、CTO、产品、设计、运营、市场、客服…）
- **子代理调度系统**：实时 sub-agent 任务分发，淘汰传统文件轮询模式
- **主动推送 & 任务驱动**：AI 员工会自动汇报、自驱执行

### 🔌 多通道通讯桥接（12+ 渠道）
| 国内渠道 | 国际渠道 |
|---------|---------|
| 微信 | Telegram |
| 企业微信 | WhatsApp |
| 飞书 | Discord |
| 钉钉 | Slack |
| QQ机器人 | |
| 腾讯AI | |
| 网关直连 | |

每条消息实时通过 SSE 推送至工作台，支持跨渠道上下文追踪。

### 🧠 知识引擎
- 自动文档索引与语义检索
- 项目级知识库管理
- 文档导出（Markdown / PDF）

### 📊 完整的前端管理面板
- **团队工作台**：实时 AI 员工状态与任务看板
- **Chat 频道**：多轮对话，历史压缩，手动/自动刷新
- **员工管理**：能力矩阵、绩效评估
- **任务管理**：P1/P2/P3 优先级队列，子任务分解
- **目标追踪**：OKR-style 目标系统
- **知识库浏览**：自动分类 + 全文搜索
- **系统健康**：实时状态监控
- **设置中心**：渠道配置、桥接管理、国际化语言

### 🖥️ 桌面应用
- Electron 打包（Windows，便携版 + NSIS 安装程序）
- 支持自定义工作区路径
- 单文件拖拽上传
- 系统托盘最小化
- 📥 [下载安装包 (v3.0.0, 117.9MB)](https://pan.baidu.com/s/12ay2R5JN5mBp1j_DlWFXnQ?pwd=58kg)（百度网盘，提取码: 58kg）

---

## 🏗️ 项目结构

```
eCompany-Dev/
├── backend/                    # Node.js 后端服务器
│   ├── server-modern.js        # 主服务器入口 (~382KB)
│   ├── modules/                # 业务模块 (139 个)
│   │   ├── agent-dispatcher.js # AI员工调度核心
│   │   ├── channel-installer.js# 12渠道桥接管理
│   │   ├── goal-tracker.js     # 目标追踪系统
│   │   ├── knowledge-engine.js # 知识引擎
│   │   ├── shared-memory.js    # 共享记忆
│   │   ├── *-bridge.js         # 各渠道桥接实现
│   │   └── ...
│   └── node_modules/           # 后端依赖
├── frontend/                   # Vue 3 前端
│   ├── src/
│   │   ├── views/              # 页面组件 (20+)
│   │   ├── assets/             # 静态资源
│   │   ├── App.vue             # 根组件
│   │   └── main.js             # 入口
│   └── dist/                   # 构建产出
├── app/                        # Electron 桌面应用
│   ├── main.js                 # 主进程
│   ├── preload.js              # 预加载脚本
│   ├── build-pkg.js            # 构建脚本
│   └── package.json            # 桌面应用配置
├── AI团队/                     # AI 员工配置文件
├── memory/                     # 记忆存储
├── .gitignore
└── README.md
```

---

## 🚀 快速开始

### 环境要求
- **Node.js** ≥ 22.x （推荐 v22.22.2）
- **npm** ≥ 10.x
- **Windows 10/11**（桌面版）

### 安装依赖
```bash
# 后端
cd backend
npm install

# 前端
cd frontend
npm install
npm run build
```

### 启动服务器
```bash
cd backend
node server-modern.js
```
服务默认监听 `http://localhost:8002`

### 桌面版打包
```bash
cd app
npm install
node build-pkg.js
```
产出于 `dist-desktop-dev/`：便携版 `win-unpacked/ECompany Dev.exe` 和安装包 `ECompany Dev Setup 3.0.0.exe`

---

## 🔧 配置

### 环境变量
| 变量 | 说明 | 默认值 |
|------|------|--------|
| `PORT` | 服务器端口 | 8002 |
| `NODE_ENV` | 运行环境 | production |

### 渠道桥接
各渠道需要配置对应的 API Key / Token，在启动后通过管理面板 `设置 → 渠道配置` 中配置。

### AI 员工
团队成员配置在 `AI团队/` 目录下，启动时自动加载。

---

## 🧩 技术栈

| 领域 | 技术 |
|------|------|
| 后端 | Node.js 22, Express.js |
| 前端 | Vue 3, Vite, SCSS |
| 数据库 | SQLite (better-sqlite3) |
| 桌面 | Electron 34, electron-builder |
| 实时通信 | SSE + WebSocket |
| 国际化 | 内置 i18n 引擎 |
| AI | OpenAI-compatible API, sub-agent 调度引擎 |

---

## 📜 开源协议

本项目基于 **MIT 协议** 开源 — 详见 [LICENSE](LICENSE) 文件。

---

## 🌟 贡献

欢迎提交 Issue 和 PR！大改动前请先开 Issue 讨论。

---

> 用 AI 驱动团队，让人做更有价值的事。 🐉
