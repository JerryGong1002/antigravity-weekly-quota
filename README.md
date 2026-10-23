# Antigravity IDE 5h/Weekly Quota

A Windows extension for Antigravity IDE and VS Code that shows remaining Gemini and Claude/GPT five-hour and weekly quota in the status bar.

**Open the IDE and quota refreshes automatically.** After installing and signing in to Antigravity CLI (`agy`) once, you do not need to keep a CLI session or the standalone Antigravity app running. The extension reuses the saved sign-in and queries Google's remote quota API directly.

Version **0.3.4** restores Gemini's separate weekly and five-hour meters with a Hub-compatible request identity.

![Antigravity 5h/Weekly Quota hover panel](assets/antigravity-5h-weekly-quota.png)

Example layout; balances and reset times depend on your account.

## Status bar

> 🟢 Gemini 90% 1d17h · 🟢 100% 5h ║ 🟡 Claude 26% 1d17h · 🟢 100% 5h

Each model group shows its weekly quota first and its five-hour quota second. A light `·` separates quota windows within a model, while `║` separates Gemini from Claude.

| Meter | Meaning |
|---|---|
| Gemini — Weekly / 5h | Remaining fractions in the server's shared Gemini weekly and five-hour buckets |
| Claude — Weekly / 5h | Remaining fractions in the shared Claude/GPT weekly and five-hour buckets |
| Model quota, when shown | Fallback when the Gemini summary is missing: lowest reported Gemini model balance, with its corresponding reset time |

Percentages are server-reported remaining fractions rounded to whole percentages. Countdown values come from each bucket's reset timestamp; they are not the duration of the quota window. The extension does not estimate quota from local token counts or requests. A dash means that window was not reported.

Indicator colors are based on the remaining quota:

- 🟢 Green: above 50%
- 🟡 Yellow: above 20% through 50%
- 🔴 Red: 0% through 20%

## Features

- Displays Gemini and Claude/GPT weekly and five-hour quota.
- Shows compact reset countdowns such as `4h59min` and `1d17h`.
- Provides a hover table with grouped `Weekly quota` and `5h quota` columns.
- Refreshes automatically and supports manual refresh from the hover panel or Command Palette.
- Reuses the existing Antigravity CLI sign-in without writing the CLI credential to disk.
- Falls back to Gemini model quota if the summary omits Gemini; individual model values appear in the details list. The fallback's period remains unspecified because the model response does not identify it.

## Requirements

- Windows
- Visual Studio Code 1.90 or later, or a compatible Antigravity IDE build
- Antigravity CLI (`agy`) installed
- At least one successful `agy` sign-in
- Internet access to Google's Cloud Code and OAuth endpoints

The saved agy sign-in and installed binary are required; a running agy process is not. Set `AGY_PATH` in the IDE's environment if the binary is outside `%LOCALAPPDATA%\agy\bin\agy.exe`.

## Installation

### Install a VSIX

1. Download the `.vsix` from the [latest release](https://github.com/JerryGong1002/antigravity-weekly-quota/releases/latest).
2. Open the Extensions view in VS Code or Antigravity IDE.
3. Select **Views and More Actions** (`...`) → **Install from VSIX...**.
4. Select the downloaded file and run **Developer: Reload Window**. This also loads the new version after an upgrade.

### Run from source

1. Clone this repository.
2. Open it in VS Code.
3. Launch an Extension Development Host with `code --extensionDevelopmentPath="<absolute-path-to-this-repository>"`.

## Usage

- Hover over the status item to view the grouped quota table, current plan, update time, and refresh link.
- Click the status item to open a detailed quota list.
- Run **Antigravity 5h/Weekly Quota: Refresh** from the Command Palette to refresh immediately.

The refresh interval defaults to 120 seconds and can be changed with `antigravityWeeklyQuota.refreshIntervalSeconds`.

## Data source and compatibility

The extension calls `loadCodeAssist` and `retrieveUserQuotaSummary` on `https://cloudcode-pa.googleapis.com/v1internal`, using the compatibility User-Agent `antigravity/hub/2.9.1 windows/amd64`. It does not connect to a local language server.

On October 23, 2026, testing with the same credential, project, and request body showed that the legacy `antigravity/cli/1.0.9` identity omitted Gemini summary buckets, while the Hub identity returned explicit `gemini-weekly` and `gemini-5h` buckets. Switching back to the CLI identity reproduced the omission. Both production and daily hosts returned the Gemini summary with the Hub identity; the extension uses production. This request identity is also used by [CodexBar's Antigravity OAuth integration](https://github.com/steipete/CodexBar/blob/main/docs/antigravity.md).

When Gemini summary data is missing, the extension calls `fetchAvailableModels`. Its model quota fallback appears separately from Weekly and 5h; it never fills a missing weekly bucket with a model balance. A separate Gemini 4 Argon weekly pool was observed through the standalone app's local API, but dedicated Argon reporting is not implemented in this extension.

## Troubleshooting

- **Still seeing only Model quota after upgrading:** run **Developer: Reload Window**, then **Antigravity 5h/Weekly Quota: Refresh**. If the server still omits Gemini summary data, the fallback remains visible.
- **Quota unavailable:** check network access, the installed agy path, and your saved login. If authentication has expired or been revoked, sign in to agy again and refresh.
- **A window shows a dash:** the server did not report that window. It is not treated as zero remaining quota.

## Development

Run the checks:

```powershell
npm test
```

Package the extension with [`@vscode/vsce`](https://github.com/microsoft/vscode-vsce):

```powershell
npx --yes @vscode/vsce package --no-dependencies
```

## Privacy and security

The extension reads the existing `gemini:antigravity` credential from Windows Credential Manager in memory. It extracts the OAuth client information from the locally installed `agy` binary only when a token refresh is required. A refreshed access token is stored in VS Code SecretStorage.

No access tokens, refresh tokens, OAuth client secrets, or user credentials are included in this repository.

## Attribution

The Cloud Code quota integration is a Windows/VS Code port inspired by [FeikoWielsma/dms-antigravity-cli](https://github.com/FeikoWielsma/dms-antigravity-cli), which in turn credits Nicolas Bellamy's original `dms-claudecode` plugin. Their MIT copyright notices are preserved in [LICENSE](LICENSE).

## Disclaimer

This is an unofficial community project. It is not affiliated with, endorsed by, or supported by Google. Google, Gemini, Antigravity, and related names may be trademarks of their respective owners. Internal APIs may change without notice and can break this extension.

## License

[MIT](LICENSE)
