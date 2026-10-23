# Changelog

## 0.3.3 — 2026-10-23

- Added Gemini model-quota fallback when the summary endpoint omits Gemini, with separate window labeling and per-model details.
- Preserve Claude quota when fallback fails; show missing Gemini data as unknown.
- Recognize the `5h` window even without a display name.
- Verified live production model quota and all 10 regression tests.

## 0.3.2 — 2026-10-16

- Fixed missing Gemini weekly and five-hour quota by switching from the daily Cloud Code endpoint to the production endpoint.
- Verified Gemini and Claude quota retrieval; all 7 tests pass.
