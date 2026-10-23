'use strict';

const vscode = require('vscode');
const { fetchQuota } = require('./quota-client');
const {
  formatQuotaTable,
  formatReset,
  formatStatus,
  normalize,
  percent,
  quotaIndicator,
} = require('./quota-ui');

let statusItem;
let refreshTimer;
let latest;
let refreshing = false;

function renderStatus(data) {
  const groups = normalize(data.quota);
  const statusText = formatStatus(groups);

  statusItem.text = statusText || '⚪ Quota unavailable';
  statusItem.backgroundColor = undefined;

  const tooltip = new vscode.MarkdownString(undefined, true);
  tooltip.supportHtml = true;
  tooltip.appendMarkdown('### Antigravity 5h/Weekly Quota\n\n');
  tooltip.appendMarkdown(`${formatQuotaTable(groups)}\n\n`);
  if (groups.some((group) => group.modelQuota)) tooltip.appendMarkdown('Model quota: lowest reported Gemini model balance; window unspecified by server.\n\n');
  if (data.quota.warning) tooltip.appendText(data.quota.warning);
  if (data.account) tooltip.appendMarkdown(`\nPlan: ${data.account}`);
  tooltip.appendMarkdown(`\n\nUpdated: ${new Date(data.fetchedAt).toLocaleTimeString('en-US')} · [Refresh now](command:antigravityWeeklyQuota.refresh)`);
  tooltip.isTrusted = { enabledCommands: ['antigravityWeeklyQuota.refresh'] };
  statusItem.tooltip = tooltip;
  statusItem.show();
}

function renderError(error) {
  statusItem.text = '$(warning) Quota unavailable';
  statusItem.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
  statusItem.tooltip = `Failed to read Antigravity quota: ${error.message}`;
  statusItem.show();
}

async function refresh(context, notify = false) {
  if (refreshing) return;
  refreshing = true;
  statusItem.text = '$(sync~spin) AG quota';
  statusItem.show();
  try {
    let cachedToken;
    const cached = await context.secrets.get('agyWeeklyQuota.accessToken');
    if (cached) cachedToken = JSON.parse(cached);
    latest = await fetchQuota(context.extensionPath, cachedToken);
    await context.secrets.store('agyWeeklyQuota.accessToken', JSON.stringify(latest.token));
    renderStatus(latest);
    if (notify) vscode.window.showInformationMessage('Antigravity quota refreshed.');
  } catch (error) {
    renderError(error);
    if (notify) vscode.window.showErrorMessage(`Failed to refresh Antigravity quota: ${error.message}`);
  } finally {
    refreshing = false;
  }
}

async function showDetails(context) {
  if (!latest) await refresh(context, false);
  if (!latest) return;
  const items = [];
  for (const group of normalize(latest.quota)) {
    if (group.modelQuota) {
      for (const model of latest.quota.modelQuotas) items.push({
        label: `${quotaIndicator(percent(model))} ${model.displayName} — ${percent(model)}% model quota remaining`,
        description: `Resets in ${formatReset(model.resetTime)}; window unspecified`,
      });
    }
    if (!group.weekly && !group.fiveHour && !group.modelQuota) items.push({ label: `${group.name} — quota not reported` });
    if (group.weekly) {
      items.push({
        label: `${quotaIndicator(percent(group.weekly))} ${group.name} — ${percent(group.weekly)}% weekly remaining`,
        description: `Resets in ${formatReset(group.weekly.resetTime)}`,
      });
    }
    if (group.fiveHour) {
      items.push({
        label: `${quotaIndicator(percent(group.fiveHour))} ${group.name} — ${percent(group.fiveHour)}% 5h remaining`,
        description: `Resets in ${formatReset(group.fiveHour.resetTime)}`,
      });
    }
  }
  await vscode.window.showQuickPick(items, { title: 'Antigravity 5h/Weekly Quota' });
}

function schedule(context) {
  if (refreshTimer) clearInterval(refreshTimer);
  const seconds = vscode.workspace
    .getConfiguration('antigravityWeeklyQuota')
    .get('refreshIntervalSeconds', 120);
  refreshTimer = setInterval(() => refresh(context, false), Math.max(60, seconds) * 1000);
}

function activate(context) {
  statusItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  statusItem.command = 'antigravityWeeklyQuota.showDetails';
  statusItem.name = 'Antigravity 5h/Weekly Quota';
  context.subscriptions.push(
    statusItem,
    vscode.commands.registerCommand('antigravityWeeklyQuota.refresh', () => refresh(context, true)),
    vscode.commands.registerCommand('antigravityWeeklyQuota.showDetails', () => showDetails(context)),
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration('antigravityWeeklyQuota')) {
        schedule(context);
        if (latest) renderStatus(latest);
      }
    })
  );
  schedule(context);
  refresh(context, false);
}

function deactivate() {
  if (refreshTimer) clearInterval(refreshTimer);
}

module.exports = { activate, deactivate };
