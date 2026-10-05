// Allowlisted AriaNg presentation preferences. RPC credentials and debug/export
// controls never pass through this store.
const bool = (key, label, value = true) => ({ key, label, type: 'boolean', default: value });
const choice = (key, label, value, options) => ({ key, label, type: 'select', default: value, options });
const languages = [['en', 'English'], ['zh_Hans', '简体中文'], ['zh_Hant', '繁體中文'], ['ja_JP', '日本語'], ['cz_CZ', 'Čeština'], ['de_DE', 'Deutsch'], ['es', 'Español'], ['fr_FR', 'Français'], ['it_IT', 'Italiano'], ['pl_PL', 'Polski'], ['ru_RU', 'Русский']];
const interval = (key, label, value) => choice(key, label, value, [1000, 2000, 5000, 10000, 30000, 60000].map(v => [v, `${v / 1000} 秒`]));
const sortOptions = fields => [['default:asc', '默认顺序'], ...fields.flatMap(([key, text]) => [[`${key}:asc`, `${text}升序`], [`${key}:desc`, `${text}降序`]])];
const taskSort = sortOptions([['name', '文件名'], ['size', '大小'], ['percent', '进度'], ['remain', '剩余时间'], ['dspeed', '下载速度'], ['uspeed', '上传速度']]);
export const preferenceGroups = [
  { label: '语言与页面', fields: [
    choice('language', '管理界面语言', 'en', languages),
    choice('rpcListDisplayOrder', 'RPC 服务菜单顺序', 'recentlyUsed', [['recentlyUsed', '默认服务优先'], ['rpcAlias', '按服务名称']]),
    { key: 'title', label: '管理标签页标题', type: 'text', default: '${downspeed}, ${upspeed} - ${title}', hint: '支持 ${title}、${rpcprofile}、${downloading}、${waiting}、${stopped}、${downspeed}、${upspeed}。' },
    interval('titleRefreshInterval', '标题刷新间隔', 5000),
    interval('globalStatRefreshInterval', '速度与全局状态刷新间隔', 1000),
    interval('downloadTaskRefreshInterval', '任务信息刷新间隔', 1000),
  ] },
  { label: '通知与操作', fields: [
    bool('browserNotification', 'AriaNg 任务通知（管理页打开时）', false),
    bool('browserNotificationSound', '通知声音'),
    choice('browserNotificationFrequency', '通知频率', 'unlimited', [['unlimited', '不限制'], ['high', '每分钟最多 10 次'], ['middle', '每分钟最多 1 次'], ['low', '每 5 分钟最多 1 次']]),
    bool('keyboardShortcuts', '键盘快捷键'), bool('swipeGesture', '滑动手势'), bool('dragAndDropTasks', '拖拽调整任务顺序'),
    bool('confirmTaskRemoval', '删除任务前确认'), bool('removeOldTaskAfterRetrying', '重试后移除旧任务', false),
    choice('afterCreatingNewTask', '新建任务后', 'task-list', [['task-list', '转到任务列表'], ['task-detail', '转到任务详情']]),
    choice('afterRetryingTask', '重试任务后', 'task-list-downloading', [['task-list-downloading', '转到下载中列表'], ['task-detail', '转到任务详情'], ['stay-on-current', '留在当前页面']]),
  ] },
  { label: '列表与详情', fields: [
    bool('taskListIndependentDisplayOrder', '各任务列表使用独立排序', false),
    choice('displayOrder', '下载中／共享列表排序', 'default:asc', taskSort),
    choice('waitingTaskListPageDisplayOrder', '等待列表排序（独立排序时）', 'default:asc', taskSort),
    choice('stoppedTaskListPageDisplayOrder', '已停止列表排序（独立排序时）', 'default:asc', taskSort),
    choice('fileListDisplayOrder', '文件列表排序', 'default:asc', sortOptions([['name', '文件名'], ['size', '大小'], ['percent', '进度'], ['selected', '选择状态']])),
    choice('peerListDisplayOrder', '连接列表排序', 'default:asc', sortOptions([['address', '地址'], ['client', '客户端'], ['percent', '进度'], ['dspeed', '下载速度'], ['uspeed', '上传速度']])),
    bool('includePrefixWhenCopyingFromTaskDetails', '复制详情时包含字段名称'),
    choice('showPiecesInfoInTaskDetailPage', '详情页显示分块信息', 'le10240', [['always', '始终显示'], ['le102400', '分块不超过 102,400'], ['le10240', '分块不超过 10,240'], ['le1024', '分块不超过 1,024'], ['never', '不显示']]),
  ] },
];
export const preferenceFields = preferenceGroups.flatMap(group => group.fields);
export const preferenceDefaults = () => Object.fromEntries(preferenceFields.map(f => [f.key, f.default]));
export const preferenceSetter = key => key === 'rpcListDisplayOrder' ? 'setRPCListDisplayOrder' : `set${key[0].toUpperCase()}${key.slice(1)}`;
export function validatePreferencePatch(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('管理界面设置格式错误');
  const result = {};
  for (const [key, value] of Object.entries(input)) {
    const f = preferenceFields.find(f => f.key === key);
    if (!f) throw new Error(`不支持的管理界面设置：${key}`);
    if (f.type === 'boolean' ? typeof value !== 'boolean' : f.type === 'text' ? typeof value !== 'string' || value.length > 500 || /[\r\n\u0000]/.test(value) : !f.options.some(([v]) => v === value)) throw new Error(`管理界面设置无效：${f.label}`);
    result[key] = value;
  }
  return result;
}
export function readPreferences(stored) {
  const result = preferenceDefaults();
  if (stored?.version !== 1) return result;
  for (const [key, value] of Object.entries(stored.options || {})) {
    try { Object.assign(result, validatePreferencePatch({ [key]: value })); } catch { /* Ignore unknown or corrupt stored fields. */ }
  }
  return result;
}
