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


## P1 UX, metrics, dispatcher and downloads — 2026-11-14

The user's subsequent explicit request authorizes completing all remaining frontend stages. Branch remains feature/frontend-improvements. Local commit subject: `feat(frontend): complete accessible dashboards and verified download UX`.

- FE06: keyboard skip link, current navigation semantics, page/error/detail focus and Escape/focus return, named upload/download progress, client validation for incident numbers/coordinates and document context, responsive/focus/contrast/touch improvements. Responsive fixture covers 320/390/768/1440 CSS pixels; this is not a claim of a complete assistive-technology audit.
- FE09: actual B/s and operations/s alongside p50/p95/p99/error rate, server-returned metric window, business zone totals. Independent loading/empty/error/stale/retry states preserve last successful sections. Normal/Storm capture compares observed in-memory session snapshots, with capture times/window labels and overlapping-window caveat. No historical API invented.
- Dispatcher: server pagination for incidents/readings, meterId filtering and file-status filtering; incident search/ML/priority sorting explicitly apply to current page. Server mode adapts ordering. Separate Random Forest impact, DBSCAN local correlation and Decision Agent panels include available versions/policy/timestamp/reasons. AVAILABLE downloads stay independent from ML PENDING/FAILED.
- DownloadController: incremental SHA-256 and byte counts while reading; cancel, destination abort on corruption, header consistency, actual length checks, bounded <=128 MiB buffered fallback and advance browser-capability explanation/disabled large-file action. No uncontracted Range/resume endpoint.
- FE10: four human-role fixture regression, permission/error states and unsupported ingest-only UI account handling. Policy explanations are readable, raw active configuration is expandable. Added frontend/README.md for local/manual testing; Playwright supports installed Chromium and FILEGRID_BASE_URL for actual HTTPS Compose gateway.

Checks: `npm --prefix frontend run build` PASS; `npm --prefix frontend test` PASS: 54 active tests, 1 live test omitted (55 total). The 20 new enhancements tests initially had selector/fixture mistakes (hidden skip link until keyboard focus, ambiguous text, route lacking query wildcard and wrong assumptions about focused heading); corrected, then complete suite passed. `--grep P1` matched no titles and was replaced with the explicit spec/full-suite command. `git diff --check` PASS.

Real environment: Docker 28.0.1 is accessible here. Started the existing Compose stack without tracked infrastructure changes and ran `python3 scripts/smoke-test.py`: PASS Database original/dedup/conflict, FTP and S3 attachment recovery, private document recovery/second-owner denial, drone-category recovery, ML-independent availability. `scripts/start.sh` itself ended with readiness timeout: inside gateway `getent hosts localhost` returns ::1; Nginx IPv4 responds at https://127.0.0.1:8443 and external https://localhost:8443 returns 200. This script/configuration issue is a backend-owned follow-up; no clean-start success is claimed. Services remain running.

Remaining in this authorized run: FE08 modularization, final fixture/live browser checks against latest gateway image, manual screenshots and test access handoff. No backend/contracts/infrastructure source changes, no merge or push.


## P2 FE08 and final frontend acceptance — 2026-11-14

P1 commit: `70e2f14` — `feat(frontend): complete accessible dashboards and verified download UX`.
Final local commit subject: `feat(frontend): modularize workspace and finalize live acceptance` (this entry is included in that commit; see git log for SHA).

- AppComponent is now a 17-line shell with six standalone pages: dashboard/upload/files/incidents/meters/policies. WorkspaceStore is provided once by the shell and shared by all pages. UploadController contains upload forms/session/hash/retry/cancel lifecycle through a typed host; DownloadController and the sole Api instance are reused. Auth generations, abort scopes and timers retain their existing ownership. Verification subagent found no material lifecycle/auth regressions.
- Upload state resets all form context on account changes. Session hashing still uses the same worker URL and incremental implementation. API endpoint names and shared contracts remain unchanged.
- Added populated-layout regression across all six pages, including unbroken long filenames/model metadata and expanded policy JSON at 320/390/768/1440 px. It found real file-detail heading overflow at 320 px; fixed wrapping. Sidebar supports constrained-height scrolling. Added readable small positive rate formatting (six decimal places for operations/s, bounded B/s formatting), Romanian breadcrumbs and an accessible mobile home link.
- Storm priority puts reported critical-safety cases and IMMEDIATE_HUMAN_REVIEW ahead of ordinary numeric scores; displays the reported safety flag separately. Existing optional metadata is consumed without changing the API. A regression covers a lower-score immediate review ahead of a higher-score ordinary recommendation.
- Added three opt-in Compose acceptance cases: actual ML worker pause/unpause with verified download before analysis completion; all four human roles on mobile; real multipart 8 MiB + 19 byte transfer paused/reloaded/resumed without retransmitting part 1, followed by byte-identical recovery. The original live document/FTP workflow is also included.

Final checks against the latest Docker-built gateway image:

- `npm --prefix frontend run build` PASS (production bundle, worker included).
- `docker compose up --build -d --no-deps gateway` PASS (latest frontend served; backend not restarted or edited).
- `FILEGRID_BASE_URL=https://localhost:8443 FILEGRID_LIVE=1 FILEGRID_COMPOSE_LIVE=1 PLAYWRIGHT_JSON_OUTPUT_NAME=<ignored runtime path> npm --prefix frontend test -- --reporter=list,json` PASS: **61 passed, 0 failed, 0 skipped, 0 flaky**, approximately 92 seconds. 57 fixture/layout checks and 4 actual Compose browser checks.
- Earlier production-served full acceptance passed 60 cases before the additional safety-ordering regression. Earlier FE08 fixture-only full suite passed 55 active / 1 live omitted; all live cases are enabled in the final run above.
- `python3 scripts/smoke-test.py` PASS on actual Compose Database/S3/FTP, as detailed in P1. No full backend unit/HA/10x campaign is claimed.
- `git diff --check` PASS; tracked changes restricted to frontend/ and the two owned frontend documents. develop stays at f5b2580a4a669a27d90ad91a2f1af2e199df018b; no merge/push.

