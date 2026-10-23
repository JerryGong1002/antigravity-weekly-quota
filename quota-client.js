'use strict';

const fs = require('fs');
const https = require('https');
const path = require('path');
const { execFile } = require('child_process');

// The daily endpoint can omit Gemini's weekly/5h group for the same account.
const API_BASE = 'https://cloudcode-pa.googleapis.com/v1internal';
const OAUTH_URL = 'https://oauth2.googleapis.com/token';
const CLIENT_ID = '1071006060591-tmhssin2h21lcre235vtolojh4g403ep.apps.googleusercontent.com';

function execFileAsync(file, args, options = {}) {
  return new Promise((resolve, reject) => {
    execFile(file, args, options, (error, stdout, stderr) => {
      if (error) {
        error.stderr = stderr;
        reject(error);
        return;
      }
      resolve(stdout);
    });
  });
}

function findAgy() {
  const candidates = [
    process.env.AGY_PATH,
    process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'agy', 'bin', 'agy.exe'),
  ].filter(Boolean);
  const found = candidates.find((candidate) => fs.existsSync(candidate));
  if (!found) {
    throw new Error('agy.exe was not found. Install Antigravity CLI first.');
  }
  return found;
}

async function readCredential(extensionPath) {
  const script = path.join(extensionPath, 'scripts', 'read-agy-credential.ps1');
  const stdout = await execFileAsync(
    'powershell.exe',
    ['-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', script],
    { windowsHide: true, encoding: 'utf8', maxBuffer: 1024 * 1024, timeout: 15000 }
  );
  const credential = JSON.parse(stdout.replace(/^\uFEFF/, ''));
  if (!credential.token) {
    throw new Error('The agy credential does not contain a token.');
  }
  return credential;
}

function expiryEpoch(value) {
  if (typeof value === 'number') {
    return value > 1e12 ? Math.floor(value / 1000) : Math.floor(value);
  }
  if (typeof value === 'string') {
    if (/^\d+$/.test(value)) return expiryEpoch(Number(value));
    const parsed = Date.parse(value);
    if (!Number.isNaN(parsed)) return Math.floor(parsed / 1000);
  }
  return 0;
}

function tokenIsValid(token) {
  return Boolean(token && token.access_token && expiryEpoch(token.expiry) > Math.floor(Date.now() / 1000) + 60);
}

function requestJson(url, { method = 'GET', headers = {}, body } = {}) {
  return new Promise((resolve, reject) => {
    const request = https.request(url, { method, headers }, (response) => {
      const chunks = [];
      response.on('data', (chunk) => chunks.push(chunk));
      response.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        let data;
        try {
          data = text ? JSON.parse(text) : {};
        } catch {
          reject(new Error(`The server returned invalid JSON (HTTP ${response.statusCode}).`));
          return;
        }
        if (response.statusCode < 200 || response.statusCode >= 300) {
          const message = data.error && data.error.message ? data.error.message : text;
          reject(new Error(`Request failed (HTTP ${response.statusCode}): ${message}`));
          return;
        }
        resolve(data);
      });
    });
    request.setTimeout(15000, () => request.destroy(new Error('The quota request timed out.')));
    request.on('error', reject);
    if (body) request.write(body);
    request.end();
  });
}

function clientSecretsFromBinary(agyPath) {
  const binary = fs.readFileSync(agyPath).toString('latin1');
  return [...new Set(binary.match(/GOCSPX-[A-Za-z0-9_-]{28}/g) || [])];
}

async function refreshAccessToken(refreshToken, agyPath) {
  if (!refreshToken) throw new Error('The agy credential has no refresh token. Sign in to agy again.');
  const secrets = clientSecretsFromBinary(agyPath);
  if (!secrets.length) throw new Error('OAuth client information could not be read from the installed agy binary.');

  let lastError;
  for (const secret of secrets) {
    const form = new URLSearchParams({
      client_id: CLIENT_ID,
      client_secret: secret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }).toString();
    try {
      const response = await requestJson(OAUTH_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Content-Length': Buffer.byteLength(form),
        },
        body: form,
      });
      if (response.access_token) {
        return {
          access_token: response.access_token,
          expiry: Math.floor(Date.now() / 1000) + (response.expires_in || 3600),
        };
      }
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || new Error('Failed to refresh the agy OAuth token.');
}

async function agyVersion(agyPath) {
  try {
    const output = await execFileAsync(agyPath, ['--version'], {
      windowsHide: true,
      encoding: 'utf8',
      timeout: 10000,
    });
    const match = output.match(/\d+\.\d+\.\d+/);
    return match ? match[0] : '1.0.9';
  } catch {
    return '1.0.9';
  }
}

async function fetchQuota(extensionPath, cachedToken) {
  const agyPath = findAgy();
  const credential = await readCredential(extensionPath);
  let token = tokenIsValid(cachedToken) ? cachedToken : credential.token;
  if (!tokenIsValid(token)) {
    token = await refreshAccessToken(credential.token.refresh_token, agyPath);
  }

  const version = await agyVersion(agyPath);
  const userAgent = `antigravity/cli/${version} windows/amd64`;
  const headers = {
    Authorization: `Bearer ${token.access_token}`,
    'Content-Type': 'application/json',
    Accept: 'application/json',
    'User-Agent': userAgent,
  };

  const account = await requestJson(`${API_BASE}:loadCodeAssist`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ metadata: { ideType: 'ANTIGRAVITY' } }),
  });
  if (!account.cloudaicompanionProject) {
    throw new Error('Cloud Code did not return a quota project.');
  }

  const quota = await requestJson(`${API_BASE}:retrieveUserQuotaSummary`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ project: account.cloudaicompanionProject }),
  });
  if (!Array.isArray(quota.groups)) {
    throw new Error('The quota response does not contain groups.');
  }

  if (!quota.groups.some((group) => /gemini/i.test(group.displayName || '') && group.buckets?.length)) {
    try {
      const models = await requestJson(`${API_BASE}:fetchAvailableModels`, {
        method: 'POST', headers,
        body: JSON.stringify({ project: account.cloudaicompanionProject }),
      });
      quota.modelQuotas = Object.entries(models.models || {})
        .filter(([id, model]) => /gemini/i.test(`${id} ${model.displayName || ''}`))
        .filter(([, model]) => Number.isFinite(model.quotaInfo?.remainingFraction))
        .map(([id, model]) => ({ id, displayName: model.displayName || id, ...model.quotaInfo }));
      if (!quota.modelQuotas.length) quota.warning = 'Gemini quota was not reported by the server.';
    } catch {
      quota.warning = 'Gemini model quota lookup failed. Refresh to retry.';
    }
  }

  return {
    quota,
    token,
    account: account.paidTier?.name || account.currentTier?.name || '',
    fetchedAt: Date.now(),
  };
}

module.exports = { fetchQuota, expiryEpoch, tokenIsValid };

if (require.main === module) {
  fetchQuota(__dirname)
    .then(({ quota, account }) => {
      const safe = {
        account,
        modelQuotas: quota.modelQuotas,
        warning: quota.warning,
        groups: quota.groups.map((group) => ({
          displayName: group.displayName,
          buckets: (group.buckets || []).map((bucket) => ({
            displayName: bucket.displayName,
            window: bucket.window,
            remainingFraction: bucket.remainingFraction,
            resetTime: bucket.resetTime,
          })),
        })),
      };
      process.stdout.write(JSON.stringify(safe, null, 2));
    })
    .catch((error) => {
      process.stderr.write(`${error.stack || error.message}\n`);
      process.exitCode = 1;
    });
}
