'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  formatQuotaTable,
  formatReset,
  formatStatus,
  formatStatusSegment,
  normalize,
  percent,
  quotaIndicator,
} = require('../quota-ui');

test('quota indicators use the requested threshold boundaries', () => {
  assert.equal(quotaIndicator(100), '🟢');
  assert.equal(quotaIndicator(51), '🟢');
  assert.equal(quotaIndicator(50), '🟡');
  assert.equal(quotaIndicator(21), '🟡');
  assert.equal(quotaIndicator(20), '🔴');
  assert.equal(quotaIndicator(0), '🔴');
});

test('reset countdowns use compact English units', () => {
  const now = Date.UTC(2026, 5, 20, 0, 0, 0);
  assert.equal(formatReset(now + (4 * 60 + 59) * 60_000, now), '4h59min');
  assert.equal(formatReset(now + (24 + 17) * 60 * 60_000, now), '1d17h');
  assert.equal(formatReset(now + 42 * 60_000, now), '42min');
  assert.equal(formatReset(now, now), 'Now');
  assert.equal(formatReset(undefined, now), 'Unknown');
});

test('percent rounds and clamps remaining quota', () => {
  assert.equal(percent({ remainingFraction: 0.505 }), 51);
  assert.equal(percent({ remainingFraction: 1.2 }), 100);
  assert.equal(percent({ remainingFraction: -0.1 }), 0);
});

test('normalization keeps only canonical Gemini and Claude rows in order', () => {
  const quota = {
    groups: [
      {
        displayName: 'Claude and GPT models',
        buckets: [{ displayName: 'Weekly', remainingFraction: 0.26, resetTime: '2026-06-21T17:00:00Z' }],
      },
      { displayName: 'Other models', buckets: [] },
      {
        displayName: 'Gemini Models',
        buckets: [{ displayName: '5 hour', remainingFraction: 1, resetTime: '2026-06-20T04:59:00Z' }],
      },
    ],
  };

  const groups = normalize(quota);
  assert.deepEqual(groups.map((group) => group.name), ['Gemini', 'Claude']);
  assert.equal(groups[0].fiveHour.remainingFraction, 1);
  assert.equal(groups[1].weekly.remainingFraction, 0.26);
});

test('status segment includes weekly and 5h quota with a light separator', () => {
  const now = Date.UTC(2026, 5, 20, 0, 0, 0);
  const group = {
    name: 'Claude',
    weekly: { remainingFraction: 0.26, resetTime: now + (24 + 17) * 60 * 60_000 },
    fiveHour: { remainingFraction: 1, resetTime: now + 5 * 60 * 60_000 },
  };
  assert.equal(formatStatusSegment(group, now), '🟡 Claude 26% 1d17h · 🟢 100% 5h');
});

test('quota table groups percentage and reset cells under merged headers', () => {
  const now = Date.UTC(2026, 5, 20, 0, 0, 0);
  const group = {
    name: 'Gemini',
    weekly: { remainingFraction: 0.9, resetTime: now + (24 + 17) * 60 * 60_000 },
    fiveHour: { remainingFraction: 1, resetTime: now + (4 * 60 + 59) * 60_000 },
  };
  const table = formatQuotaTable([group], now);

  assert.match(table, /<th colspan="2">&nbsp;Weekly quota<\/th>/);
  assert.match(table, /<th colspan="2">&nbsp;5h quota<\/th>/);
  assert.match(table, /<td align="center">&nbsp;90%<\/td><td align="center">1d17h<\/td>/);
  assert.match(table, /<td align="center">&nbsp;100%<\/td><td align="center">4h59min<\/td>/);
});

test('status uses a strong separator only between model groups', () => {
  const now = Date.UTC(2026, 5, 20, 0, 0, 0);
  const groups = [
    {
      name: 'Gemini',
      weekly: { remainingFraction: 0.9, resetTime: now + (24 + 17) * 60 * 60_000 },
      fiveHour: { remainingFraction: 1, resetTime: now + 5 * 60 * 60_000 },
    },
    {
      name: 'Claude',
      weekly: { remainingFraction: 0.26, resetTime: now + (24 + 17) * 60 * 60_000 },
      fiveHour: { remainingFraction: 1, resetTime: now + 5 * 60 * 60_000 },
    },
  ];

  assert.equal(
    formatStatus(groups, now),
    '🟢 Gemini 90% 1d17h · 🟢 100% 5h ║ 🟡 Claude 26% 1d17h · 🟢 100% 5h'
  );
});

test('missing Gemini summary uses lowest model quota without inventing a window', () => {
  const groups = normalize({ groups: [{ displayName: 'Claude', buckets: [{ window: '5h', remainingFraction: 1 }] }], modelQuotas: [{ remainingFraction: 0.98 }, { remainingFraction: 0.4 }] });
  assert.equal(groups[0].modelQuota.remainingFraction, 0.4);
  assert.equal(groups[0].weekly, undefined);
  assert.equal(groups[0].fiveHour, undefined);
  assert.equal(groups[1].fiveHour.remainingFraction, 1);
  assert.match(formatStatus(groups), /Gemini 40% model/);
  assert.match(formatQuotaTable(groups), /Model quota/);
});

test('missing model quota stays unknown and valid zero remains zero', () => {
  assert.match(formatStatus(normalize({ groups: [] })), /Gemini —/);
  assert.match(formatStatus(normalize({ groups: [], modelQuotas: [{ remainingFraction: 0 }] })), /Gemini 0% model/);
});

test('summary Gemini buckets take precedence over model fallback', () => {
  const groups = normalize({ groups: [{ displayName: 'Gemini', buckets: [{ window: 'weekly', remainingFraction: 0.9 }] }], modelQuotas: [{ remainingFraction: 0.2 }] });
  assert.equal(groups[0].weekly.remainingFraction, 0.9);
  assert.equal(groups[0].modelQuota, undefined);
});
