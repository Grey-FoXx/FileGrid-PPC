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


## Demo Command Center — feature/demo-command-center

Explicit user approval covers Command Center, synthetic scenarios and local Policy Playground only; no backend/contracts/config/infrastructure changes or merge into develop.

| Task | Result | Evidence |
|---|---|---|
| Command Center | COMPLETE | Schematic offline SVG, three regions, keyboard markers, severity colors/symbols, proximity groups and selected detail panel |
| Demo scenarios | COMPLETE | Deterministic Normal/Storm/Recovery; offline guest preview does not authenticate or send API requests; Live uses only existing paginated API data |
| Storage Decision Lab | COMPLETE | API-driven active rules/version, observed metrics/Not measured, actual-file evidence, technologies/alternatives and separate local Simulate |
| Navigation/updates | COMPLETE | Four primary zones, role-aware existing tools, silent incremental polling and preserved selections |
| Incident Journey/polish | COMPLETE | File lifecycle separate from ML, no estimated live percentages/history; reduced motion, visual reference used only for presentation |
| Validation | COMPLETE | Production build, complete 64-test suite passed; final image 8 targeted/layout/live checks passed; no tests removed |
| One-command clean-machine startup | NOT VALIDATED — ELIMINATORY | Existing readiness limitation retained and documented; local success is not clean-machine acceptance |

Policy Playground does not edit config/storage-policies.yaml. Real changes still require YAML configuration and API restart. Historic benchmarks, costs and performance superiority are not inferred. Map groupings are independent of analysis-local ML cluster labels.