Intermediate issues and resolutions: initial template extraction assigned category to WorkspaceStore instead of UploadController; compiler caught it and binding was corrected before successful build. The first populated-layout test had a strict text-selector timeout; changed to exact accessible name, then it exposed the real unbroken-heading overflow fixed above. The first Compose ML test read the incident select before Angular finished updating its value, making an empty ID match all cards; it now explicitly waits for a nonempty selection. Final live and full suites pass. These failed checks are not counted as successful runs.

Manual review: inspected actual desktop dashboard and mobile connection/incident captures, not just fixtures. Generated only fictitious storm incidents with the existing demo-data script; the capture session observed NORMAL then STORM snapshots and reported no browser page errors. Screenshots, JSON reports, logs, credentials and the local capture helper remain ignored under .runtime/. The ML worker is unpaused and the stack remains running. frontend/README.md documents local accounts, replayable checks, manual workflows, source layout and the startup readiness limitation.

Frontend stages are complete within the existing API. Historical-day statistics, global cluster exploration and automatic business alerts remain backend-contract dependencies. No synthetic measurements or global group identifiers were invented. The user can test the running UI at https://localhost:8443 using local .runtime/accounts.txt credentials. No further implementation is required in this authorized scope.

## Demo Command Center / Storage Decision Lab — 2026-11-14

User authorized the demo polish and local Policy Playground, on new branch feature/demo-command-center created directly from frontend-improvements at 96ed9fe. No assumptions about unpublished backend changes; only the local API and existing contract are consumed.

Storage Decision Lab: Explore reads active ordered rules/version and matching measured category/storage/operation data; no policy is hardcoded as active. Simulate is local-only and distinguishes target eligibility from the first matching active route. For eligible legacy logs, BOTH S3 and FTP are allowed; choosing a hypothetical alternative never changes the configured route. Missing rules/metrics remain unavailable/Not measured, and measured zeros remain visible. Known category constraints are explanatory guardrails, not replacement rules. YAML + API restart remain the only real configuration workflow. No API writes, policy editor or routing ML added.

Validation includes the existing regression suite and three new focused browser cases: offline Normal/Storm/Recovery + map/clusters/zoom, sensitive-document FTP rejection/no invented missing policy, and a real-shaped active S3 legacy rule staying S3 while FTP is only a hypothetical permissible alternative. Intermediate integration defects (tools navigation inserted in the login form, unneeded policy fetch on initial dashboard, long policy names overflowing at 320px) were corrected. One existing zone-text assertion was scoped to its original region to disambiguate the added map; no tests or coverage were removed.


Command Center delivery: schematic SVG with three region filters, zoom, proximity grouping, severity symbols/colors and selection details; missing live coordinates remain unpositioned. Readonly Live data remain limited to the current authorized API page. Demo Normal/Storm/Recovery fixtures are deterministic, synthetic and entirely local; no file download is offered for fixtures. Guest preview does not set a fake authenticated user or call API endpoints. Actual upload/download remains in the existing role-protected tools.

Navigation uses four primary destinations with existing quick tools preserved. Silent polling suppresses global loading flashes, avoids rewriting unchanged file/incident/reading arrays and preserves selected IDs; loaded file details update in place. Source labels distinguish the simulation from the operational API panels. Incident Journey distinguishes current storage/verification availability from independent asynchronous ML; no live transfer percentages or stage timestamps are invented. reduced-motion is respected. The supplied unrelated video was inspected through extracted local frames for spacing, cards, interactions and milestones only; no video/frames/branding/business functionality entered tracked source.

Validation: npm --prefix frontend run build PASS. Full production-served suite with FILEGRID_BASE_URL=https://localhost:8443 FILEGRID_LIVE=1 FILEGRID_COMPOSE_LIVE=1 passed 64/64, zero skipped/failed (original 61 plus three targeted cases). After final marker/aspect-ratio/focus styling, a rebuilt gateway passed the 8 targeted new/layout/live checks, including actual upload/reload/multipart recovery, verified download with ML paused/unpaused and four real roles. Offline screenshot review returned zero page errors and no horizontal overflow at 390px. Screenshots/logs/reports stay ignored in .runtime/.

Preserved all existing tests; only an existing region-name assertion was scoped to the business zone region because the new map also contains that name. Intermediate failed runs caught integration and responsive issues, fixed before delivery; a prototype arrow expression was moved out of the Angular template, and duplicate new-test labels were corrected. No failed run is represented as passing.

Commit 53b38ff contains the API-driven Policy Lab. Remaining Command Center changes are recorded in the subsequent local commit named feat(frontend): deliver command center demo scenarios and journey. Branch starts at 96ed9fe, not at any assumed unpublished backend revision. Existing backend/contracts/config/scripts remain unchanged; no merge or push performed. Latest gateway remains running for user preview.

CLEAN-MACHINE ONE-COMMAND STARTUP REMAINS AN UNVALIDATED ELIMINATORY REQUIREMENT. This branch does not fix the backend-owned readiness script or claim clean-start acceptance. No new backend endpoint or policy editor was introduced.
