# Changelog

## 0.3.4 — 2026-10-23

- Restored Gemini weekly and 5h summary buckets using the verified Hub request identity instead of the legacy CLI identity.
- Confirmed the response difference with the same token, project, and body in CLI/Hub/CLI order; both production and daily hosts return Gemini buckets with the Hub identity.
- Retained model-quota fallback for incomplete summary responses.
- Documented IDE-only operation with a saved agy sign-in, quota interpretation, authentication requirements, and troubleshooting.
- Updated extension metadata and the packaging manifest to 0.3.4. All 10 regression tests pass; live retrieval returns both shared pools' weekly and five-hour buckets.

## 0.3.3 — 2026-10-23

- Added Gemini model-quota fallback when the summary endpoint omits Gemini, with separate window labeling and per-model details.
- Preserve Claude quota when fallback fails; show missing Gemini data as unknown.
- Recognize the `5h` window even without a display name.
- Verified live production model quota and all 10 regression tests.

## 0.3.2 — 2026-10-16

- Fixed missing Gemini weekly and five-hour quota by switching from the daily Cloud Code endpoint to the production endpoint.
- Verified Gemini and Claude quota retrieval; all 7 tests pass.
