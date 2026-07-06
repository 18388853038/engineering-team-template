/**
 * voice-pipeline.js — eCompany 统一语音输入管道
 * 
 * 集中处理所有渠道的语音输入：
 *   微信语音 → 转录 → 文字 → CEO
 *   Web上传 → 转录 → 文字 → CEO
 *   语音文件 → 转录 → 文字 → CEO
 * 
 * 支持：
 *   - Whisper CLI (本地, tiny模型 75MB)
 *   - OpenAI Whisper API (需 OPENAI_API_KEY)
 *   - 音频格式自动转码 (amr/silk → wav)
 */

const fs = require('fs');
const path = require('path');
const { execSync, spawn } = require('child_process');
const http = require('http');

const BASE = path.join(__dirname, '..');

// ========== 配置 ==========
var CONFIG = {
  tempDir: path.join(BASE, 'temp'),
  whisperModel: 'tiny',
  defaultLanguage: 'zh'
};

try { if (!fs.existsSync(CONFIG.tempDir)) fs.mkdirSync(CONFIG.tempDir, { recursive: true }); } catch(e) {}

// ========== 音频格式检测与转码 ==========

// 判断是否需要转码 (Whisper 支持 mp3, wav, m4a, ogg, flac)
function needsConvert(filePath) {
  var supported = ['.mp3', '.wav', '.m4a', '.ogg', '.flac', '.mp4', '.aac'];
  var ext = path.extname(filePath).toLowerCase();
  return supported.indexOf(ext) === -1;
}

// ffmpeg 候选路径
var FFMPEG_CANDIDATES = [
  'ffmpeg',
  'C:\\Program Files\\Python311\\Scripts\\ffmpeg.exe',
  'C:\\Users\\Administrator\\AppData\\Local\\Programs\\Python\\Python312\\Scripts\\ffmpeg.exe',
  'C:\\Program Files\\ffmpeg\\bin\\ffmpeg.exe',
  'C:\\ffmpeg\\bin\\ffmpeg.exe'
];

function findFfmpeg() {
  for (var i = 0; i < FFMPEG_CANDIDATES.length; i++) {
    try {
      execSync('"' + FFMPEG_CANDIDATES[i] + '" -version', { encoding: 'utf8', timeout: 3000, stdio: 'pipe' });
      return FFMPEG_CANDIDATES[i];
    } catch(e) {}
  }
  // 尝试系统 PATH
  try {
    execSync('ffmpeg -version', { encoding: 'utf8', timeout: 3000, stdio: 'pipe' });
    return 'ffmpeg';
  } catch(e) {}
  return null;
}

var _ffmpegPath = null;
function getFfmpegPath() {
  if (_ffmpegPath === null) _ffmpegPath = findFfmpeg();
  return _ffmpegPath;
}

// 转码音频到 wav
function convertToWav(inputPath, outputPath) {
  var ffmpeg = getFfmpegPath();
  if (ffmpeg) {
    try {
      execSync('"' + ffmpeg + '" -i "' + inputPath + '" -ar 16000 -ac 1 -c:a pcm_s16le "' + outputPath + '" -y', {
        encoding: 'utf8', timeout: 30000, stdio: 'pipe'
      });
      return outputPath;
    } catch(e) {}
  }
  // 尝试用 Python pydub 转码
  try {
    var wavOut = inputPath.replace(/\.[^.]+$/, '') + '.wav';
    var pyCode = 'import sys;s=sys.argv[1];o=s.rsplit(".",1)[0]+".wav"';
    pyCode += ';from pydub import AudioSegment';
    pyCode += ';AudioSegment.from_file(s).export(o,format="wav",parameters=["-ar","16000","-ac","1"])';
    pyCode += ';print(o)';
    execSync('python -c "' + pyCode + '" "' + inputPath + '"', { encoding: 'utf8', timeout: 30000 });
    if (fs.existsSync(wavOut)) return wavOut;
  } catch(e) {}
  // 尝试用 Python wave+librosa 转码
  try {
    var pyCode2 = 'import sys;s=sys.argv[1];o=s.rsplit(".",1)[0]+".wav"';
    pyCode2 += ';import librosa;y,sr=librosa.load(s,sr=16000,mono=True)';
    pyCode2 += ';import soundfile as sf;sf.write(o,y,16000);print(o)';
    execSync('python -c "' + pyCode2 + '" "' + inputPath + '"', { encoding: 'utf8', timeout: 60000 });
    var wavOut2 = inputPath.replace(/\.[^.]+$/, '') + '.wav';
    if (fs.existsSync(wavOut2)) return wavOut2;
  } catch(e) {}
  return null;
}

// ========== 转写引擎 ==========

// Engine 1: 本地 Whisper CLI
async function transcribeLocal(audioPath, opts) {
  var model = opts.model || CONFIG.whisperModel;
  var language = opts.language || CONFIG.defaultLanguage;

  try {
    // 先测试 whisper 是否可用
    execSync('python -m whisper --help', { encoding: 'utf8', timeout: 5000, stdio: 'pipe' });
  } catch(e) {
    return { ok: false, error: 'whisper 未安装: pip install openai-whisper' };
  }

  try {
    var cmd = 'python -m whisper "' + audioPath + '" --model ' + model + ' --language ' + language + ' --output_format txt --output_dir "' + CONFIG.tempDir + '"';
    var output = execSync(cmd, { encoding: 'utf8', timeout: 120000, maxBuffer: 10 * 1024 * 1024 });
    // whisper 输出文件：xxx.txt（与原音频同名）
    var baseName = path.basename(audioPath, path.extname(audioPath));
    var txtPath = path.join(CONFIG.tempDir, baseName + '.txt');
    if (fs.existsSync(txtPath)) {
      var text = fs.readFileSync(txtPath, 'utf-8').trim();
      try { fs.unlinkSync(txtPath); } catch(e) {}
      if (text) return { ok: true, text: text, engine: 'whisper_local', model: model };
    }
    // 从 stdout 提取
    var match = output.match(/\[.*?\]\s*(.+?)[\r\n]/);
    if (match && match[1].trim()) return { ok: true, text: match[1].trim(), engine: 'whisper_local', model: model };
    return { ok: false, error: 'whisper 输出为空' };
  } catch(e) {
    return { ok: false, error: 'whisper 失败: ' + e.message };
  }
}

