'use strict';

const GROUP_ORDER = new Map([
  ['Gemini', 0],
  ['Claude', 1],
  ['Argon', 2],
]);

function percent(bucket) {
  return Math.max(0, Math.min(100, Math.round((bucket?.remainingFraction ?? 0) * 100)));
}

function formatReset(resetTime, now = Date.now()) {
  if (!resetTime) return 'Unknown';
  const reset = new Date(resetTime).getTime();
  if (!Number.isFinite(reset)) return 'Unknown';

  const minutes = Math.floor(Math.max(0, reset - now) / 60_000);
  const days = Math.floor(minutes / 1_440);
  const hours = Math.floor((minutes % 1_440) / 60);
  const mins = minutes % 60;

  if (days) return `${days}d${hours ? `${hours}h` : ''}`;
  if (hours) return `${hours}h${mins ? `${mins}min` : ''}`;
  if (mins) return `${mins}min`;
  return 'Now';
}

function quotaIndicator(value) {
  if (value > 50) return '🟢';
  if (value > 20) return '🟡';
  return '🔴';
}

function canonicalGroupName(name) {
  if (/^Gemini 4 Argon$/i.test(name)) return 'Argon';
  if (/argon/i.test(name)) return undefined;
  if (/gemini/i.test(name)) return 'Gemini';
  if (/claude|gpt/i.test(name)) return 'Claude';
  return undefined;
}

function normalize(quota) {
  const groups = (quota.groups || [])
    .map((group) => {
      const name = canonicalGroupName(group.displayName || '');
      if (!name) return undefined;
      const buckets = group.buckets || [];
      if (name === 'Argon') {
        const weekly = buckets.find((bucket) => bucket.bucketId === 'gemini-argon-wtu-weekly' && bucket.window === 'weekly' && !bucket.disabled && !group.disabled && Number.isFinite(bucket.remainingFraction));
        return weekly ? { name, weekly } : undefined;
      }
      const weekly = buckets.find((bucket) => /week/i.test(`${bucket.displayName || ''} ${bucket.window || ''}`));
      const fiveHour = buckets.find((bucket) => bucket.window === '5h' || /five|5.?hour/i.test(`${bucket.displayName || ''} ${bucket.window || ''}`));
      return { name, weekly, fiveHour };
    })
    .filter(Boolean)
    .sort((left, right) => GROUP_ORDER.get(left.name) - GROUP_ORDER.get(right.name));
  if (!groups.some((group) => group.name === 'Gemini' && (group.weekly || group.fiveHour))) {
    const models = (quota.modelQuotas || []).filter((model) => !/argon/i.test(`${model.id || ''} ${model.displayName || ''}`) && Number.isFinite(model.remainingFraction));
    const modelQuota = models.reduce((lowest, model) => !lowest || model.remainingFraction < lowest.remainingFraction ? model : lowest, undefined);
    const index = groups.findIndex((group) => group.name === 'Gemini');
    if (index >= 0) groups.splice(index, 1);
    groups.unshift({ name: 'Gemini', modelQuota });
  }
  return groups;
}

function formatBucket(bucket, now = Date.now()) {
  if (!bucket) return '⚪ —';
  const remaining = percent(bucket);
  return `${quotaIndicator(remaining)} ${remaining}% ${formatReset(bucket.resetTime, now)}`;
}

function formatStatusSegment(group, now = Date.now()) {
  if (group.modelQuota) return `${quotaIndicator(percent(group.modelQuota))} ${group.name} ${percent(group.modelQuota)}% model ${formatReset(group.modelQuota.resetTime, now)}`;
  const weekly = group.weekly
    ? `${quotaIndicator(percent(group.weekly))} ${group.name} ${percent(group.weekly)}% ${formatReset(group.weekly.resetTime, now)}`
    : `⚪ ${group.name} —`;
  return group.name === 'Argon' ? weekly : `${weekly} · ${formatBucket(group.fiveHour, now)}`;
}

function formatStatus(groups, now = Date.now()) {
  return groups.map((group) => formatStatusSegment(group, now)).join(' ║ ');
}

function formatQuotaCells(bucket, now) {
  if (!bucket) return '<td align="center">&nbsp;—</td><td align="center">—</td>';
  return `<td align="center">&nbsp;${percent(bucket)}%</td><td align="center">${formatReset(bucket.resetTime, now)}</td>`;
}

function formatQuotaTable(groups, now = Date.now()) {
  const hasModelQuota = groups.some((group) => group.modelQuota);
  const rows = groups.map((group) => {
    const indicatorBucket = group.weekly || group.fiveHour || group.modelQuota;
    const indicator = indicatorBucket ? quotaIndicator(percent(indicatorBucket)) : '⚪';
    return `<tr><td>${indicator} ${group.name}</td>${formatQuotaCells(group.weekly, now)}${formatQuotaCells(group.fiveHour, now)}${hasModelQuota ? formatQuotaCells(group.modelQuota, now) : ''}</tr>`;
  }).join('');

  return [
    '<table>',
    `<thead><tr><th>Model</th><th colspan="2">&nbsp;Weekly quota</th><th colspan="2">&nbsp;5h quota</th>${hasModelQuota ? '<th colspan="2">&nbsp;Model quota</th>' : ''}</tr></thead>`,
    `<tbody>${rows}</tbody>`,
    '</table>',
  ].join('');
}

module.exports = {
  canonicalGroupName,
  formatQuotaTable,
  formatReset,
  formatStatus,
  formatStatusSegment,
  normalize,
  percent,
  quotaIndicator,
};
