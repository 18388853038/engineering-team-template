<template>
  <div class="login-page">
    <canvas id="particleCanvas"></canvas>
    <div class="login-content">
      <div class="welcome-section">
        <div class="greeting">{{ greeting }}</div>
        <div class="clock">{{ timeStr }}</div>
        <div class="date">{{ dateStr }}</div>
      </div>
      <div class="login-box" v-if="showLogin">
        <h1>🏢 eCompany</h1>
        <div class="error">{{ error }}</div>
        <input type="password" v-model="token" placeholder="输入访问令牌..." @keyup.enter="login" autofocus>
        <button @click="login">🔑 进入系统</button>
      </div>
      <div class="login-box" v-else>
        <div class="spinner"></div>
        <p>自动登录中...</p>
      </div>
    </div>
  </div>
</template>

<script>
import { API } from '../main.js'
export default {
  data() { return {
    token: '',
    error: '',
    showLogin: false,
    greeting: '',
    timeStr: '',
    dateStr: ''
  }},
  mounted() {
    this.updateTime()
    setInterval(() => this.updateTime(), 1000)
    this.initParticles()
    this.autoLogin()
  },
  methods: {
    updateTime() {
      const now = new Date()
      const h = now.getHours()
      if (h < 6) this.greeting = '夜深了，老板'
      else if (h < 12) this.greeting = '早上好，老板'
      else if (h < 14) this.greeting = '中午好，老板'
      else if (h < 18) this.greeting = '下午好，老板'
      else this.greeting = '晚上好，老板'
      this.timeStr = now.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
      this.dateStr = now.toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' })
    },
    initParticles() {
      const canvas = document.getElementById('particleCanvas')
      if (!canvas) return
      const ctx = canvas.getContext('2d')
      canvas.width = window.innerWidth
      canvas.height = window.innerHeight
      const particles = []
      const count = 60
      for (let i = 0; i < count; i++) {
        particles.push({
          x: Math.random() * canvas.width,
          y: Math.random() * canvas.height,
          vx: (Math.random() - 0.5) * 0.8,
          vy: (Math.random() - 0.5) * 0.8,
          r: Math.random() * 2.5 + 1
        })
      }
      function draw() {
        ctx.clearRect(0, 0, canvas.width, canvas.height)
        for (let p of particles) {
          p.x += p.vx
          p.y += p.vy
          if (p.x < 0 || p.x > canvas.width) p.vx *= -1
          if (p.y < 0 || p.y > canvas.height) p.vy *= -1
          ctx.beginPath()
          ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2)
          ctx.fillStyle = 'rgba(78,205,196,0.4)'
          ctx.fill()
        }
        for (let i = 0; i < particles.length; i++) {
          for (let j = i + 1; j < particles.length; j++) {
            const dx = particles[i].x - particles[j].x
            const dy = particles[i].y - particles[j].y
            const dist = Math.sqrt(dx * dx + dy * dy)
            if (dist < 150) {
              ctx.beginPath()
              ctx.moveTo(particles[i].x, particles[i].y)
              ctx.lineTo(particles[j].x, particles[j].y)
              ctx.strokeStyle = `rgba(78,205,196,${(1 - dist / 150) * 0.2})`
              ctx.lineWidth = 0.5
              ctx.stroke()
            }
          }
        }
        requestAnimationFrame(draw)
      }
      draw()
      window.addEventListener('resize', () => {
        canvas.width = window.innerWidth
        canvas.height = window.innerHeight
      })
    },
    async autoLogin() {
      if (!API.token) { this.showLogin = true; return }
      try {
        const r = await API.get('/api/auth/me')
        if (r.ok) {
          window.__autoLoginSkipped = true; this.$router.push('/dashboard')
          return
        }
      } catch(e) {}
      this.showLogin = true
    },
    async login() {
      if (!this.token) { this.error = '请输入令牌'; return }
      const r = await API.post('/api/auth/login', { password: this.token })
      if (r.ok && r.token) {
        API.setToken(r.token)
        window.__autoLoginSkipped = true; this.$router.push('/dashboard')
      } else {
        this.error = r.error || '令牌无效'
      }
    }
  }
}
</script>

<style scoped>
.login-page {
  min-height: 100vh;
  background: linear-gradient(135deg, #0f0c29, #302b63, #24243e);
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  overflow: hidden;
}
#particleCanvas {
  position: absolute;
  top: 0; left: 0;
  width: 100%; height: 100%;
  z-index: 0;
  pointer-events: none;
}
.login-content {
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 24px;
}
.welcome-section {
  text-align: center;
  animation: fadeInUp 1s ease-out;
}
.greeting {
  font-size: 36px;
  font-weight: 700;
  color: #fff;
  text-shadow: 0 2px 20px rgba(78,205,196,0.3);
}
.clock {
  font-size: 48px;
  font-weight: 300;
  color: #4ecdc4;
  margin-top: 8px;
  font-variant-numeric: tabular-nums;
}
.date {
  font-size: 14px;
  color: #6b7294;
  margin-top: 4px;
}
.login-box {
  background: rgba(255,255,255,0.04);
  border: 1px solid rgba(255,255,255,0.08);
  border-radius: 12px;
  padding: 32px;
  width: 340px;
  text-align: center;
  animation: fadeInUp 1.2s ease-out;
}
.login-box h1 {
  font-size: 22px;
  color: #fff;
  margin-bottom: 8px;
}
.login-box p {
  font-size: 13px;
  color: #6b7294;
  margin-bottom: 16px;
}
.login-box .error {
  color: #ff6b6b;
  font-size: 12px;
  margin-bottom: 8px;
}
.login-box input {
  width: 100%;
  padding: 10px 12px;
  border-radius: 8px;
  border: 1px solid rgba(255,255,255,0.1);
  background: rgba(255,255,255,0.04);
  color: #c0c0c0;
  font-size: 14px;
  outline: none;
  margin-bottom: 12px;
  box-sizing: border-box;
}
.login-box input:focus {
  border-color: #4ecdc4;
}
.login-box button {
  width: 100%;
  padding: 10px;
  border-radius: 8px;
  border: none;
  background: #4ecdc4;
  color: #0f0c29;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
}
.login-box button:hover {
  background: #45b7aa;
}
.spinner {
  width: 32px;
  height: 32px;
  border: 3px solid rgba(78,205,196,0.2);
  border-top-color: #4ecdc4;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
  margin: 0 auto 12px;
}
@keyframes spin {
  to { transform: rotate(360deg); }
}
@keyframes fadeInUp {
  from { opacity: 0; transform: translateY(20px); }
  to { opacity: 1; transform: translateY(0); }
}
</style>
