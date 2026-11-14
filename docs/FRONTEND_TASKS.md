# FRONTEND tasks — delivery

Owner: frontend/, docs/FRONTEND_TASKS.md, docs/PROGRESS_FRONTEND.md. Do not change contracts/ or infrastructure unilaterally. Current authorization: user approved all remaining frontend stages (P1/P2) on feature/frontend-improvements; backend/contracts/infrastructure ownership remains unchanged.

| ID | Task | Dependency | Acceptance | State |
|---|---|---|---|---|
| FE-P0-AUTH | Isolate credentials, 401/403/network failures and concurrent refresh | Existing API | Current-account-only updates; independent section refresh; latest query wins; browser regressions | VERIFIED_FIXTURES |
| FE01 | Angular shell/authentication | M0 contract | Desktop/mobile auth workflows and production build | VERIFIED |
| FE02 | Upload, list/search and download | FE01 | Live encrypted-document and FTP upload, verified download | VERIFIED_NATIVE |
| FE03 | Hash worker/progress/resume | FE02 | Browser reload after confirmed 8 MiB part, same bytes recovered, no first-part retransmission | VERIFIED_COMPOSE |
| FE04 | Dispatcher and independent ML state | M2 API | Actual worker pause: AVAILABLE download verified with ML PENDING; resume yields COMPLETED and both models | VERIFIED_COMPOSE |
| FE05 | Baseline browser tests | FE02 | 3 fixtures tests + 1 live test pass | VERIFIED |
| FE06 | Keyboard/focus/progress accessibility and responsive layout | Existing UI | Skip link, focus return, validation, named progress and 320/390/768/1440 fixtures | VERIFIED_FIXTURES |
| FE07 | Robust transfer lifecycle, persisted idempotency, pause/resume/cancel and context recovery | Existing contract; FE-P0-AUTH | Worker/backoff/polling stop; multipart reload resume; terminal-session recovery; cancel reconciliation; account isolation; 26 fixture regressions | VERIFIED_FIXTURES |
| FE08 | Six standalone pages, shared workspace state and transfer controllers | FE05/P1 | One shell and API instance; upload lifecycle isolated; complete production-browser suite preserved | VERIFIED_COMPOSE_AND_FIXTURES |
| FE09 | Technical/business metrics and independent async states | Existing stats endpoints | B/s, operations/s, quantiles, errors, server window and zones; loading/empty/stale/error/retry | VERIFIED_FIXTURES |
| FE10 | Role-specific UX regression suite | Existing roles and fixtures | Four human roles request only permitted endpoints; denied/errors covered | VERIFIED_FIXTURES |
| FE11 | Normal/storm observed-session comparison and model explanation | Existing mode/metrics/analysis | Observed snapshots, separate model/decision panels and local-only cluster labels; historical days/global groups/alerts need BE contract | FRONTEND_AVAILABLE_API_COMPLETE; HISTORY_WAIT_BACKEND |


P0 delivery on feature/frontend-improvements: FE-P0-AUTH and FE07 completed locally. Only frontend/ and the two owned frontend documents changed. Build and 34 active browser tests pass; the live test remains skipped. P1 (FE06/FE09/FE10 and further dashboards/download UX) and P2 (FE08) have not started. Wait for user approval before continuing.


P1 completed after explicit continuation approval. Added download progress/cancellation/integrity guards, incident and meter pagination/filters, separate model outputs and decision metadata. Build and 54 active browser fixtures pass (1 live test omitted); real Compose smoke passes. FE08 modularization is next. Historical comparisons, global incident clusters and business alerts require coordinated backend contracts and are not fabricated in UI.


Final authorized delivery (2026-11-14): P0/P1/P2 frontend implementation complete against the existing API. Production build passes; all **61 browser tests pass with zero skipped/flaky/failed**, comprising 57 fixture/layout regressions and 4 actual Compose browser workflows. FE06/FE09/FE10 are covered by the complete production-served suite; FE07 includes actual 8 MiB + 19 byte multipart pause/reload/recovery. Services remain running at https://localhost:8443 for user testing. No backend, contract, infrastructure or develop changes were made.

Remaining backend dependencies: historical normal/day-versus-storm queries, global incident-group identifiers and business-alert delivery. FE11 uses explicitly labelled observed-session snapshots and analysis-local cluster labels. Existing startup script readiness resolves localhost to IPv6 inside gateway while Nginx serves IPv4; its timeout is documented in frontend/README.md, without claiming the script passed.

## PPC six-section revision (feature/demo-command-center)

User-authorized replacement of the Command Center navigation. The six-section baseline was restored through explicit revert commits before this implementation.

| Task | Delivered frontend behavior | Boundary |
|---|---|---|
| PPC shell | Acasă + original five sections, supplied PPC logo, blue/black/white, rounded and larger UI | Existing roles/functions retained |
| Policy form | Category → native blurred modal; security guards; versioned JSON/YAML-compatible config download; original config reset/download | ADMIN generation; manual config replacement + API restart; no save endpoint |
| Dispatcher map | Whole-country Romania outline; approximate three-region highlights; live API markers, severity colors, proximity clusters and keyboard details | Current filtered page; no inferred common-cause/global ML membership |
| Incident ingestion | One panel: metadata-only or optional attachment; confirmed incident reused on upload retry | Existing API/idempotency and robust transfer lifecycle |
| File observability | Real quantiles/throughput/errors; explicit missing measurements; category/file-selected animated milestones; captured request correlation IDs | No invented internal timings or comparable benchmarks |
| Acasă scenarios | Local Normal/Storm visual explanation; automatic browser warnings from actual error data | Real load, external team alert delivery and full business guarantees need separate validation |

Mandatory outstanding requirement: clean-machine startup through one command remains **UNVALIDATED**. Local production gateway rebuild does not satisfy it. Backend, infrastructure, contracts and runtime policy configuration were not edited.

Revision validation complete: Angular production build PASS; final production-served browser suite **64 passed / 0 failed / 0 skipped**, including all 61 retained baseline cases and three PPC-specific tests. Existing gateway updated for user testing at https://localhost:8443. No merge or push performed.
