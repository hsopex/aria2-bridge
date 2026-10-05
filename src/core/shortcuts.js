export const shortcutActions = [
  { name: 'open-manager', label: '打开 AriaNg', suggested: 'Alt+Shift+M' },
  { name: 'open-add', label: '添加链接／磁力链接', suggested: 'Alt+Shift+A' },
  { name: 'toggle-sidebar', label: '打开／关闭侧栏', suggested: 'Alt+Shift+J' },
  { name: 'toggle-takeover', label: '开启／关闭自动接管', suggested: 'Alt+Shift+D' },
  { name: 'open-options', label: '打开设置与交接记录', suggested: 'Alt+Shift+O' },
  { name: 'test-connection', label: '测试默认 RPC 连接', suggested: 'Alt+Shift+T' },
  { name: 'refresh-status', label: '刷新连接与任务数量', suggested: 'Alt+Shift+R' },
];
export const shortcutDefaults = () => ({ version: 1, enabled: false, bindings: Object.fromEntries(shortcutActions.map(a => [a.name, ''])) });
const modifiers = ['Ctrl', 'Alt', 'Command', 'MacCtrl', 'Shift'];
const keys = new Set(['Comma', 'Period', 'Home', 'End', 'PageUp', 'PageDown', 'Space', 'Insert', 'Delete', 'Up', 'Down', 'Left', 'Right']);
export function normalizeShortcut(value, os = 'linux') {
  if (typeof value !== 'string' || value.length > 80) throw new Error('快捷键格式错误');
  value = value.trim();
  if (!value) return '';
  const parts = value.split('+').map(v => v.trim());
  const key = parts.pop();
  const functionKey = /^F(?:[1-9]|1[0-9])$/.test(key);
  if (!(/^[A-Z0-9]$/.test(key) || functionKey || keys.has(key))) throw new Error('请使用字母、数字、F1–F19 或方向等常用按键');
  if (parts.length > 2 || new Set(parts).size !== parts.length || parts.some(p => !modifiers.includes(p)) || (!functionKey && (!parts.length || parts.every(p => p === 'Shift')))) throw new Error('请搭配 Ctrl、Alt 或 Command；F1–F19 可单独使用');
  const normalized = parts.map(p => os === 'mac' && p === 'Ctrl' ? 'Command' : p);
  if (new Set(normalized).size !== normalized.length) throw new Error('修饰键重复');
  normalized.sort((a, b) => modifiers.indexOf(a) - modifiers.indexOf(b));
  return [...normalized, key].join('+');
}
export function normalizeShortcutSettings(input, os) {
  if (!input || input.version !== 1 || typeof input.enabled !== 'boolean' || !input.bindings || typeof input.bindings !== 'object' || Array.isArray(input.bindings)) throw new Error('快捷键配置格式错误');
  if (Object.keys(input.bindings).some(name => !shortcutActions.some(a => a.name === name))) throw new Error('未知快捷功能');
  const bindings = {}, used = new Set();
  for (const action of shortcutActions) {
    const key = normalizeShortcut(input.bindings[action.name] ?? '', os);
    if (key && used.has(key)) throw new Error('多个功能不能使用同一个快捷键');
    if (key) used.add(key);
    bindings[action.name] = key;
  }
  return { version: 1, enabled: input.enabled, bindings };
}
export class ShortcutSettings {
  constructor(commands, storage, os) { this.commands = commands; this.storage = storage; this.os = os; this.state = shortcutDefaults(); this.busy = false; this.queue = Promise.resolve(); }
  get enabled() { return this.state.enabled && !this.busy; }
  async apply(state) {
    // Clear first so swapping assignments cannot temporarily create duplicates.
    for (const action of shortcutActions) await this.commands.update({ name: action.name, shortcut: '' });
    if (state.enabled) for (const action of shortcutActions) if (state.bindings[action.name]) await this.commands.update({ name: action.name, shortcut: state.bindings[action.name] });
  }
  async load() {
    const { shortcuts } = await this.storage.get('shortcuts');
    try { this.state = normalizeShortcutSettings(shortcuts, this.os); } catch { this.state = shortcutDefaults(); }
    try { await this.apply(this.state); }
    catch { this.state.enabled = false; await this.apply(this.state); await this.storage.set({ shortcuts: this.state }); }
  }
  save(input) {
    const validated = typeof input === 'function' ? null : normalizeShortcutSettings(input, this.os);
    const work = this.queue.then(async () => {
      const previous = this.state;
      const next = validated || normalizeShortcutSettings(input(previous), this.os);
      this.busy = true;
      try {
        await this.apply(next);
        await this.storage.set({ shortcuts: next });
        this.state = next;
        return this.state;
      } catch (error) {
        try { await this.apply(previous); }
        catch { this.state = { ...previous, enabled: false }; await this.apply(this.state); await this.storage.set({ shortcuts: this.state }); }
        throw error;
      } finally { this.busy = false; }
    });
    this.queue = work.catch(() => {});
    return work;
  }
}
