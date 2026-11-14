# FRONTEND handoff — 2026-11-14

Checkpoint branch: develop; obtain its SHA with git rev-parse HEAD and match it on both machines.

Implemented: Angular shell, in-memory authentication, dashboard, role-aware navigation, upload forms, SHA-256 Web Worker, persistent-session resume, progress/pause, file search/pagination/details, verified download, dispatcher and ML recommendations, policy display, responsive styling and test fixtures.

Checks: production build; 3 Playwright fixture workflows; 1 live workflow against native PostgreSQL/MinIO/FTP (encrypted document upload/download, FTP incident attachment, desktop/mobile). Screenshots inspected locally. Browser-level interruption/expiry matrix remains open; API restart resume is verified separately.

Do not copy .runtime credentials or large fixtures to Git. npm test needs no backend for the 3 fixtures tests; the live test is skipped unless FILEGRID_LIVE=1 and local services/accounts are present. Read HANDOFF_SECOND_COMPUTER.md for exact setup and independently owned tasks FE06–FE10.

The historical checkpoint above is superseded only by the explicit P0 assignment below. P1/P2 are not authorized yet.


## P0 integration/authentication — 2026-11-14

Branch: feature/frontend-improvements. Local commit subject: `fix(frontend): isolate authentication and concurrent refresh` (this entry is included in that commit).

- Central current-credentials 401 handling clears authentication, cancels outstanding requests and invites login again, including background refresh. 403 stays a permission error with correlation ID; transport errors alone affect connectivity.
- Credential-scoped abort plus generation guards prevent old refresh/login/incident/download results from mutating the next account. Logout resets file/context/filter/progress state.
- New refreshes supersede pending queries; independent sections keep their successful updates when another endpoint fails. Background errors remain visible.
- Added five Playwright regressions: partial 403 with correlation header, transport failure, silent-refresh 401/relogin, pending search/page replacement, and old-account response after logout/relogin.
- Checks: `npm run build` PASS; `CHROME_BIN=/home/yanis/.cache/ms-playwright/chromium-1194/chrome-linux/chrome npm test` PASS: 8 tests, 1 live test skipped; `git diff --check` PASS. Existing fixture workflows are included.
- Intermediate test runs: one new test failed twice on an ambiguous navigation selector; corrected to an exact accessible name, then the complete suite passed. An initial build invocation from the repository root failed (no package.json); the reported build ran from frontend/.
- Verification subagent reviewed auth/refresh without editing files. No backend/contracts/infrastructure changes. Live integration was not repeated; API fixtures are the verification boundary. FE07 follows as a separate task/commit.
