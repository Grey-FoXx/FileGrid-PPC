# FRONTEND handoff — 2026-11-14

Checkpoint branch: develop; obtain its SHA with git rev-parse HEAD and match it on both machines.

Implemented: Angular shell, in-memory authentication, dashboard, role-aware navigation, upload forms, SHA-256 Web Worker, persistent-session resume, progress/pause, file search/pagination/details, verified download, dispatcher and ML recommendations, policy display, responsive styling and test fixtures.

Checks: production build; 3 Playwright fixture workflows; 1 live workflow against native PostgreSQL/MinIO/FTP (encrypted document upload/download, FTP incident attachment, desktop/mobile). Screenshots inspected locally. Browser-level interruption/expiry matrix remains open; API restart resume is verified separately.

Do not copy .runtime credentials or large fixtures to Git. npm test needs no backend for the 3 fixtures tests; the live test is skipped unless FILEGRID_LIVE=1 and local services/accounts are present. Read HANDOFF_SECOND_COMPUTER.md for exact setup and independently owned tasks FE06–FE10.

The historical checkpoint above is superseded only by the explicit P0 assignment below. P1/P2 are not authorized yet.


## P0 integration/authentication — 2026-11-14

Branch: feature/frontend-improvements. Local commit: `3d3ab9f` — `fix(frontend): isolate authentication and concurrent refresh`.

- Central current-credentials 401 handling clears authentication, cancels outstanding requests and invites login again, including background refresh. 403 stays a permission error with correlation ID; transport errors alone affect connectivity.
- Credential-scoped abort plus generation guards prevent old refresh/login/incident/download results from mutating the next account. Logout resets file/context/filter/progress state.
- New refreshes supersede pending queries; independent sections keep their successful updates when another endpoint fails. Background errors remain visible.
- Added five Playwright regressions: partial 403 with correlation header, transport failure, silent-refresh 401/relogin, pending search/page replacement, and old-account response after logout/relogin.
- Checks: `npm run build` PASS; `CHROME_BIN=/home/yanis/.cache/ms-playwright/chromium-1194/chrome-linux/chrome npm test` PASS: 8 tests, 1 live test skipped; `git diff --check` PASS. Existing fixture workflows are included.
- Intermediate test runs: one new test failed twice on an ambiguous navigation selector; corrected to an exact accessible name, then the complete suite passed. An initial build invocation from the repository root failed (no package.json); the reported build ran from frontend/.
- Verification subagent reviewed auth/refresh without editing files. No backend/contracts/infrastructure changes. Live integration was not repeated; API fixtures are the verification boundary. FE07 follows as a separate task/commit.


## P0 FE07 robust transfers — 2026-11-14

Branch: feature/frontend-improvements. Local commit subject: `fix(frontend): make upload sessions recoverable and cancellable` (this entry is included in that commit; obtain the exact SHA from git log).

Implemented:

- One abortable transfer lifecycle covers SHA-256 worker termination, binary requests, retry backoff, session lookup and final verification polling. Generation/controller guards prevent old upload/cancel results from affecting another account. Stopping verification only stops the browser monitor; durable server verification continues.
- Idempotency keys and immutable category context are persisted before session creation. A lost response or reload replays the same creation key/body. Retry is bounded to four retries for transport errors and HTTP 429/502/503/504; authorization and validation errors are not retried.
- Resume retrieves confirmed parts and skips them; progress uses confirmed bytes. SINGLE UPLOADED and VERIFYING/AVAILABLE sessions avoid resending content. Original binary bytes, full SHA-256 and chunk SHA-256 remain checked.
- Saved-transfer selection restores category, incident/application IDs and hidden attachment/sensitivity/document context after reload. Context is locked during explicit resume/recovery; a wrong reselected filename/hash/size is rejected before a session request. Original MIME is retained if browser MIME changes. A saved incident outside the fetched first page remains selectable without inventing a new endpoint.
- Expired, cancelled, missing and failed/corrupt-file paths offer explicit targeted restart; other accounts' references remain intact. DELETE uses the existing API. Cancellation 204 removes the local reference; 403 keeps it; 404 offers recovery; 409/uncertain transport outcome re-queries the session and only reports cancellation when confirmed.
- Completed references are removed. Local deletion is scoped to the current account and does not claim to cancel the server session. At most 100 pending references per account are retained without silently evicting pending transfers; inability to persist prevents an untracked creation request.
- Added 26 browser fixture regressions in frontend/e2e/upload-resilience.spec.ts. Existing workflow fixture expiry was moved to 2099 to avoid a wall-clock-dependent failure of the new expiration checks.

Final checks (from repository root):

- `npm --prefix frontend run build` PASS.
- `CHROME_BIN=/home/yanis/.cache/ms-playwright/chromium-1194/chrome-linux/chrome npm --prefix frontend test` PASS: 34 passed, 1 live test skipped (35 total), including all original fixture workflows and five P0 authentication tests.
- `git diff --check` PASS.
- Read-only verification subagent review completed; findings about context restoration and cancellation outcome handling were addressed. One mistaken finding about GET session returning 409 was checked against the actual backend source and retracted; no backend change was needed.

Intermediate failure: the first multipart regression exhausted the Node test worker heap while deep-comparing an 8 MiB Buffer. Replaced test-harness deep equality with Buffer.equals plus SHA-256; the multipart regression passed in isolation and in both subsequent full suites. An intermediate suite after cancellation fixes passed 30 tests, 1 skipped; four added context-restoration tests brought the final result to 34 passed, 1 skipped. Failed test-file creation commands used an incorrect working-directory prefix and changed no source; commands were corrected before the new tests were run.

Boundary: verification uses contract-shaped HTTP fixtures and a real browser/worker, not the live API/storage stack, API process restart or a network-level packet-loss campaign. No new backend dependency or API contract change is required for these P0 changes. Local references remain browser/device-specific, and actual file bytes must be reselected after reload. A browser abort cannot roll back a request already accepted by the server; reconciliation handles that uncertainty.

P0 is complete. No P1/P2 work, merge to develop or remote push was performed. Stop and wait for the user's approval for the next stage.
