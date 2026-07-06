/**
 * voice-dialogue.js — 语音对话核心模块 v1.2
 * 
 * STT: whisper CLI (exe) → edge-tts (Python) → Skills Runner
 * TTS: edge-tts (Python) → sherpa-onnx (Python) → Skills Runner
 * 
 * v1.2 修复：
 *   - STT 改用 whisper.exe CLI，避免 Python import 卡死
 *   - TTS 新增 edge-tts（微软TTS，国内网络友好，已验证可用）
 *   - 降级链路完整
 */

const fs = require('fs');
const path = require('path');
const { execSync, execFileSync } = require('child_process');
const crypto = require('crypto');

const BASE = path.resolve(__dirname, '..');
const MODELS_DIR = path.join(BASE, 'models');
const VOICE_DIR = path.join(BASE, 'output', 'voice');
const TEMP_DIR = path.join(BASE, 'temp', 'voice');

// ========== 日志 ==========
function log(tag, msg) {
  const ts = new Date().toISOString();
  console.log(`[VoiceDialogue][${ts}] [${tag}] ${msg}`);
  try {
    const logDir = path.join(BASE, 'logs');
    if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });
    fs.appendFileSync(path.join(logDir, 'voice-dialogue.log'),
      `[${ts}] [${tag}] ${msg}\n`, 'utf-8');
  } catch (e) { }
}

// ========== 工具 ==========
function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function timestampFilename(prefix, ext) {
  return prefix + '_' + Date.now() + '_' + crypto.randomBytes(4).toString('hex') + '.' + ext;
}

function findExecutable(name) {
  try {
    const r = execFileSync('where', [name], { encoding: 'utf-8', timeout: 5000 }).trim().split('\n')[0];
    if (r && fs.existsSync(r)) return r;
  } catch (e) { }
  // 搜索 Python Scripts 目录
  const pyScripts = path.join(process.env.LOCALAPPDATA || 'C:\\Users\\Administrator\\AppData\\Local', 'Programs', 'Python');
  const candidates = [
    path.join('C:\\Program Files\\Python311', 'Scripts', name),
    path.join(pyScripts, 'Python311', 'Scripts', name),
    path.join(pyScripts, 'Python312', 'Scripts', name),
    path.join(process.env.USERPROFILE || 'C:\\Users\\Administrator', '.local', 'bin', name),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return name; // fallback: 让系统PATH去找
}

function getWhisperModelPath() {
  const local = path.join(MODELS_DIR, 'whisper', 'tiny.pt');
  if (fs.existsSync(local)) return local;
  const cache = path.join(require('os').homedir(), '.cache', 'whisper', 'tiny.pt');
  if (fs.existsSync(cache)) return cache;
  return null;
}

function getSherpaModelPath() {
  const modelDir = path.join(MODELS_DIR, 'sherpa');
  if (fs.existsSync(modelDir)) {
    const files = fs.readdirSync(modelDir).filter(f => f.endsWith('.onnx'));
    for (const f of files) {
      const fp = path.join(modelDir, f);
      if (fs.statSync(fp).size > 1000000) return fp;
    }
  }
  return null;
}

// ========== 1. STT：语音→文字（whisper CLI）==========
async function speechToText(audioBuffer) {
  const tmpDir = ensureDir(TEMP_DIR);
  const tmpFile = path.join(tmpDir, timestampFilename('stt_input', 'wav'));

  try {
    fs.writeFileSync(tmpFile, audioBuffer);
    log('STT', `音频 ${audioBuffer.length} bytes -> ${tmpFile}`);

    let result = null;

    // === 方法1: whisper CLI（最优路径，已验证 whisper.exe 可用）===
    const whisperExe = findExecutable('whisper.exe');
    const modelPath = getWhisperModelPath();
    if (whisperExe && modelPath) {
      try {
        const modelDir = path.dirname(modelPath);
        const out = execFileSync(whisperExe, [
          tmpFile,
          '--model', 'tiny',
          '--model_dir', modelDir,
          '--language', 'zh',
          '--task', 'transcribe',
          '--output_format', 'txt',
          '--output_dir', tmpDir,
        ], { encoding: 'utf-8', timeout: 120000, maxBuffer: 10 * 1024 * 1024 });

        // whisper 输出txt文件
        const txtFile = tmpFile.replace(/\.\w+$/, '.txt');
        if (fs.existsSync(txtFile)) {
          result = fs.readFileSync(txtFile, 'utf-8').trim();
          log('STT', `Whisper CLI 成功: "${(result || '').substring(0, 50)}..."`);
        }
      } catch (e) {
        log('STT', `Whisper CLI 异常: ${(e.message || '').substring(0, 80)}`);
      }
    } else {
      log('STT', `whisper CLI 不可用: exe=${!!whisperExe} model=${!!modelPath}`);
    }

    // === 方法2: Python whisper（备用）===
    if (!result) {
      try {
        const modelPath2 = getWhisperModelPath();
        if (modelPath2) {
          const pyFile = path.join(tmpDir, timestampFilename('stt_py', 'py'));
          const modelDir2 = path.dirname(modelPath2);
          const pyScript = `
import sys, os, json
os.environ['XDG_CACHE_HOME'] = r"${modelDir2.replace(/\\/g, '\\\\')}"
sys.stdout = open(sys.__stdout__.fileno(), 'w', encoding='utf-8', buffering=1)
try:
    import whisper
    model = whisper.load_model('tiny', download_root=r"${modelDir2.replace(/\\/g, '\\\\')}")
    r = model.transcribe(r"${tmpFile.replace(/\\/g, '\\\\')}", language='zh')
    if r and r.get('text'):
        print(json.dumps({'ok': True, 'text': r['text'].strip()}, ensure_ascii=False))
    else:
        print(json.dumps({'ok': False}))
except Exception as e:
    print(json.dumps({'ok': False, 'error': str(e)[:200]}))
`;
          fs.writeFileSync(pyFile, pyScript, 'utf-8');
          const out = execFileSync('python', [pyFile], { encoding: 'utf-8', timeout: 120000, maxBuffer: 10 * 1024 * 1024 }).trim();
          try { fs.unlinkSync(pyFile); } catch (e) { }
          const lines = out.split('\n').filter(l => l.startsWith('{'));
          if (lines.length > 0) {
            const data = JSON.parse(lines[lines.length - 1]);
            if (data.ok) result = data.text;
          }
        }
      } catch (e) { log('STT', `Python whisper 备用失败: ${(e.message || '').substring(0, 60)}`); }
    }

    // === 方法3: Skills Runner ===
    if (!result) {
      try {
        const sr = require('./skills-runner');
        const sc = new sr.SkillScanner();
        sc.scanAll();
        const ex = new sr.SkillExecutor(sc);
        const r = await ex.execute('openai-whisper-api', { audio: tmpFile, language: 'zh' });
        if (r && r.text) result = r.text;
      } catch (e) { log('STT', 'Skill 失败'); }
    }

    return result || '[语音识别暂不可用]';
  } catch (e) {
    log('STT', `错误: ${e.message}`);
    return '[语音识别失败]';
  } finally {
    try {
      if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile);
      const base = tmpFile.replace(/\.\w+$/, '');
      ['.txt', '.srt', '.vtt', '.json', '.tsv', '.py'].forEach(e => {
        const f = base + e;
        if (fs.existsSync(f)) try { fs.unlinkSync(f); } catch (e) { }
      });
    } catch (e) { }
  }
}

