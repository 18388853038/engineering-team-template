/**
 * docker-essentials — Docker 沙箱执行器
 * 
 * 使用 Docker CLI 执行容器管理、镜像操作和沙箱运行。
 * 
 * 支持操作:
 *   run   - 运行容器 (image, cmd, name, env, ports, volume)
 *   exec  - 在容器中执行命令 (containerId, cmd)
 *   ps    - 列出容器 (all: true 显示全部)
 *   images - 列出镜像
 *   pull  - 拉取镜像 (image)
 *   rm    - 删除容器 (containerId, force)
 *   rmi   - 删除镜像 (image)
 *   logs  - 查看容器日志 (containerId, lines)
 *   sandbox - 运行临时沙箱 (image, cmd) - 自动清理
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

module.exports = async function handler(args) {
  var action = args.action || args.command || args.query || 'ps';
  var result = { success: true, action: action };

  try {
    // 先检查 Docker 是否可用
    try {
      execSync('docker --version', { encoding: 'utf8', timeout: 5000 });
    } catch(e) {
      return { success: false, action: action, error: 'Docker 不可用: ' + e.message };
    }

    switch (action) {
      case 'run': {
        // docker run [options] image [cmd]
        var image = args.image || args.name || 'alpine:latest';
        var cmd = args.cmd || args.command_text || 'echo hello';
        var containerName = args.containerName || args.name_container || '';
        var envVars = args.env || '';
        var ports = args.ports || '';
        var volumes = args.volume || '';

        var dockerArgs = '--rm';
        if (containerName) dockerArgs += ' --name ' + containerName;
        if (envVars) dockerArgs += ' -e ' + envVars;
        if (ports) dockerArgs += ' -p ' + ports;
        if (volumes) dockerArgs += ' -v ' + volumes;

        var fullCmd = 'docker run ' + dockerArgs + ' ' + image + ' ' + cmd;
        var output = execSync(fullCmd, { encoding: 'utf8', timeout: 60000, maxBuffer: 10 * 1024 * 1024 });
        result.output = output.trim();
        result.message = '容器已运行';
        break;
      }

      case 'sandbox': {
        // 临时沙箱：运行后自动清理
        var image = args.image || 'alpine:latest';
        var cmd = args.cmd || args.command_text || 'cat /etc/os-release';
        var timeout = parseInt(args.timeout) || 30000;

        var output = execSync('docker run --rm ' + image + ' ' + cmd, { encoding: 'utf8', timeout: timeout, maxBuffer: 10 * 1024 * 1024 });
        result.output = output.trim();
        result.message = '沙箱执行完成，容器已自动清理';
        break;
      }

      case 'exec': {
        var containerId = args.containerId || args.id || '';
        var cmd = args.cmd || args.command_text || 'ls';
        if (!containerId) { result.success = false; result.error = '缺少 containerId'; break; }

        var output = execSync('docker exec ' + containerId + ' ' + cmd, { encoding: 'utf8', timeout: 30000 });
        result.output = output.trim();
        break;
      }

      case 'ps': {
        var all = args.all !== false;
        var output = execSync('docker ps' + (all ? ' -a' : '') + ' --format "table {{.ID}}\t{{.Image}}\t{{.Status}}\t{{.Names}}"', { encoding: 'utf8', timeout: 10000 });
        result.containers = output.trim().split('\n').filter(Boolean);
        result.message = '共 ' + (result.containers.length - 1) + ' 个容器';
        break;
      }

      case 'images': {
        var output = execSync('docker images --format "table {{.Repository}}\t{{.Tag}}\t{{.ID}}\t{{.Size}}"', { encoding: 'utf8', timeout: 10000 });
        result.images = output.trim().split('\n').filter(Boolean);
        result.message = '共 ' + (result.images.length - 1) + ' 个镜像';
        break;
      }

      case 'pull': {
        var image = args.image || args.name || '';
        if (!image) { result.success = false; result.error = '缺少 image'; break; }
        var output = execSync('docker pull ' + image, { encoding: 'utf8', timeout: 120000 });
        result.output = output.trim();
        result.message = '已拉取: ' + image;
        break;
      }

      case 'rm': {
        var containerId = args.containerId || args.id || '';
        var force = args.force !== false;
        if (!containerId) { result.success = false; result.error = '缺少 containerId'; break; }
        execSync('docker rm ' + (force ? '-f ' : '') + containerId, { encoding: 'utf8', timeout: 15000 });
        result.message = '已删除容器: ' + containerId;
        break;
      }

      case 'rmi': {
        var image = args.image || args.name || '';
        if (!image) { result.success = false; result.error = '缺少 image'; break; }
        execSync('docker rmi -f ' + image, { encoding: 'utf8', timeout: 30000 });
        result.message = '已删除镜像: ' + image;
        break;
      }

      case 'logs': {
        var containerId = args.containerId || args.id || '';
        var lines = parseInt(args.lines) || 50;
        if (!containerId) { result.success = false; result.error = '缺少 containerId'; break; }
        var output = execSync('docker logs --tail ' + lines + ' ' + containerId, { encoding: 'utf8', timeout: 10000 });
        result.logs = output;
        break;
      }

      default:
        result.success = false;
        result.error = '未知操作: ' + action + '。支持: run/sandbox/exec/ps/images/pull/rm/rmi/logs';
    }
  } catch(e) {
    result.success = false;
    result.error = e.message;
  }

  return result;
};
