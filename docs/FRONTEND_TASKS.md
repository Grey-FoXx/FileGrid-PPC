# FRONTEND tasks — checkpoint

Owner: frontend/, docs/FRONTEND_TASKS.md, docs/PROGRESS_FRONTEND.md. Do not change contracts/ or infrastructure unilaterally. User requested stopping; these are handoff tasks, not permission to auto-start.

| ID | Task | Dependency | Acceptance | State |
|---|---|---|---|---|
| FE01 | Angular shell/authentication | M0 contract | Desktop/mobile auth workflows and production build | VERIFIED |
| FE02 | Upload, list/search and download | FE01 | Live encrypted-document and FTP upload, verified download | VERIFIED_NATIVE |
| FE03 | Hash worker/progress/resume | FE02 | Worker hash and persisted-session path implemented; restart covered at API level | IMPLEMENTED |
| FE04 | Dispatcher and independent ML state | M2 API | Live two-model results, pending/available separation | VERIFIED_NATIVE |
| FE05 | Baseline browser tests | FE02 | 3 fixtures tests + 1 live test pass | VERIFIED |
| FE06 | Keyboard/focus/progress accessibility | Existing UI | Accessible flows without contract changes; browser tests pass | TODO_INDEPENDENT |
| FE07 | Browser retry/pause/expired-session tests | Existing contract | Network interruption and reselect scenarios with fixtures | TODO_INDEPENDENT |
| FE08 | Split large component by existing pages/services | FE05 | Preserve one shell/client and all current workflows | TODO_INDEPENDENT |
| FE09 | Display existing throughput fields and async states | Existing stats endpoints | Real bytes/s and operations/s; no fabricated values | TODO_INDEPENDENT |
| FE10 | Role-specific UX regression suite | Existing roles and fixtures | Connection/field/dispatcher navigation and denied/error states | TODO_INDEPENDENT |
| FE11 | Normal/storm comparison and cluster exploration | Coordinated BE contract | Confirm contract before new APIs or global cluster identifiers | WAIT_BACKEND |
