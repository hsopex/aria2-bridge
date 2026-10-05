export function domainMatches(host, rule) {
  host = host.toLowerCase().replace(/\.$/, '');
  return rule.startsWith('*.') ? host.endsWith(rule.slice(1)) && host !== rule.slice(2) : host === rule;
}

export function matchesFilters(item, filters) {
  let url;
  try { url = new URL(item.finalUrl || item.url); } catch { return false; }
  if (!['http:', 'https:'].includes(url.protocol)) return false;
  let fallback = url.pathname.split('/').pop();
  try { fallback = decodeURIComponent(fallback); } catch { /* malformed escapes are still a valid URL */ }
  const name = (item.filename?.split(/[\\/]/).pop() || fallback).toLowerCase();
  const extMatch = rule => name.endsWith(`.${rule}`);
  if (filters.denyDomains.some(r => domainMatches(url.hostname, r)) || filters.denyExtensions.some(extMatch)) return false;
  return (!filters.allowDomains.length || filters.allowDomains.some(r => domainMatches(url.hostname, r))) &&
    (!filters.allowExtensions.length || filters.allowExtensions.some(extMatch));
}
