/**
 * openai-whisper-api — 语音转文字处理器
 * 
 * 使用本地 Whisper CLI 将音频文件转为文字。
 * 模型: tiny (75MB, 已缓存)
 * 
 * 调用方式:
 *   handler({ audio: '/path/to/audio.amr', language: 'zh' })
 * 
 * 返回:
 *   { text: '识别出的文字', duration: 3.5, segments: [...] }
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

async function handler(args) {
  var audioPath = args.audio || args.file || args.path || '';
  var language = args.language || 'zh';
  var model = args.model || 'tiny';  // tiny 75MB, base 150MB

  if (!audioPath) {
    // 支持 text 参数传 base64 音频数据
    if (args.text && args.text.length > 100) {
      var tmpFile = path.join(__dirname, '..', '..', 'temp', 'voice_' + Date.now() + '.wav');
      try {
        if (!fs.existsSync(path.dirname(tmpFile))) fs.mkdirSync(path.dirname(tmpFile), { recursive: true });
        fs.writeFileSync(tmpFile, Buffer.from(args.text, 'base64'));
        audioPath = tmpFile;
      } catch(e) {
        return { error: '无法写入临时音频文件: ' + e.message };
      }
    } else {
      return { error: '缺少音频文件路径 (audio/file/path)' };
    }
  }

  if (!fs.existsSync(audioPath)) {
    return { error: '音频文件不存在: ' + audioPath };
  }

  try {
    // 获取音频时长（ffprobe，如果可用）
    var duration = 0;
    try {
      var durOut = execSync('ffprobe -i "' + audioPath + '" -show_entries format=duration -v quiet -of csv="p=0" 2>&1', { encoding: 'utf8', timeout: 10000 });
      duration = parseFloat(durOut.trim()) || 0;
    } catch(e) { /* ffprobe 不可用 */ }

    // 调用 whisper CLI
    var cmd = 'python -m whisper "' + audioPath + '" --model ' + model + ' --language ' + language + ' --output_format txt --output_dir "' + path.dirname(audioPath) + '" 2>&1';
    var result = execSync(cmd, { encoding: 'utf8', timeout: 120000, maxBuffer: 10 * 1024 * 1024 });

    // 读取转写结果 (whisper 输出在与输入同名的 .txt 文件中)
    var txtFile = audioPath.replace(/\.[^.]+$/, '') + '.txt';
    var text = '';
    if (fs.existsSync(txtFile)) {
      text = fs.readFileSync(txtFile, 'utf8').trim();
      // 清理临时文件
      try { fs.unlinkSync(txtFile); } catch(e) {}
    }

    // 清理临时音频文件（如果是我们创建的）
    if (args.text && args.text.length > 100) {
      try { fs.unlinkSync(audioPath); } catch(e) {}
    }

    // 从 whisper 输出中提取转写文本（如果 txt 文件未生成）
    if (!text) {
      // 尝试从 stdout 提取
      var lines = result.split('\n').filter(function(l) { return l.trim() && !l.startsWith('[') && !l.startsWith(' ') && !l.includes('Detecting') && !l.includes('Model') && !l.includes('Transcribing'); });
      text = lines.join('\n').trim();
    }

    return {
      text: text || '(无识别结果)',
      duration: duration,
      model: model,
      language: language,
      raw: result.substring(0, 500)
    };
  } catch(e) {
    // 清理临时音频
    if (args.text && args.text.length > 100) {
      try { fs.unlinkSync(audioPath); } catch(e) {}
    }
    return { error: '语音识别失败: ' + e.message };
  }
}

module.exports = handler;
