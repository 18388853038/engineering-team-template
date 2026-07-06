# dy-skill-i18n – Multi-language i18n Skill

Manage and synchronize locale/translation files for the eCompany project.

## Usage

The i18n skill manages locale files in the project's `backend/` directory:

- `locales_zh-CN.json` – Simplified Chinese (1280 keys)
- `locales_zh-TW.json` – Traditional Chinese (1280 keys)  
- `locales_en-US.json` – English (1280 keys)
- `locales_ja-JP.json` – Japanese (1280 keys)
- `locales_ko-KR.json` – Korean (1280 keys)
- Plus fallback files: `locales_en.json`, `locales_ja.json`, `locales_ko.json`

## Commands

- **Translate missing keys**: Identify and fill untranslated keys across all locale files
- **Sync locale files**: Ensure all locale files have the same key set
- **Validate translations**: Check for missing or identical (untranslated) values
- **Add new language**: Scaffold a new locale file from en-US base

## File Format

Each locale file is a flat JSON object with dot-separated keys:

```json
{
  "app.name": "eCompany · AI 虚拟公司",
  "nav.dashboard": "Dashboard",
  "button.save": "保存",
  ...
}
```

## Supported Languages

| Code | Language | Status |
|------|----------|--------|
| zh-CN | 简体中文 | Done |
| zh-TW | 繁體中文 | Done |
| en-US | English | Done |
| ja-JP | 日本語 | Done |
| ko-KR | 한국어 | Done |

## Related

- Locale files: `{{workspace}}/../eCompany-正式版/backend/locales_*.json`
