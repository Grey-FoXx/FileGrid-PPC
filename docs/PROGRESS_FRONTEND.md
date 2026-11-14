# FRONTEND handoff and revisions

## Policy/map correction — 2026-11-15

The older PPC notes below that describe policy download/manual YAML replacement are historical and superseded. On `feature/demo-command-center`, policies are now saved through the versioned backend API and applied immediately to new sessions; there is no YAML download or API restart in the active UI. A rejected/stale save keeps the draft and reliably renders the conflict.

Dense report groups now use adaptive, bounded placement constrained to the actual Romania polygon. When the map is saturated, markers may overlap rather than being displaced outside the country. Focused Playwright coverage passes 7/7, including 77 coincident groups inside Romania with maximum 140 px displacement, keyboard behavior, correct arrival target and reduced motion. Clean isolated one-command Compose startup is now verified by BACKEND at `https://localhost:20443`; external business-alert delivery and the 10× benchmark remain open.

# Historical frontend handoff — 2026-11-14

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

## PPC workspace revision — 2026-11-14

The user explicitly replaced the Command Center redesign with the previous six-section workspace and authorized immediate implementation. Branch remains `feature/demo-command-center`. Reverts `a922574` and `2fa2f01` restore the UI to the `96ed9fe` baseline while preserving history; the baseline browser coverage remains intact. No merge or backend/contract/configuration changes.

Implemented:
- PPC supplied logo, white/black/blue palette, larger rounded cards and controls; original navigation with overview renamed Acasă. Meter workflow is retained.
- Policy category selection and ADMIN-only native modal «O nouă politică», backdrop blur, browser focus containment/return, first-active-rule defaults, security routing guards, versioned configuration export and original-config download/reset. Export is JSON syntax compatible with YAML, for manual replacement of `config/storage-policies.yaml` followed by `docker compose restart api`; no save/apply endpoint is invented and no server configuration is changed by this UI.
- Whole-Romania Natural Earth public-domain country outline, approximate highlighting of Banat/Muntenia/Dobrogea, API-coordinate severity markers, arrival animation and keyboard selection. Proximity clusters require compatible event type, <=8 km and <=30 minutes pairwise; local DBSCAN labels are never treated as globally shared groups. Unlocated reports remain in the incident list. Incident cards remain independent of attachment and ML status, sorted by priority initially.
- One upload/report panel with optional incident attachment: metadata-only reporting or metadata creation followed by the existing robust upload controller. Confirmed incident context survives attachment errors; uncertain metadata-POST retries reuse the same in-memory idempotency key for unchanged data. Existing pause/resume/cancel/hash/download flows are preserved.
- Files show real category/storage/operation quantiles, throughput and error rates, explicit unmeasured combinations, category/file-selected animated milestones and actual upload request/correlation records captured in this browser session. Internal stage times are explicitly unavailable; no fabricated distributed traces or benchmark data. Captures are bounded and cleared with credentials.
- Acasă provides local Normal/Storm explanatory scenarios, separate live metrics, existing measured snapshots, and automatic browser warnings for errors in available data. External team alert delivery and real load generation are not claimed by the local toggle.
- Silent refresh retains displayed sections and stable incident/file arrays; map selection is preserved by ID, without global loading flashes. Motion respects reduced-motion preferences.

Backend coordination remains necessary for globally identified common-cause incident membership, server-side business alert delivery, historical benchmarks and internal per-operation stage timestamps. Incident coordinate/time fields are optional at the frontend boundary because actual runtime metadata includes them while the current OpenAPI response schema omits them. No API contract was changed.

**Eliminatory requirement still unvalidated:** clean-machine startup with one command. Rebuilding the existing local gateway is not this validation. The previously observed script readiness IPv6/IPv4 mismatch remains documented.

Validation for the PPC revision:
- `npm --prefix frontend run build`: PASS, production bundle; final log `.runtime/ppc-final-build.log`.
- `docker compose up --build -d --no-deps gateway`: PASS; frontend gateway rebuilt and left running at https://localhost:8443. Backend/ML/infrastructure source files unchanged.
- `FILEGRID_BASE_URL=https://localhost:8443 FILEGRID_LIVE=1 FILEGRID_COMPOSE_LIVE=1 npm --prefix frontend test -- --reporter=list,json`: **64 passed, 0 failed, 0 skipped** (1.8 minutes): all 61 baseline regressions plus three new focused PPC tests. Includes actual Database/S3/FTP recovery, ML-independent file availability, four human roles and multipart reload resume.
- The first development-server run had 54 pass/3 fail/4 skip: two selectors depended on the former single table / incident order and were scoped to the relevant table/card; one navigation was interrupted by HMR during parallel policy edits. The final stable production run passes all cases. No baseline tests were deleted or weakened. Three tests belonging to the explicitly reverted Command Center feature were removed by those revert commits.
- Visual browser inspection: home, whole-country map and native blurred policy modal. Existing responsive coverage checks 320/390/768/1440 px; keyboard/progress/download checks remain green. This is not a complete assistive-technology audit.
- `git diff --check`: PASS. New commit subject: `feat(frontend): restore six-section PPC workspace and incident workflows`.

