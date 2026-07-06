// backend/modules/i18n.js - Multi-language support for eCompany
// Supports: zh-CN (default), en-US, ja-JP, ko-KR, zh-TW

const fs = require('fs');
const path = require('path');

const LOCALES_DIR = path.join(__dirname, '..');

// Default language
const defaultLocale = 'zh-CN';

// Available languages
const availableLanguages = ['zh-CN', 'en-US', 'ja-JP', 'ko-KR', 'zh-TW'];

// Cache for loaded locales
const localeCache = {};

function loadLocale(lang) {
  if (localeCache[lang]) return localeCache[lang];
  
  const filePath = path.join(LOCALES_DIR, `locales_${lang}.json`);
  try {
    if (fs.existsSync(filePath)) {
      const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      localeCache[lang] = data;
      return data;
    }
  } catch (e) {
    console.error(`[i18n] Failed to load ${lang}:`, e.message);
  }
  
  return null;
}

function t(lang, key, defaultText) {
  const locale = loadLocale(lang);
  if (locale && locale[key]) return locale[key];
  if (lang !== defaultLocale) {
    const defaultLocaleData = loadLocale(defaultLocale);
    if (defaultLocaleData && defaultLocaleData[key]) return defaultLocaleData[key];
  }
  return defaultText || key;
}

// Helper: parse request body (inline implementation)
function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        resolve(JSON.parse(body || '{}'));
      } catch (e) {
        resolve({});
      }
    });
    req.on('error', reject);
  });
}

// API handler
function registerI18nAPI(addRoute, parseBodyFn, jsonFn) {
  // Get available languages
  addRoute(['GET'], '/api/i18n/languages', (req, res) => {
    jsonFn(res, {
      ok: true,
      languages: availableLanguages,
      default: defaultLocale
    });
  });

  // Get locale file
  addRoute(['GET'], /^\/api\/i18n\/([a-zA-Z]{2}-[A-Z]{2})$/, (req, res, m) => {
    const lang = m[1];
    
    if (!availableLanguages.includes(lang)) {
      jsonFn(res, { ok: false, error: 'Language not available' });
      return;
    }
    
    const localeData = loadLocale(lang);
    if (!localeData) {
      jsonFn(res, { ok: false, error: 'Locale file not found' });
      return;
    }
    
    jsonFn(res, { ok: true, locale: localeData });
  });

  // Translate text (batch translation)
  addRoute(['POST'], '/api/i18n/translate', async (req, res) => {
    const body = await parseBodyFn(req);
    const { lang, keys } = body;
    
    if (!lang || !keys || !Array.isArray(keys)) {
      jsonFn(res, { ok: false, error: 'Invalid request' });
      return;
    }
    
    const locale = loadLocale(lang);
    const result = {};
    keys.forEach(key => {
      result[key] = t(lang, key, key);
    });
    
    jsonFn(res, { ok: true, translations: result });
  });
}

module.exports = { registerI18nAPI, t, loadLocale, availableLanguages };
