# BACKEND handoff — BH02–BH06, 2026-11-14

Branch: `feature/backend-hardening`. Published baseline: `f5b2580a4a669a27d90ad91a2f1af2e199df018b` on origin/develop. Prior local BH01: `68fb0146e15608aa952af7f1cb8dcc2a9215e6f9`. The user subsequently approved all BH02–BH06. Current checkpoint SHA is obtained with `git rev-parse HEAD` after commit; this report does not publish the branch or assume remote presence.

Implemented: bounded category admission and reserved SQL capacity; separate verification scheduling; queue/progress/gap/health/integrity metrics; private Prometheus → Alertmanager → token-protected deduplicated SQL alert receiver; FTPS trust/hostname checks and stable non-root server; restricted S3 app identity; scoped secrets; denial audit; storage recovery/DNS/error-framing fixes; security correlation before authentication. Public OpenAPI and frontend sources unchanged.

Deployment: retained `filegrid-bh01`, runtime `.runtime/bh01`, HTTPS https://localhost:18443. Nine long-running services: PostgreSQL, MinIO, FTPS (pyftpdlib), API, gateway/Angular, simulator, ML, Prometheus, Alertmanager. Storage initializer/provisioner exit 0. Volumes, old fixtures, generated accounts, AES key and gateway certificate retained. Docker access uses `sg docker` when the IDE process has stale groups; socket permissions were not changed.

Passed real Docker: repeated one-command startup, original BH01 exact-hash recovery, restricted S3/FTPS/ciphertext probes, auth/role/owner/session and concurrent exact/conflicting meter identities, API restart/multipart resume, FTP/S3 isolation/recovery, PostgreSQL recovery (global outage limitation), ML stopped while file AVAILABLE then eventual analysis, and sacrificial corruption detection/restoration. Seven rule cases and live gap-alert FIRING/RESOLVED pass. Python simulator2/ML3 pass. Final Maven count, 10x matrix, network impairment and final scope/secret checks are in BH02_06_REPORT.md and VALIDATION.md.

Important findings: vsftpd SIGSEGV on repeated FTPS connections was reproduced in two Debian variants; replaced the FTP service implementation while preserving the data layout. MinIO already-attached-policy error is now an idempotent provisioning success. Second download stream failure no longer leaves file Content-Length on an error body. Authentication refusals now receive the request correlation ID.

Acceptance and raw measurements: BH02_06_REPORT.md. Ignored runtime files retain fixture hashes, fault timings, isolation latency/rates/rows, resource samples, live alert and network results; no generated credentials or raw artifacts are committed.

Remaining: measured horizontal-scale gain, SQL HA, backup restore, broader realistic/large-file sustained campaigns, configurable simulator fault scenarios, cleanup/lease races, key/certificate renewal/rotation, coordinated public alert UI/API, operational ML validation. These are explicitly open and do not negate the bounded checks performed. See BACKEND_TASKS.md and LIMITATIONS.md.

Frontend may independently improve accessibility, 429/retry/resume tests using unchanged IDs, component organization, existing statistics presentation and per-role/ML-state UX on feature/frontend-improvements. See HANDOFF_SECOND_COMPUTER.md. Future public contract changes require joint agreement.
