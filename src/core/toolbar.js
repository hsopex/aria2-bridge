function count(value) {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  if (typeof value === 'string' && !/^\d+$/.test(value)) return null;
  const number = Number(value);
  return Number.isSafeInteger(number) && number >= 0 ? number : null;
}
export function downloadCounts(summary) {
  if (!summary.connected) return null;
  const active = count(summary.numActive), waiting = count(summary.numWaiting);
  if (active === null || waiting === null || !Number.isSafeInteger(active + waiting)) return null;
  return { active, waiting, total: active + waiting };
}
export function toolbarState({ enabled, summary, pending, serverName }) {
  const counts = downloadCounts(summary);
  const tasks = counts ? `下载中 ${counts.active} · 等待／暂停 ${counts.waiting} · 未完成 ${counts.total}` : '任务数量未知';
  return {
    icon: enabled ? 'icon-enabled.svg' : 'icon-disabled.svg',
    text: counts?.total ? String(Math.min(counts.total, 99)) : pending ? '?' : '',
    color: pending ? '#b35c00' : summary.connected ? '#237747' : '#8a3440',
    title: `Aria2 Bridge · 自动接管${enabled ? '已开启' : '已关闭'} · ${serverName}\n${summary.note} · ${tasks}${pending ? `\n${pending} 个交接待确认，请打开设置核对` : ''}`,
  };
}
