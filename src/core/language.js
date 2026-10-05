import { english } from '../locales/en.js';
export const languages = [['zh_Hans', '简体中文'], ['en', 'English']];
export const normalizeLanguage = value => value === 'en' ? 'en' : 'zh_Hans';
export const languageTag = value => normalizeLanguage(value) === 'en' ? 'en' : 'zh-CN';
const phrases = Object.keys(english).sort((a, b) => b.length - a.length);
const matcher = new RegExp(phrases.map(value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'), 'g');
export function translateText(value, language) {
  if (typeof value !== 'string' || normalizeLanguage(language) !== 'en') return value;
  return value.replace(matcher, phrase => english[phrase]);
}