// Engine 2: OpenAI Whisper API
async function transcribeAPI(audioPath, opts) {
  var apiKey = process.env.OPENAI_API_KEY || opts.apiKey || '';
  if (!apiKey) return { ok: false, error: '需要 OPENAI_API_KEY' };

  try {
    var fsMod = require('fs');
    var fileBuf = fsMod.readFileSync(audioPath);
    var boundary = '----FormBoundary' + Date.now();
    var bodyParts = [];
    bodyParts.push('--' + boundary);
    bodyParts.push('Content-Disposition: form-data; name="file"; filename="audio.' + path.extname(audioPath).slice(1) + '"');
    bodyParts.push('Content-Type: audio/' + path.extname(audioPath).slice(1));
    bodyParts.push('');
    bodyParts.push(fileBuf.toString('base64'));
    bodyParts.push('--' + boundary);
    bodyParts.push('Content-Disposition: form-data; name="model"');
    bodyParts.push('');
    bodyParts.push('whisper-1');
    bodyParts.push('--' + boundary);
    bodyParts.push('Content-Disposition: form-data; name="language"');
    bodyParts.push('');
    bodyParts.push(opts.language || 'zh');
    bodyParts.push('--' + boundary + '--');

    // 使用 fetch 发送
    var resp = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + apiKey,
        'Content-Type': 'multipart/form-data; boundary=' + boundary
      },
      body: bodyParts.join('\r\n'),
      signal: AbortSignal.timeout(60000)
    });
    var data = await resp.json();
    if (data.text) return { ok: true, text: data.text, engine: 'whisper_api' };
    return { ok: false, error: data.error ? data.error.message || JSON.stringify(data.error) : 'unknown' };
  } catch(e) {
    try { fs.unlinkSync(audioPath); } catch(ex) {}
    return { ok: false, error: 'API 请求异常: ' + e.message };
  }
}

// ========== 主转录函数 ==========
async function transcribe(audioInput, opts) {
  opts = opts || {};
  var audioPath = '';

  // 支持多种输入格式
  if (typeof audioInput === 'string') {
    if (audioInput.startsWith('http://') || audioInput.startsWith('https://')) {
      // URL → 下载
      audioPath = path.join(CONFIG.tempDir, 'voice_dl_' + Date.now() + '.tmp');
      try {
        var r = await fetch(audioInput, { signal: AbortSignal.timeout(30000) });
        if (!r.ok) return { ok: false, error: '下载失败: HTTP ' + r.status };
        var buffer = Buffer.from(await r.arrayBuffer());
        fs.writeFileSync(audioPath, buffer);
      } catch(e) {
        return { ok: false, error: '下载失败: ' + e.message };
      }
    } else if (audioInput.length > 200 && /^[A-Za-z0-9+/=]+$/.test(audioInput)) {
      // Base64 → 文件
      audioPath = path.join(CONFIG.tempDir, 'voice_b64_' + Date.now() + '.wav');
      fs.writeFileSync(audioPath, Buffer.from(audioInput, 'base64'));
    } else if (fs.existsSync(audioInput)) {
      // 文件路径
      audioPath = audioInput;
    } else {
      return { ok: false, error: '无法识别的输入格式' };
    }
  } else if (Buffer.isBuffer(audioInput)) {
    audioPath = path.join(CONFIG.tempDir, 'voice_buf_' + Date.now() + '.wav');
    fs.writeFileSync(audioPath, audioInput);
  } else {
    return { ok: false, error: '不支持的输入类型' };
  }

  // 文件存在性检查
  if (!fs.existsSync(audioPath)) {
    return { ok: false, error: '音频文件不存在' };
  }

  // 格式转码（如果需要）
  if (needsConvert(audioPath)) {
    var wavPath = audioPath.replace(/\.[^.]+$/, '') + '.wav';
    if (fs.existsSync(wavPath)) {
      audioPath = wavPath;
    } else if (getFfmpegPath()) {
      var converted = convertToWav(audioPath, wavPath);
      if (!converted) {
        return { ok: false, error: '音频格式不支持，且无法转码（需要 ffmpeg）' };
      }
      audioPath = converted;
    } else {
      // 尝试用 whisper 直接处理（whisper 支持部分格式）
    }
  }

  // 执行转写
  var result;
  if (process.env.OPENAI_API_KEY) {
    result = await transcribeAPI(audioPath, opts);
    if (result.ok) return result;
  }
  result = await transcribeLocal(audioPath, opts);
  return result;
}

// ========== 导出 ==========
module.exports = {
  transcribe: transcribe,
  transcribeLocal: transcribeLocal,
  transcribeAPI: transcribeAPI,
  convertToWav: convertToWav,
  needsConvert: needsConvert
};
