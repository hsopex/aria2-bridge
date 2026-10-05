import { readPreferences } from '../core/manager-preferences.js';
import { languageTag, normalizeLanguage, translateText } from '../core/language.js';
// Translate only extension-owned labels. Never translate editable values or user content.
export function initializeLanguage() {
  let language = 'zh_Hans';
  const originals = new WeakMap();
  const manager = location.pathname.includes('/manager/');
  const attributes = ['placeholder', 'aria-label', 'title'];
  function allowed(node) {
    const element = node.nodeType === window.Node.ELEMENT_NODE ? node : node.parentElement;
    return element && !element.closest('[data-user-content], script, style, textarea, code, pre') && (!manager || element.closest('[data-bridge-i18n]'));
  }
  function translate(node, key, value, write) {
    const record = originals.get(node) || {};
    const previous = record[key];
    const source = previous?.last === value ? previous.source : value;
    const next = translateText(source, language);
    record[key] = { source, last: next }; originals.set(node, record);
    if (next !== value) write(next);
  }
  function apply(node) {
    if (node.nodeType === window.Node.TEXT_NODE) {
      if (allowed(node)) translate(node, 'text', node.data, value => { node.data = value; });
      return;
    }
    if (node.nodeType !== window.Node.ELEMENT_NODE && node.nodeType !== window.Node.DOCUMENT_NODE) return;
    if (node.nodeType === window.Node.ELEMENT_NODE && allowed(node)) for (const key of attributes) {
      if (node.hasAttribute(key)) translate(node, key, node.getAttribute(key), value => node.setAttribute(key, value));
    }
    for (const child of node.childNodes) apply(child);
  }
  function update(value) {
    language = normalizeLanguage(value);
    document.documentElement.lang = languageTag(language);
    apply(document);
    const select = document.querySelector('#manager-language');
    if (select) select.value = language;
  }
  const observer = new window.MutationObserver(records => {
    for (const record of records) {
      if (record.type === 'childList') for (const node of record.addedNodes) apply(node);
      else apply(record.target);
    }
  });
  observer.observe(document, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: attributes });
  browser.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.managerPreferences) update(readPreferences(changes.managerPreferences.newValue).language);
  });
  browser.storage.local.get('managerPreferences').then(({ managerPreferences }) => update(readPreferences(managerPreferences).language)).catch(() => update('zh_Hans'));
  apply(document);
}
