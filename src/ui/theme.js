const THEMES = new Set(['system', 'light', 'dark']);
const CACHE_KEY = 'bridge-theme';
export const normalizeTheme = value => THEMES.has(value) ? value : 'system';
function applyTheme(value) {
  const theme = normalizeTheme(value);
  document.documentElement.dataset.theme = theme;
  const select = document.querySelector('#theme');
  if (select) select.value = theme;
  try { localStorage.setItem(CACHE_KEY, theme); } catch { /* Storage cache is optional. */ }
}
export function initializeTheme() {
  let cached = 'system';
  try { cached = localStorage.getItem(CACHE_KEY); } catch { /* Use the system palette. */ }
  applyTheme(cached);
  browser.storage.local.get('appearance').then(({ appearance }) => applyTheme(appearance?.theme)).catch(() => {});
  browser.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.appearance) applyTheme(changes.appearance.newValue?.theme);
  });
  document.addEventListener('DOMContentLoaded', () => applyTheme(document.documentElement.dataset.theme), { once: true });
}
export async function setTheme(value) {
  const theme = normalizeTheme(value);
  const previous = document.documentElement.dataset.theme;
  applyTheme(theme);
  try {
    const { appearance } = await browser.storage.local.get('appearance');
    await browser.storage.local.set({ appearance: { ...appearance, theme } });
  } catch (error) { applyTheme(previous); throw error; }
}
