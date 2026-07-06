const installer = require('./skill-installer');
const http = require('http');

function routeSkillInstaller(req, res) {
  const url = req.url.replace(/^\/api\/skills/, '');
  let body = '';
  req.on('data', c => body += c);
  req.on('end', () => {
    try {
      let result;
      if (url === '/list' || url === '/') {
        result = installer.listInstalled();
      } else if (url === '/known') {
        result = { ok: true, list: Object.keys(installer.KNOWN_SKILLS) };
      } else if (url.startsWith('/install-known/')) {
        const name = decodeURIComponent(url.slice('/install-known/'.length));
        result = installer.installKnown(name);
      } else if (url.startsWith('/uninstall/')) {
        const name = decodeURIComponent(url.slice('/uninstall/'.length));
        result = installer.uninstall(name);
      } else {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end('{"error":"not found"}');
        return;
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(result));
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: e.message }));
    }
  });
}

module.exports = { routeSkillInstaller };
// 已在 server-modern.js 中注册:
// registerRoute(['GET'], /^\/api\/skills\/list/, require('./modules/skill-api').routeSkillInstaller);
// registerRoute(['GET'], /^\/api\/skills\/known/, require('./modules/skill-api').routeSkillInstaller);
// registerRoute(['GET'], /^\/api\/skills\/install-known\//, require('./modules/skill-api').routeSkillInstaller);
// registerRoute(['GET'], /^\/api\/skills\/uninstall\//, require('./modules/skill-api').routeSkillInstaller);
