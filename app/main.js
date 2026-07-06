/**
 * eCompany Dev Desktop — Electron 桌面主进程
 *
 * 路径策略：
 * - 开发模式：__dirname = F:\eCompany-Dev\app\，用 .. 定位项目根目录
 * - 打包模式：process.resourcesPath = ...\resources\，backend/node.exe/dist 都在这里
 */

const { app, BrowserWindow, Tray, Menu, nativeImage, dialog, Notification, ipcMain } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');

// ========== 配置 ==========
const PORT = 8005;
const APP_VERSION = '3.0.0';
const APP_NAME = 'ECompany Dev';

// ========== 路径解析（开发 / 打包 通用）==========
// 开发：__dirname = F:\eCompany-Dev\app\  →  .. = F:\eCompany-Dev\
// 打包：process.resourcesPath = ...\resources\  → backend\, node.exe, frontend\ 都在这里
const RESOURCES_DIR = app.isPackaged ? process.resourcesPath : path.join(__dirname, '..');
const SERVER_SCRIPT = path.join(RESOURCES_DIR, 'backend', 'server-modern.js');
const NODE_EXE = process.platform === 'win32'
  ? path.join(RESOURCES_DIR, 'node.exe')
  : 'node';

// ========== 语言配置 ==========
const languages = [
  { code: 'zh-CN', label: '简体中文' },
  { code: 'zh-TW', label: '繁體中文' },
  { code: 'en',    label: 'English' },
  { code: 'ja',    label: '日本語' },
  { code: 'ko',    label: '한국어' }
];

let currentLang = 'zh-CN';
try {
  const { detectSystemLanguage } = require('./detect-lang.js');
  const detected = detectSystemLanguage();
  if (detected && languages.some(l => l.code === detected)) {
    currentLang = detected;
    console.log('[i18n] Auto-detected:', currentLang);
  }
} catch (e) {
  console.error('[i18n] Failed to detect language:', e.message);
}

// ========== 状态 ==========
let mainWindow = null;
let tray = null;
let serverProcess = null;
let appQuitting = false;

// ========== 启动内嵌服务器 ==========
function startServer() {
  return new Promise((resolve, reject) => {
    if (!fs.existsSync(SERVER_SCRIPT)) {
      reject(new Error('服务器文件不存在: ' + SERVER_SCRIPT));
      return;
    }

    const env = Object.assign({}, process.env, {
      PORT: String(PORT),
      NODE_ENV: 'production'
    });

    console.log('[Server] Starting:', NODE_EXE, SERVER_SCRIPT);
    serverProcess = spawn(NODE_EXE, [SERVER_SCRIPT], {
      cwd: path.dirname(SERVER_SCRIPT),
      stdio: ['ignore', 'pipe', 'pipe'],
      env: env
    });

    serverProcess.stdout.on('data', (data) => {
      console.log('[Server]', data.toString().trim());
    });

    serverProcess.stderr.on('data', (data) => {
      console.error('[Server Error]', data.toString().trim());
    });

    serverProcess.on('error', (err) => {
      reject(err);
    });

    serverProcess.on('exit', (code) => {
      if (!appQuitting) {
        console.log('[Server] exited with code', code, '- restarting in 2s...');
        serverProcess = null;
        setTimeout(() => startServer().then(resolve).catch(reject), 2000);
      }
    });

    // 轮询等待服务器就绪
    let attempts = 0;
    const maxAttempts = 30;
    const checkServer = setInterval(() => {
      attempts++;
      const req = http.get(`http://127.0.0.1:${PORT}/api/health`, (res) => {
        if (res.statusCode === 200) {
          clearInterval(checkServer);
          console.log('[Server] Ready on port', PORT);
          resolve();
        }
      });
      req.on('error', () => {
        if (attempts >= maxAttempts) {
          clearInterval(checkServer);
          reject(new Error('服务器启动超时'));
        }
      });
      req.end();
    }, 1000);
  });
}

