// eCompany 屏保 - 5分钟无操作自动弹出
(function(){
  var _ssTimer = null;
  var _ssActive = false;
  var _ssEl = null;
  var _ssInterval = null;

  function ssCreate() {
    if (_ssEl) return;
    _ssEl = document.createElement('div');
    _ssEl.id = '_screenSaver';
    // Set styles individually for maximum compatibility
    _ssEl.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;z-index:2147483647;background:linear-gradient(135deg,#0f0c29,#302b63,#24243e);display:none;flex-direction:column;align-items:center;justify-content:center;font-family:PingFang SC,Microsoft YaHei,sans-serif;color:#fff;overflow:hidden;margin:0;padding:0;border:none;box-sizing:border-box;transform:scale(1)';
    _ssEl.setAttribute('style', _ssEl.style.cssText.replace('transform:scale(1)','transform:scale(1) !important'));

    var canvas = document.createElement('canvas');
    canvas.id = '_ssCanvas';
    canvas.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none';

    var content = document.createElement('div');
    content.style.cssText = 'position:relative;z-index:1;text-align:center';
    content.innerHTML =
      '<div style="font-size:36px;font-weight:700;text-shadow:0 2px 20px rgba(78,205,196,0.3);animation:fadeInUp 1s ease-out" id="_ssGreeting"></div>' +
      '<div style="font-size:48px;font-weight:300;color:#4ecdc4;margin-top:8px;font-variant-numeric:tabular-nums" id="_ssClock"></div>' +
      '<div style="font-size:14px;color:#6b7294;margin-top:4px" id="_ssDate"></div>';

    var statusBar = document.createElement('div');
    statusBar.id = '_ssStatus';
    statusBar.style.cssText = 'position:relative;z-index:1;margin-top:12px;display:flex;gap:16px;align-items:center;justify-content:center;font-size:13px';
    statusBar.innerHTML = '<span id="_ssHeartbeat" style="color:#6b7294">● 检测中...</span><span id="_ssTime"></span>';
    _ssEl.appendChild(statusBar);

    var taskBox = document.createElement('div');
    taskBox.id = '_ssTasks';
    taskBox.style.cssText = 'position:relative;z-index:1;margin-top:20px;max-width:500px;width:100%;max-height:300px;overflow-y:auto';

    var enterBtn = document.createElement('button');
    enterBtn.textContent = '进入系统';
    enterBtn.style.cssText = 'position:absolute;bottom:40px;right:40px;z-index:2;padding:10px 24px;border-radius:8px;border:none;background:#4ecdc4;color:#0f0c29;font-size:14px;font-weight:600;cursor:pointer';
    enterBtn.onclick = ssHide;

    var style = document.createElement('style');
    style.textContent =
      '@keyframes fadeInUp{from{opacity:0;transform:translateY(20px)}to{opacity:1;transform:translateY(0)}}' +
      '#_ssTasks div{padding:4px 12px;margin:2px 0;font-size:12px;background:rgba(255,255,255,0.04);border-radius:4px;border-left:2px solid rgba(78,205,196,0.4);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +
      '@keyframes ssTaskIn{from{opacity:0;transform:translateX(-10px)}to{opacity:1;transform:translateX(0)}}';

    _ssEl.appendChild(canvas);
    _ssEl.appendChild(content);
    _ssEl.appendChild(taskBox);
    _ssEl.appendChild(enterBtn);
    _ssEl.appendChild(style);

    // Insert at root of document (before anything else)
    document.documentElement.insertBefore(_ssEl, document.documentElement.firstChild);

    ssInitParticles();
    ssUpdateTime();
    ssFetchTasks();
    setInterval(ssUpdateTime, 1000);
    _ssInterval = setInterval(ssFetchTasks, 10000);
    ssFetchHeartbeat();
    setInterval(ssFetchHeartbeat, 15000);
  }

  function ssInitParticles() {
    var c = document.getElementById('_ssCanvas');
    if (!c) return;
    var ctx = c.getContext('2d');
    c.width = window.innerWidth;
    c.height = window.innerHeight;
    var pts = [];
    for (var i = 0; i < 60; i++) {
      pts.push({ x: Math.random() * c.width, y: Math.random() * c.height, vx: (Math.random() - 0.5) * 0.8, vy: (Math.random() - 0.5) * 0.8, r: Math.random() * 2.5 + 1 });
    }
    function draw() {
      ctx.clearRect(0, 0, c.width, c.height);
      for (var i = 0; i < pts.length; i++) {
        pts[i].x += pts[i].vx; pts[i].y += pts[i].vy;
        if (pts[i].x < 0 || pts[i].x > c.width) pts[i].vx *= -1;
        if (pts[i].y < 0 || pts[i].y > c.height) pts[i].vy *= -1;
        ctx.beginPath(); ctx.arc(pts[i].x, pts[i].y, pts[i].r, 0, 2 * Math.PI);
        ctx.fillStyle = 'rgba(78,205,196,0.4)'; ctx.fill();
      }
      for (var i = 0; i < pts.length; i++) {
        for (var j = i + 1; j < pts.length; j++) {
          var dx = pts[i].x - pts[j].x, dy = pts[i].y - pts[j].y, dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 150) {
            ctx.beginPath(); ctx.moveTo(pts[i].x, pts[i].y); ctx.lineTo(pts[j].x, pts[j].y);
            ctx.strokeStyle = 'rgba(78,205,196,' + (1 - dist / 150) * 0.2 + ')'; ctx.lineWidth = 0.5; ctx.stroke();
          }
        }
      }
      requestAnimationFrame(draw);
    }
    draw();
    window.addEventListener('resize', function() { c.width = window.innerWidth; c.height = window.innerHeight; });
  }

  function ssUpdateTime() {
    var now = new Date(), h = now.getHours();
    var greet = h < 6 ? '夜深了，老板' : h < 12 ? '早上好，老板' : h < 14 ? '中午好，老板' : h < 18 ? '下午好，老板' : '晚上好，老板';
    var el = document.getElementById('_ssGreeting'); if (el) el.textContent = greet;
    var cl = document.getElementById('_ssClock'); if (cl) cl.textContent = now.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    var dt = document.getElementById('_ssDate'); if (dt) dt.textContent = now.toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' });
  }

  
  function ssFetchHeartbeat() {
    var x = new XMLHttpRequest();
    x.open('GET', '/api/health', true);
    x.onload = function() {
      if (x.status !== 200) return;
      try {
        var d = JSON.parse(x.responseText);
        var ok = d.status === 'healthy' || d.ok === true;
        var el = document.getElementById('_ssHeartbeat');
        if (el) el.innerHTML = ok ? '<span style="color:#22c55e">● 系统正常</span>' : '<span style="color:#ef4444">● 系统异常</span>';
        var timeEl = document.getElementById('_ssTime');
        if (timeEl && d.uptime) {
          var u = Math.floor(d.uptime), str = '';
          if (u > 86400) str = Math.floor(u/86400) + '天';
          else if (u > 3600) str = Math.floor(u/3600) + '小时';
          else str = Math.floor(u/60) + '分钟';
          timeEl.textContent = '已运行 ' + str;
        }
      } catch(e) {}
    };
    x.send();
  }

  function ssFetchTasks() {
    var x = new XMLHttpRequest();
    x.open('GET', '/api/tasks', true);
    x.onload = function() {
      if (x.status !== 200) return;
      try {
        var d = JSON.parse(x.responseText);
        var list = d.tasks || d || [];
        if (typeof list === 'object' && !Array.isArray(list)) list = Object.values(list);
        var el = document.getElementById('_ssTasks'); if (!el) return;
        var doneC=0,failC=0,pendC=0;
        for(var si=0;si<list.length;si++){var st=list[si].status||'';if(st==='done'||st==='completed'||list[si].d===true)doneC++;else if(st==='failed')failC++;else pendC++;}
        var html = '<div style="font-size:11px;color:#6b7294;margin-bottom:6px">⏳ 系统后台动态 &nbsp; ✅'+doneC+' ❌'+failC+' ⏳'+pendC+'</div>';
        var items = list.slice(0, 6);
        for (var i = 0; i < items.length; i++) {
          var t = items[i], txt = t.title || t.name || t.t || '';
          var done = t.status === 'done' || t.d === true || t.status === 'completed';
          var fail = t.status === 'failed';
          html += '<div>' + (done ? '✅' : fail ? '❌' : '⏳') + ' ' + txt + '</div>';
        }
        el.innerHTML = html;
      } catch(e) {}
    };
    x.send();
  }

  function ssShow() {
    ssCreate();
    if (_ssEl) {
      _ssEl.style.display = 'flex';
      document.body.style.overflow = 'hidden';
    }
    _ssActive = true;
    ssFetchTasks();
  }

  function ssHide() {
    if (_ssEl) {
      _ssEl.style.display = 'none';
      document.body.style.overflow = '';
    }
    _ssActive = false;
    ssResetIdle();
  }

  function ssResetIdle() {
    if (_ssTimer) { clearTimeout(_ssTimer); _ssTimer = null; }
    if (!_ssActive) {
      _ssTimer = setTimeout(ssShow, 1800000);
    }
  }

  document.addEventListener('mousemove', ssResetIdle);
  document.addEventListener('keydown', ssResetIdle);
  document.addEventListener('click', ssResetIdle);
  document.addEventListener('scroll', ssResetIdle);
  _ssTimer = setTimeout(ssShow, 300000);
})();
