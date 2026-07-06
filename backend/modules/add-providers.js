const fs = require('fs');
const content = fs.readFileSync('ai-engine.js', 'utf8');

// New providers to add
const newProviders = `,
  "ernie": {
    "baseUrl": "https://aip.baidubce.com/rpc/2.0/ai_custom/v1/wenxinworkshop/chat/completions",
    "apiKeyEnv": "ERNIE_API_KEY",
    "defaultModel": "ernie-4.0-8k",
    "models": [
      { id: "ernie-4.0-8k", label: "文心4.0 8K", tags: ["推理", "通用", "中文"], contextWindow: 8000 },
      { id: "ernie-4.0-32k", label: "文心4.0 32K", tags: ["推理", "通用", "长文本"], contextWindow: 32000 },
      { id: "ernie-bot", label: "文心一言3.5", tags: ["通用", "中文"], contextWindow: 8000 },
      { id: "ernie-bot-turbo", label: "文心一言 Turbo", tags: ["快速", "经济"], contextWindow: 8000 },
      { id: "ernie-speed-8k", label: "文心 Speed 8K", tags: ["快速", "推理"], contextWindow: 8000 }
    ]
  },
  "yi": {
    "baseUrl": "https://api.01.ai/v1/chat/completions",
    "apiKeyEnv": "YI_API_KEY",
    "defaultModel": "yi-large",
    "models": [
      { id: "yi-large", label: "Yi Large", tags: ["推理", "通用", "长文本"], contextWindow: 160000 },
      { id: "yi-large-rag", label: "Yi Large RAG", tags: ["RAG", "检索增强"], contextWindow: 160000 },
      { id: "yi-medium", label: "Yi Medium", tags: ["通用", "均衡"], contextWindow: 32000 },
      { id: "yi-spark", label: "Yi Spark", tags: ["快速", "经济"], contextWindow: 16000 }
    ]
  }`;

// Pattern: end of hunyuan object + PROVIDERS closing + ;; + empty line + comment
const endMarker = `    ]
  }
};;

// ========== 读取 AI 配置（支持备用提供商） ==========`;

const idx = content.indexOf(endMarker);

if (idx === -1) {
  console.log('Marker not found!');
  // Try to find the last occurrence of "读取 AI 配置"
  const altIdx = content.lastIndexOf('// ========== 读取 AI 配置（支持备用提供商）');
  console.log('Alternative index:', altIdx);
} else {
  console.log('Found marker at:', idx);
  // Insert new providers after "    ]" and before "  }" which closes the hunyuan object
  // Actually, we need to insert after the hunyuan object closes (after "  }" but before "};;")
  // Let me find the exact position
  const hunyuanEnd = `    ]
  }
};;`;

  const hunyuanIdx = content.indexOf(hunyuanEnd);
  if (hunyuanIdx !== -1) {
    console.log('Found hunyuan end at:', hunyuanIdx);
    // Insert after "  }" and before "};;"
    const insertPoint = hunyuanIdx + hunyuanEnd.indexOf('};;');
    const newContent = content.slice(0, insertPoint) + newProviders + content.slice(insertPoint);
    fs.writeFileSync('ai-engine.js', newContent, 'utf8');
    console.log('Done! Added providers.');
  } else {
    console.log('Could not find hunyuan end pattern');
  }
}