// ========== 2. AI 对话 ==========
async function dialogue(text, userId, options) {
  const sysPrompt = (options && options.systemPrompt) ||
    '你是 eCompany 的 AI 语音助手。请用自然、口语化的方式回答。' +
    '回答控制在200字以内，适合语音播报。';

  try {
    const exe = require('./agent-executor');
    const reply = await exe.callAI([
      { role: 'system', content: sysPrompt },
      { role: 'user', content: text }
    ]);
    if (reply) return String(reply).trim();
  } catch (e) {
    log('Dialogue', `callAI 失败: ${(e.message || '').substring(0, 60)}`);
  }

  try {
    const aiProv = require('./agent-executor').getAIProvider();
    const body = JSON.stringify({
      model: aiProv.model || 'deepseek-chat',
      messages: [
        { role: 'system', content: sysPrompt },
        { role: 'user', content: text }
      ],
      temperature: 0.7,
      max_tokens: 500,
      stream: false,
    });
    const resp = await fetch(aiProv.apiBase, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${aiProv.apiKey}` },
      body: body,
      signal: AbortSignal.timeout(30000),
    });
    const data = await resp.json();
    if (data && data.choices && data.choices[0] && data.choices[0].message) {
      return data.choices[0].message.content || '';
    }
  } catch (e) {
    log('Dialogue', `直接调用失败: ${(e.message || '').substring(0, 60)}`);
  }

  return '抱歉，AI对话服务暂时不可用。';
}

// ========== 3. TTS：文字→语音（edge-tts 优先，sherpa-onnx 备用）==========
async function textToSpeech(text, userId) {
  const userDir = ensureDir(path.join(VOICE_DIR, userId || 'default'));
  const outputFile = path.join(userDir, timestampFilename('tts_output', 'wav'));

  try {
    let audioBuffer = null;

    // === 方法1: edge-tts（已验证国内网络可用）===
    try {
      const textSafe = text.replace(/"/g, '\\"').substring(0, 300);
      const pyScript = `
import asyncio, sys, os
sys.stdout.reconfigure(encoding='utf-8')
async def run():
    try:
        import edge_tts
        communicate = edge_tts.Communicate("""${textSafe}""", voice='zh-CN-XiaoxiaoNeural')
        await communicate.save(r"${outputFile.replace(/\\/g, '\\\\')}")
        size = os.path.getsize(r"${outputFile.replace(/\\/g, '\\\\')}")
        if size > 100:
            print(f"OK:{size}")
        else:
            print("TOO_SMALL")
    except Exception as e:
        print(f"ERR:{str(e)[:100]}")
asyncio.run(run())
`;
      const pyFile = path.join(TEMP_DIR, timestampFilename('tts_edge', 'py'));
      fs.writeFileSync(pyFile, pyScript, 'utf-8');
      const out = execFileSync('python', [pyFile], { encoding: 'utf-8', timeout: 60000 }).trim();
      try { fs.unlinkSync(pyFile); } catch (e) { }
      if (out.startsWith('OK:') && fs.existsSync(outputFile) && fs.statSync(outputFile).size > 100) {
        audioBuffer = fs.readFileSync(outputFile);
        log('TTS', `edge-tts 成功: ${audioBuffer.length} bytes`);
      } else {
        log('TTS', `edge-tts 结果: ${out}`);
      }
    } catch (e) {
      log('TTS', `edge-tts 异常: ${(e.message || '').substring(0, 60)}`);
    }

    // === 方法2: sherpa-onnx Python（本地模型）===
    if (!audioBuffer) {
      const sherpaModel = getSherpaModelPath();
      if (sherpaModel) {
        try {
          const textSafe = text.replace(/["\\]/g, '\\$&').substring(0, 200);
          const pyScript2 = `
import sys, json, os
sys.stdout.reconfigure(encoding='utf-8')
try:
    import sherpa_onnx
    import wave, array
    tts_config = sherpa_onnx.OfflineTtsConfig(
        model=sherpa_onnx.OfflineTtsModelConfig(
            vits=sherpa_onnx.OfflineTtsVitsModelConfig(
                model=r"${sherpaModel.replace(/\\/g, '\\\\')}",
                tokens=r"${path.join(path.dirname(sherpaModel), 'tokens.txt').replace(/\\/g, '\\\\')}",
            ), num_threads=2, provider="cpu",
        ),
    )
    tts = sherpa_onnx.OfflineTts(tts_config)
    audio = tts.generate("${textSafe}", sid=0, speed=1.0)
    if audio and audio.samples and len(audio.samples) > 0:
        with wave.open(r"${outputFile.replace(/\\/g, '\\\\\\\\')}", "wb") as wf:
            wf.setnchannels(1); wf.setsampwidth(2); wf.setframerate(24000)
            wf.writeframes(array.array("h", audio.samples).tobytes())
        print("OK")
    else:
        print("NO_AUDIO")
except Exception as e:
    print(f"ERR:{str(e)[:100]}")
`;
          const pyFile2 = path.join(TEMP_DIR, timestampFilename('tts_sherpa', 'py'));
          fs.writeFileSync(pyFile2, pyScript2, 'utf-8');
          const out2 = execFileSync('python', [pyFile2], { encoding: 'utf-8', timeout: 30000 }).trim();
          try { fs.unlinkSync(pyFile2); } catch (e) { }
          if (out2 === 'OK' && fs.existsSync(outputFile) && fs.statSync(outputFile).size > 100) {
            audioBuffer = fs.readFileSync(outputFile);
            log('TTS', `sherpa-onnx 成功: ${audioBuffer.length} bytes`);
          }
        } catch (e) { log('TTS', `sherpa-onnx 异常: ${(e.message || '').substring(0, 60)}`); }
      }
    }

    // === 方法3: Skills Runner ===
    if (!audioBuffer) {
      try {
        const sr = require('./skills-runner');
        const sc = new sr.SkillScanner();
        sc.scanAll();
        const ex = new sr.SkillExecutor(sc);
        const r = await ex.execute('sherpa-onnx-tts', { text: text.substring(0, 300), output: outputFile, voice: 'zh-CN' });
        if (r && r.audio) audioBuffer = Buffer.from(r.audio, 'base64');
        else if (fs.existsSync(outputFile) && fs.statSync(outputFile).size > 100) audioBuffer = fs.readFileSync(outputFile);
      } catch (e) { log('TTS', 'Skill 失败'); }
    }

    return audioBuffer;
  } catch (e) {
    log('TTS', `错误: ${e.message}`);
    return null;
  }
}

// ========== 4. 主入口：语音消息 ==========
async function processVoiceMessage(audioBuffer, userId, options) {
  const startTime = Date.now();
  if (!audioBuffer || audioBuffer.length < 100) {
    return { success: false, error: '音频数据无效', text: '', reply: '', audioBuffer: null, duration: 0 };
  }
  try {
    const text = await speechToText(audioBuffer);
    if (!text || text.startsWith('[语音识别')) {
      return { success: false, error: text, text, reply: '语音识别不可用', audioBuffer: null, duration: Date.now() - startTime };
    }
    const reply = await dialogue(text, userId, options);
    const replyAudio = await textToSpeech(reply, userId);
    return { success: true, text, reply, audioBuffer: replyAudio, duration: Date.now() - startTime };
  } catch (e) {
    return { success: false, error: e.message, text: '', reply: '处理异常', audioBuffer: null, duration: Date.now() - startTime };
  }
}

// ========== 5. 文字→语音 ==========
async function processTextMessage(text, userId, options) {
  const startTime = Date.now();
  try {
    const reply = await dialogue(text, userId, options);
    const replyAudio = await textToSpeech(reply, userId);
    return { success: true, reply, audioBuffer: replyAudio, duration: Date.now() - startTime };
  } catch (e) {
    return { success: false, error: e.message, reply: '', audioBuffer: null, duration: Date.now() - startTime };
  }
}

// ========== 6. 自检 ==========
async function testVoiceDialogue() {
  log('Test', '开始自检...');
  const results = { stt: 'unknown', tts: 'unknown', ai: 'unknown', models: {}, note: '' };

  const whisperModel = getWhisperModelPath();
  results.models.whisper = whisperModel ? `存在(${(fs.statSync(whisperModel).size / 1024 / 1024).toFixed(1)}MB)` : '未找到';

  const sherpaModel = getSherpaModelPath();
  results.models.sherpa = sherpaModel ? `存在(${(fs.statSync(sherpaModel).size / 1024 / 1024).toFixed(1)}MB)` : '未找到(可使用edge-tts替代)';

  // STT: 查 whisper CLI
  try {
    const w = execFileSync('where', ['whisper.exe'], { encoding: 'utf-8', timeout: 5000 }).trim();
    results.stt = `whisper CLI 可用 (${w})`;
    results.models.whisperCli = true;
  } catch (e) {
    results.stt = 'whisper CLI 未找到';
    results.models.whisperCli = false;
  }

  // TTS: 查 edge-tts
  try {
    const r = execFileSync('python', ['-c', 'import edge_tts; print("edge-tts", edge_tts.__version__)'], { encoding: 'utf-8', timeout: 10000 }).trim();
    results.tts = r;
  } catch (e) {
    results.tts = 'edge-tts 未安装';
  }

  // AI
  try {
    const exe = require('./agent-executor');
    results.ai = typeof exe.callAI === 'function' ? '可用(callAI)' : '接口异常';
  } catch (e) { results.ai = '加载失败'; }

  results.note = 'STT走whisper CLI, TTS走edge-tts(微软在线)';
  log('Test', `自检: ${JSON.stringify(results)}`);
  return results;
}

// ========== 7. WebSocket 处理 ==========
async function handleVoiceWS(ws, data) {
  if (!data || !data.audio) {
    if (ws.readyState === 1) ws.send(JSON.stringify({ type: 'voice_error', error: '缺少音频' }));
    return;
  }
  try {
    const audioBuffer = Buffer.from(data.audio, 'base64');
    const result = await processVoiceMessage(audioBuffer, data.userId || 'anonymous');
    if (ws.readyState === 1) ws.send(JSON.stringify({
      type: 'voice_result',
      text: result.text,
      reply: result.reply,
      audio: result.audioBuffer ? result.audioBuffer.toString('base64') : null,
      success: result.success,
      duration: result.duration
    }));
  } catch (e) {
    if (ws.readyState === 1) ws.send(JSON.stringify({ type: 'voice_error', error: e.message }));
  }
}

module.exports = {
  processVoiceMessage, processTextMessage,
  speechToText, textToSpeech, dialogue,
  testVoiceDialogue, handleVoiceWS
};
