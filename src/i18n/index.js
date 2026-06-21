// Minimal i18n: loads locale JSON files and returns a translator bound to a
// language. Supports {placeholder} interpolation and dotted keys.
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const localesDir = join(__dirname, 'locales');

export const SUPPORTED_LANGS = ['en', 'am'];
export const DEFAULT_LANG = 'en';

const catalogs = {};
for (const file of readdirSync(localesDir).filter((f) => f.endsWith('.json'))) {
  const lang = file.replace(/\.json$/, '');
  catalogs[lang] = JSON.parse(readFileSync(join(localesDir, file), 'utf8'));
}

function lookup(catalog, key) {
  return key.split('.').reduce((acc, part) => (acc == null ? undefined : acc[part]), catalog);
}

function interpolate(template, vars) {
  if (typeof template !== 'string') return template;
  return template.replace(/\{(\w+)\}/g, (_, name) =>
    vars && name in vars ? String(vars[name]) : `{${name}}`
  );
}

// translate(key, lang, vars) -> string
export function translate(key, lang = DEFAULT_LANG, vars) {
  const cat = catalogs[lang] || catalogs[DEFAULT_LANG];
  let value = lookup(cat, key);
  if (value === undefined && lang !== DEFAULT_LANG) {
    value = lookup(catalogs[DEFAULT_LANG], key); // fall back to English
  }
  if (value === undefined) return key; // last resort: show the key
  return interpolate(value, vars);
}

// All translations of a key across supported languages (deduped). Use this to
// match reply-keyboard button taps with bot.hears(), which needs concrete
// strings/regexes — a function predicate is silently coerced to a RegExp and
// never matches. A user may have picked any language, so we match them all.
export function allTranslations(key) {
  return [...new Set(SUPPORTED_LANGS.map((lang) => translate(key, lang)))];
}

// Returns a translator function bound to a language: t(key, vars)
export function getTranslator(lang) {
  const safeLang = SUPPORTED_LANGS.includes(lang) ? lang : DEFAULT_LANG;
  return (key, vars) => translate(key, safeLang, vars);
}