## Live demo and persistent interventions — in progress

The user now explicitly requests backend-persisted Normal/Storm, reset and grouped intervention status. This extends the previous frontend-only implementation scope to the necessary API/ML additions, coordinated between implementation and frontend agents. The user clarified that reset may delete **only the new demo dataset**; all pre-existing data must remain.

The implementation preserves old API behavior without the opt-in demo scope, introduces a tagged synthetic dataset via `X-FileGrid-Demo: true`, and provides a separate all-data view. Before rollout, recorded all pre-existing file/incident IDs in ignored runtime files (20,060 files / 69 incidents / 19,985 readings) for preservation checks. The old local meter-simulator container was stopped to prevent unbounded ordinary-data growth; no existing records were deleted. Demo activation uses only the ignored local services.env setting; production feature defaults off.

### Delivery and validation

- Backend/API commit: `3a16d49` (`feat(api): add isolated demo scenarios and persistent incident interventions`). Adds migration V2, opt-in scope/registry and bounded server generator, compatible capability discovery, persistent group lifecycle and scope-aware queries. Coordinate this additive migration/API change with the backend computer before merging; unpublished migrations there have not been assumed available.
- Frontend: removed observed Normal/Storm snapshot panel, spaced zone totals, real server mode controls and reset, explicit Demo/All-data views, one-second Storm refresh, dedicated new-incident button, metadata-only reporting integrated with persistent groups, whole unresolved-group map, group-wide status controls/history and separate file/ML states. Critical safety markers remain visible independently of model completion. File journey now precedes the catalog, queries each category independently with pagination, preserves actual file selection, and uses SVG connectors in the same grid as the circles.
- Fixed a real-role initialization race found by the production tests: the workspace is displayed only after the demo capability/scope handshake completes, preventing a late login redirect from overriding upload navigation or resume after reload. Saved upload references are isolated by dataset and only demo references are removed on demo reset.
- Routing remains the existing deterministic Policy Engine; Random Forest/DBSCAN remain the two synthetic models, and the Decision Agent output is distinct. New DBSCAN member IDs support backend reconciliation, without claiming physical common cause or introducing an LLM. Generated aggregate transfer timings use `demo_upload` / `demo_multipart_upload`, keeping them separate from individual API part timings.

Final checks:
- `backend/./mvnw -q test`: **6 passed**, 0 failed/errors (3 API integration + 3 integrity/policy tests). Includes PostgreSQL model-member reconciliation, group lifecycle, roles, scoped seed/reset and preexisting resource retention. The initial run exposed shared-test database assumptions; tests now isolate the embedded database and explicitly create ordinary records to verify preservation.
- ML tests using current source mounted read-only in the ML dependency image, explicit Python entrypoint: **4 passed**. The initial host attempt lacked sklearn; no host pass is claimed. An incorrectly invoked Compose test command used the worker entrypoint; that temporary container was stopped and the explicit-entrypoint test rerun passed.
- Angular production build: PASS; API/gateway/ML images build and run successfully; `docker compose config --quiet`: PASS.
- Complete production-served browser command with `FILEGRID_BASE_URL=https://localhost:8443 FILEGRID_LIVE=1 FILEGRID_COMPOSE_LIVE=1`: **67 passed / 0 failed / 0 skipped**, including original upload/download/resume/role/ML-independent checks and three new focused cases. An earlier 65-pass/2-fail production run exposed the login handshake race; both real-role and multipart-reload cases pass after the fix. After the final safety-label clarification, the three new browser cases passed again and actual seeded home/map/critical signal/file journey were inspected in Chromium.
- Real scoped API/storage exercise: recovered all 13 files, checked all four categories and three storages with exact byte sizes/SHA-256, checked three drone sizes, metadata-only joins, inherited dispatched status, group-wide resolution/history, new group after resolution, incremental Storm and Normal stop, then reset/reseed. Verified **all 20,060 pre-existing file IDs and 69 incident IDs survived**.
- Final local handoff is Normal: **13 AVAILABLE files, 6 COMPLETED analyses, 4 readings, 3 NEW groups**, with generated timing units checked. No merge/push, no secrets or runtime artifacts committed. `git diff --check`: PASS.

Remaining explicit limitations: demonstration video-category fixtures are synthetic binary payloads, not playable codecs or >1 GB benchmarks; server grouping is statistical and requires human interpretation; external team alert delivery and clean-machine one-command startup remain unvalidated. This delivery does not mark those PDF requirements complete.
