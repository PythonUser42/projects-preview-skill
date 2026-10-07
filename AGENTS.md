# Mobile Desktop Preview

## Verification

- Follow the global testing preferences. Do not add after-the-fact unit tests or mocked-DOM tests that count callbacks, style writes, or other implementation details.
- Prefer the single E2E user flow: `npm test`. It uses isolated temporary profiles, a real server process, and a real browser; it must not change the user's active preview, LaunchAgent, or Tailscale routes.
- The flow saves `test-results/report.json`, `preview.png`, and `trace.zip`. Reproduce with `npm test`; inspect the trace with `npx playwright show-trace test-results/trace.zip`.
- Install dependencies with `npm install`. On macOS the runner uses installed Chrome. Elsewhere install Chromium with `npx playwright install chromium`. `PREVIEW_BROWSER_CHANNEL` can select an installed browser channel.
- Only run checks relevant to a substantive change. For a routine attachment, the existing `--up` readiness check is enough; browser-check that attachment when needed. Do not run the whole suite for documentation or minor reversible changes.
- Before introducing an isolated test, document the concrete failure mode and why the browser flow cannot catch it. Keep assertions about observable behavior, not code structure.
- Desktop zoom checks do not verify iOS pinch-zoom crashes; label that limitation honestly.
