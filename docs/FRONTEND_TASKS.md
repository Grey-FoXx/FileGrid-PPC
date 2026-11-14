# FRONTEND tasks — checkpoint

Owner: frontend/, docs/FRONTEND_TASKS.md, docs/PROGRESS_FRONTEND.md. Do not change contracts/ or infrastructure unilaterally. Current authorization: user approved all remaining frontend stages (P1/P2) on feature/frontend-improvements; backend/contracts/infrastructure ownership remains unchanged.

| ID | Task | Dependency | Acceptance | State |
|---|---|---|---|---|
| FE-P0-AUTH | Isolate credentials, 401/403/network failures and concurrent refresh | Existing API | Current-account-only updates; independent section refresh; latest query wins; browser regressions | VERIFIED_FIXTURES |
| FE01 | Angular shell/authentication | M0 contract | Desktop/mobile auth workflows and production build | VERIFIED |
| FE02 | Upload, list/search and download | FE01 | Live encrypted-document and FTP upload, verified download | VERIFIED_NATIVE |
| FE03 | Hash worker/progress/resume | FE02 | Worker hash and persisted-session path implemented; restart covered at API level | IMPLEMENTED |
| FE04 | Dispatcher and independent ML state | M2 API | Live two-model results, pending/available separation | VERIFIED_NATIVE |
| FE05 | Baseline browser tests | FE02 | 3 fixtures tests + 1 live test pass | VERIFIED |
| FE06 | Keyboard/focus/progress accessibility and responsive layout | Existing UI | Skip link, focus return, validation, named progress and 320/390/768/1440 fixtures | VERIFIED_FIXTURES |
| FE07 | Robust transfer lifecycle, persisted idempotency, pause/resume/cancel and context recovery | Existing contract; FE-P0-AUTH | Worker/backoff/polling stop; multipart reload resume; terminal-session recovery; cancel reconciliation; account isolation; 26 fixture regressions | VERIFIED_FIXTURES |
| FE08 | Split large component by existing pages/services | FE05 | Preserve one shell/client and all current workflows | TODO_INDEPENDENT |
| FE09 | Technical/business metrics and independent async states | Existing stats endpoints | B/s, operations/s, quantiles, errors, server window and zones; loading/empty/stale/error/retry | VERIFIED_FIXTURES |
| FE10 | Role-specific UX regression suite | Existing roles and fixtures | Four human roles request only permitted endpoints; denied/errors covered | VERIFIED_FIXTURES |
| FE11 | Normal/storm observed-session comparison and model explanation | Existing mode/metrics/analysis | Observed snapshots, separate model/decision panels and local-only cluster labels; historical days/global groups/alerts need BE contract | FRONTEND_AVAILABLE_API_COMPLETE; HISTORY_WAIT_BACKEND |


P0 delivery on feature/frontend-improvements: FE-P0-AUTH and FE07 completed locally. Only frontend/ and the two owned frontend documents changed. Build and 34 active browser tests pass; the live test remains skipped. P1 (FE06/FE09/FE10 and further dashboards/download UX) and P2 (FE08) have not started. Wait for user approval before continuing.


P1 completed after explicit continuation approval. Added download progress/cancellation/integrity guards, incident and meter pagination/filters, separate model outputs and decision metadata. Build and 54 active browser fixtures pass (1 live test omitted); real Compose smoke passes. FE08 modularization is next. Historical comparisons, global incident clusters and business alerts require coordinated backend contracts and are not fabricated in UI.
