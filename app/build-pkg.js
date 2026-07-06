const builder = require('electron-builder');
const path = require('path');
const fs = require('fs');
const { spawnSync } = require('child_process');

function robocopySafe(src, dst) {
  if (!fs.existsSync(src)) return;
  const parent = path.dirname(dst);
  if (!fs.existsSync(parent)) fs.mkdirSync(parent, { recursive: true });
  const r = spawnSync('robocopy', [src, dst, '/E', '/XJ', '/NP', '/NDL', '/NFL'], { stdio: 'pipe' });
  // robocopy exit codes 0-7 indicate success
  if (r.status > 7) {
    console.log('  robocopy error', r.status, r.stderr?.toString().slice(0,200));
  }
}

function copyFile(src, dst) {
  if (!fs.existsSync(src)) return;
  const parent = path.dirname(dst);
  if (!fs.existsSync(parent)) fs.mkdirSync(parent, { recursive: true });
  fs.copyFileSync(src, dst);
}

async function build() {
  console.log('[BUILD] Start eCompany Dev v3.0.0...');
  console.time('build');
  const root = path.resolve(__dirname, '..');
  const rel = path.join(root, 'release');

  // 1. Prepare release/
  console.log('  Preparing release...');
  robocopySafe(path.join(root, 'backend'), path.join(rel, 'backend'));
  robocopySafe(path.join(root, 'frontend', 'dist'), path.join(rel, 'frontend', 'dist'));
  robocopySafe(path.join(root, 'AI团队'), path.join(rel, 'AI团队'));
  robocopySafe(path.join(root, 'memory'), path.join(rel, 'memory'));
  copyFile('C:/nvm4w/nodejs/node.exe', path.join(rel, 'node.exe'));
  console.log('  Release prepared');

  // 2. electron-builder
  const iconPath = path.join(root, 'frontend', 'dist', 'logo.png');
  await builder.build({
    projectDir: __dirname,
    config: {
      appId: 'com.ecompany.desktop.dev',
      productName: 'ECompany Dev',
      directories: { output: path.join(root, 'dist-desktop-dev') },
      files: ['main.js', 'preload.js', 'detect-lang.js', 'package.json'],
      extraResources: [],
      win: { target: ['dir', 'nsis'], icon: iconPath },
      nsis: { oneClick: false, allowToChangeInstallationDirectory: true, shortcutName: 'ECompany Dev' },
      buildVersion: '3.0.0'
    }
  });
  console.log('[BUILD] Package done.');

  // 3. Copy resources
  const res = path.join(root, 'dist-desktop-dev', 'win-unpacked', 'resources');
  robocopySafe(path.join(rel, 'backend'), path.join(res, 'backend'));
  robocopySafe(path.join(rel, 'frontend', 'dist'), path.join(res, 'frontend', 'dist'));
  copyFile(path.join(rel, 'node.exe'), path.join(res, 'node.exe'));
  robocopySafe(path.join(rel, 'AI团队'), path.join(res, 'AI团队'));
  robocopySafe(path.join(rel, 'memory'), path.join(res, 'memory'));
  copyFile(iconPath, path.join(res, 'favicon.ico'));
  copyFile(path.join(root, 'frontend', 'dist', 'logo.jpg'), path.join(res, 'logo.jpg'));
  console.log('  Resources copied');

  // 4. Cleanup
  spawnSync('rmdir', ['/s', '/q', rel], { stdio: 'pipe' });
  console.log('[BUILD] Success!');
  console.timeEnd('build');
}
build();
