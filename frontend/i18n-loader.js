// i18n-loader.js - Dynamic language loader for eCompany
// Inject into index.html to enable multi-language support

(function() {
  const DEFAULT_LANG = 'zh-CN';
  
  // 1. 优先从 URL 参数读取语言（由 main.js 自动传入）
  let currentLang = DEFAULT_LANG;
  const urlParams = new URLSearchParams(window.location.search);
  const urlLang = urlParams.get('lang');
  if (urlLang && ['zh-CN','en-US','ja-JP','ko-KR','zh-TW'].includes(urlLang)) {
    currentLang = urlLang;
    localStorage.setItem('ecompany-lang', currentLang);
    console.log('[i18n] Loaded from URL parameter:', currentLang);
  } else {
    // 2. 回退到 localStorage
    currentLang = localStorage.getItem('ecompany-lang') || DEFAULT_LANG;
  }
  
  let translations = {};

  // Load translations from backend
  async function loadTranslations(lang) {
    try {
      const res = await fetch(`/api/i18n/${lang}`);
      const data = await res.json();
      if (data.ok) {
        translations = data.locale;
        currentLang = lang;
        localStorage.setItem('ecompany-lang', lang);
        applyTranslations();
        console.log(`[i18n] Switched to ${lang}`);
      }
    } catch(e) {
      console.error('[i18n] Failed to load:', e);
    }
  }

  // Apply translations to DOM
  function applyTranslations() {
    if (currentLang === DEFAULT_LANG) return;
    
    // Walk through all text nodes
    const walker = document.createTreeWalker(
      document.body,
      NodeFilter.SHOW_TEXT,
      null,
      false
    );
    
    let node;
    while (node = walker.nextNode()) {
      const text = node.textContent.trim();
      if (text && translations[text]) {
        node.textContent = node.textContent.replace(text, translations[text]);
      }
    }
    
    // Also handle common element attributes
    document.querySelectorAll('[placeholder],[title],[aria-label]').forEach(el => {
      ['placeholder', 'title', 'aria-label'].forEach(attr => {
        const val = el.getAttribute(attr);
        if (val && translations[val]) {
          el.setAttribute(attr, translations[val]);
        }
      });
    });
  }

  // Language selector widget
  function createLangSelector() {
    const sel = document.createElement('select');
    sel.style.cssText = 'position:fixed;top:10px;right:10px;z-index:99999;padding:4px;background:#fff;border:1px solid #ccc;border-radius:4px;';
    sel.innerHTML = `
      <option value="zh-CN">中文</option>
      <option value="en-US">English</option>
      <option value="ja-JP">日本語</option>
      <option value="ko-KR">한국어</option>
      <option value="zh-TW">繁體中文</option>
    `;
    sel.value = currentLang;
    sel.onchange = () => loadTranslations(sel.value);
    document.body.appendChild(sel);
  }

  // Listen for language changes from main process (Electron only)
  if (window.electronAPI && window.electronAPI.onSetLanguage) {
    window.electronAPI.onSetLanguage((lang) => {
      console.log('[i18n] Received from main:', lang);
      loadTranslations(lang);
    });
    console.log('[i18n] Listening for language changes from main process');
  }

  // Init
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      setTimeout(() => {
        loadTranslations(currentLang);
        createLangSelector();
      }, 1000);
    });
  } else {
    setTimeout(() => {
      loadTranslations(currentLang);
      createLangSelector();
    }, 1000);
  }

  // Re-apply on dynamic content changes
  document.addEventListener('DOMContentLoaded', function() {
  const observer = new MutationObserver(() => {
    if (currentLang !== DEFAULT_LANG) {
      applyTranslations();
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });
  });

  // Expose API
  window.eCompanyI18n = { loadTranslations, applyTranslations };
})();