// ========== 品牌 Logo 图标（logo.jpg → favicon.svg）==========
function getAppIcon() {
  // 打包后资源路径优先，回退开发模式
  const candidates = [
    path.join(RESOURCES_DIR, 'frontend', 'dist', 'logo.jpg'),
    path.join(RESOURCES_DIR, 'frontend', 'dist', 'favicon.svg'),
    path.join(RESOURCES_DIR, 'frontend', 'logo.jpg'),
    path.join(RESOURCES_DIR, 'frontend', 'favicon.svg'),
    path.join(RESOURCES_DIR, 'logo.jpg'),
    path.join(RESOURCES_DIR, 'favicon.ico'),
    path.join(__dirname, '..', 'frontend', 'dist', 'logo.jpg'),
    path.join(__dirname, '..', 'frontend', 'dist', 'favicon.svg'),
    path.join(__dirname, '..', 'frontend', 'public', 'logo.jpg'),
    path.join(__dirname, '..', 'frontend', 'public', 'favicon.svg')
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

function getTrayIcon() {
  const iconPath = getAppIcon();
  if (iconPath) {
    const img = nativeImage.createFromPath(iconPath);
    if (!img.isEmpty()) return img.resize({ width: 16, height: 16 });
  }
  return null;
}

// ========== 构建原生菜单（默认中文）==========
function buildAppMenu() {
  return Menu.buildFromTemplate([
    {
      label: '文件',
      submenu: [
        {
          label: '关于 ' + APP_NAME + ' v' + APP_VERSION,
          click: () => {
            dialog.showMessageBox(mainWindow, {
              type: 'info',
              title: '关于 ' + APP_NAME,
              message: APP_NAME + ' v' + APP_VERSION,
              detail: 'eCompany · AI 虚拟公司 开发版桌面应用\\n\\n' +
                     '▪ 48 名 AI 员工（CEO/CTO/架构师/前端/后端/运维/QA/合规审计等）\\n' +
                     '▪ 76+ 技能（浏览器自动化、桌面控制、网页抓取、安全审计等）\\n' +
                     '▪ 14 家 AI 模型提供商、5 种语言界面\\n' +
                     '▪ 内嵌 Chromium 浏览器引擎 + 桌面控制引擎\\n' +
                     '▪ 自我进化系统（自动学习 → 跨Agent共享 → 技能升级）\\n' +
                     '▪ Harness 规则引擎 + 合规审计系统\\n\\n' +
                     '开发版 · 端口 ' + PORT + ' · 零外部依赖\\n' +
                     '© 2026 eCompany Project'
            });
          }
        },
        { type: 'separator' },
        { role: 'reload', label: '刷新页面' },
        { type: 'separator' },
        { role: 'quit', label: '退出 ' + APP_NAME }
      ]
    },
    {
      label: '编辑',
      submenu: [
        { role: 'undo', label: '撤销' },
        { role: 'redo', label: '重做' },
        { type: 'separator' },
        { role: 'cut', label: '剪切' },
        { role: 'copy', label: '复制' },
        { role: 'paste', label: '粘贴' },
        { role: 'selectAll', label: '全选' }
      ]
    },
    {
      label: '视图',
      submenu: [
        { role: 'resetZoom', label: '重置缩放' },
        { role: 'zoomIn', label: '放大' },
        { role: 'zoomOut', label: '缩小' },
        { type: 'separator' },
        { role: 'toggleDevTools', label: '开发者工具' },
        { role: 'togglefullscreen', label: '全屏切换' }
      ]
    },
    {
      label: '语言 / Language',
      submenu: languages.map(lang => ({
        label: lang.label,
        type: 'radio',
        checked: currentLang === lang.code,
        click: () => {
          currentLang = lang.code;
          if (mainWindow && mainWindow.webContents) {
            mainWindow.webContents.send('set-language', lang.code);
            mainWindow.loadURL(`http://127.0.0.1:${PORT}/?lang=${lang.code}`);
          }
          updateTrayMenu();
          Menu.setApplicationMenu(buildAppMenu());
        }
      }))
    },
    {
      label: '窗口',
      submenu: [
        { role: 'minimize', label: '最小化' },
        { role: 'close', label: '关闭窗口' }
      ]
    },
    {
      label: '帮助',
      submenu: [
        {
          label: '版本信息 v' + APP_VERSION,
          enabled: false
        },
        { type: 'separator' },
        {
          label: '开机自启动',
          type: 'checkbox',
          checked: app.getLoginItemSettings().openAtLogin,
          click: (menuItem) => {
            app.setLoginItemSettings({ openAtLogin: menuItem.checked });
            dialog.showMessageBox(mainWindow, {
              type: 'info',
              title: '开机自启动',
              message: menuItem.checked ? '已开启开机自启动' : '已关闭开机自启动',
              detail: '下次电脑开机时，' + APP_NAME + ' 将自动启动。'
            });
          }
        },
        {
          label: '检查更新',
          click: () => {
            dialog.showMessageBox(mainWindow, {
              type: 'info',
              title: '检查更新',
              message: '当前版本：v' + APP_VERSION,
              detail: '开发版 · 请访问项目主页获取最新版本。'
            });
          }
        }
      ]
    }
  ]);
}

// ========== 创建主窗口 ==========
function createWindow() {
  const iconPath = getAppIcon();

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 900,
    minWidth: 855,
    minHeight: 600,
    title: APP_NAME + ' v' + APP_VERSION,
    icon: iconPath,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
      devTools: true
    },
    show: false,
    backgroundColor: '#0f0f1a'
  });

  mainWindow.loadURL(`http://127.0.0.1:${PORT}/?lang=${currentLang}`);

  Menu.setApplicationMenu(buildAppMenu());

  ipcMain.handle('change-language', (event, lang) => {
    currentLang = lang;
    if (mainWindow && mainWindow.webContents) {
      mainWindow.webContents.send('set-language', lang);
    }
    updateTrayMenu();
    Menu.setApplicationMenu(buildAppMenu());
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  mainWindow.on('close', (event) => {
    if (!appQuitting) {
      event.preventDefault();
      mainWindow.hide();
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// ========== 系统托盘 ==========
function createTray() {
  const trayIcon = getTrayIcon();
  if (!trayIcon) return;

  tray = new Tray(trayIcon);
  tray.setToolTip(APP_NAME + ' v' + APP_VERSION);
  updateTrayMenu();

  tray.on('double-click', () => {
    if (mainWindow) {
      mainWindow.show();
      mainWindow.focus();
    }
  });
}

function updateTrayMenu() {
  if (!tray) return;

  const langMenu = languages.map(lang => ({
    label: lang.label,
    type: 'radio',
    checked: currentLang === lang.code,
    click: () => {
      if (mainWindow && mainWindow.webContents) {
        mainWindow.webContents.send('set-language', lang.code);
        currentLang = lang.code;
        updateTrayMenu();
      }
    }
  }));

  const contextMenu = Menu.buildFromTemplate([
    {
      label: APP_NAME + ' v' + APP_VERSION,
      enabled: false
    },
    { type: 'separator' },
    {
      label: '显示主窗口',
      click: () => {
        if (mainWindow) {
          mainWindow.show();
          mainWindow.focus();
        }
      }
    },
    { type: 'separator' },
    {
      label: '语言 / Language',
      submenu: langMenu
    },
    { type: 'separator' },
    {
      label: '重启服务器',
      click: restartServer
    },
    { type: 'separator' },
    {
      label: '退出 ' + APP_NAME,
      click: quitApp
    }
  ]);

  tray.setContextMenu(contextMenu);
}

// ========== 重启服务器 ==========
function restartServer() {
  if (serverProcess) {
    serverProcess.kill();
    serverProcess = null;
  }

  if (mainWindow) {
    mainWindow.loadURL(`http://127.0.0.1:${PORT}/clear-token.html`);
  }

  startServer().then(() => {
    const notification = new Notification({
      title: APP_NAME,
      body: '服务器已重启'
    });
    notification.show();
    if (mainWindow) {
      mainWindow.loadURL(`http://127.0.0.1:${PORT}/?lang=${currentLang}`);
    }
  }).catch((err) => {
    dialog.showErrorBox('启动失败', err.message);
  });
}

// ========== 退出应用 ==========
function quitApp() {
  appQuitting = true;
  if (serverProcess) {
    serverProcess.kill();
    serverProcess = null;
  }
  app.quit();
}

// ========== 应用生命周期 ==========

// ========== 协议链接注册（ecompany://） ==========
// 注册为默认协议客户端（Windows registry / macOS Info.plist）
if (process.defaultApp) {
  if (process.argv.length >= 2) {
    app.setAsDefaultProtocolClient('ecompany', process.execPath, [path.resolve(process.argv[1])]);
  }
} else {
  app.setAsDefaultProtocolClient('ecompany');
}
console.log('[Protocol] Registered ecompany:// handler');

// 解析 ecompany:// URL，返回 { path, params }
function parseProtocolUrl(url) {
  try {
    // ecompany://path?key=value
    const u = new URL(url);
    const result = { path: u.pathname.replace(/^\/+/, ''), params: {} };
    u.searchParams.forEach((v, k) => { result.params[k] = v; });
    return result;
  } catch (e) {
    return { path: '', params: {} };
  }
}

app.whenReady().then(async () => {
  try {
    await startServer();
    createWindow();
    createTray();

    // 单实例锁：如果同一机器上已有一个实例运行，新实例的协议 URL 会发到这里
    const gotTheLock = app.requestSingleInstanceLock();
    if (!gotTheLock) {
      console.log('[SingleInstance] Another instance running, quitting...');
      app.quit();
    } else {
      app.on('second-instance', (event, commandLine, workingDirectory) => {
        console.log('[SecondInstance]', commandLine);
        // 查找 ecompany:// URL
        let targetUrl = null;
        for (const arg of commandLine) {
          if (arg.startsWith('ecompany://')) {
            targetUrl = arg;
            break;
          }
        }
        if (mainWindow) {
          if (mainWindow.isMinimized()) mainWindow.restore();
          mainWindow.show();
          mainWindow.focus();
          if (targetUrl) {
            const parsed = parseProtocolUrl(targetUrl);
            console.log('[Protocol] Navigating to:', parsed.path, parsed.params);
            mainWindow.webContents.send('protocol-navigate', parsed.path, parsed.params);
          }
        }
      });
    }

    console.log('[Desktop]', APP_NAME, 'v' + APP_VERSION, '已启动');
  } catch (err) {
    dialog.showErrorBox('启动失败',
      APP_NAME + ' 启动失败：\n' + err.message + '\n\n请检查配置后重试。');
    app.quit();
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    // Windows/Linux: 关闭窗口不退出，保持托盘运行
  }
});

app.on('before-quit', () => {
  quitApp();
});
