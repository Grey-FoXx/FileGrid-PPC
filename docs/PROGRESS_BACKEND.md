# BACKEND progress — 2026-11-15

Active reviewed branch: `feature/demo-command-center`.

Completed in the current review:

- clean isolated Docker Compose startup with generated runtime credentials/TLS and no deletion of existing volumes;
- all runtime paths can be isolated with `FILEGRID_RUNTIME_DIR`, and readiness checks both HTTPS gateway and the current API process over IPv4;
- live, persistent, versioned policy changes through API/UI; optimistic conflict handling; new sessions use the new policy while existing files retain their decision;
- dense incident groups use adaptive bounded placement constrained by the Romania polygon; 77 coincident groups remain in-country with bounded displacement;
- Compose smoke for all categories and all three storage types, SHA-256, document authorization, meter idempotency and async ML;
- API restart with persistent data and policy configuration.

Verification: one-command Compose PASS; smoke PASS; focused policy/map Playwright 7/7; Maven clean tests PASS; simulator 2/2; ML 4/4; Angular production build PASS. Exact scope and limitations are in `VALIDATION.md` and `PDF_REQUIREMENTS_REVIEW.md`.

Open requirements on this branch: measured 10× category isolation, horizontal scale-out, external automatic business alerts, complete per-hop tracing, storage-outage campaign in Compose, 200 ms/2% loss campaign, PostgreSQL HA/restore and a repeated >1 GB Compose run. These are not implied by demo controls or historical native evidence.

Publication: the reviewed changes were pushed normally, without force, to `origin/feature/demo-command-center`; confirm the final SHA with the Git status recorded at handoff.

## Historical handoff — 2026-11-14

Checkpoint branch: develop. Initial architecture commit: 8ca20c0. Final checkpoint SHA is obtained with git rev-parse HEAD and reported in the session handoff.

Implemented: Spring Boot API/security, PostgreSQL schema, policies, actual DB/S3/FTP adapters, exact meter bytes/idempotency, durable simulator, AES-GCM documents, persistent multipart sessions, verification jobs, asynchronous two-model worker, basic metrics/audit and container/bootstrap configuration.

Checks: Maven package/4 JUnit tests; 2 simulator tests; 3 ML tests; native smoke on real PostgreSQL 17/MinIO/FTP; 1229 MiB streaming with -Xmx512m and SHA-256 identity; API restart resume; configurable routing change; FTP corruption and outage isolation; ML pause/recovery; live browser integration. Detailed measurements: VALIDATION.md.

Historical blockers recorded then: Docker socket permission and Git HTTPS credentials. Docker access and the Compose/vsftpd/TLS startup are now verified on this machine; publish status is reported from the current Git push attempt.

Contract notes: v1 OpenAPI follows implemented filters (files: category/status/search; meters: meterId; lists: page/size). Date filters are not implemented. No direct storage URLs. Synthetic ML is not operationally validated.

Work stopped by user request after checkpoint. No subagents were spawned. Do not resume implementation without a new instruction.

## 2026-11-15 — configurable routing delivered locally

All four categories now accept DATABASE/S3/FTP through existing versioned policy endpoints. Removed the fixed route whitelist; added durable bounded multipart for Database/FTP (V5 blob_chunks), original-byte external meter storage with verification/rollback before ACK, actual storage metric labels and destination-aware cleanup. Document encryption/ownership and session routing snapshots remain enforced. FTP uses Compose init supervision following an observed daemon exit 139; subsequent large transport and final route campaign passed without restart.

Validation: Maven verify 10/10; actual service matrix 12/12; 1025 MiB Database and FTP exact-byte recovery with API RSS ~424/~453 MiB; simulator 3/3; ML 4/4 in worker dependencies; frontend production build and Compose config passed. See VALIDATION.md and POLICIES.md. API/gateway deployed locally at https://localhost:8443; original rules restored. Changes remain in the working tree; no commit/push was requested or performed.

## 2026-11-15 — main delivery preparation

Implementation commit: `5797b10` (configurable storage for every category). Remote documentation commit `8c6ae67` was merged without dropping local presentation commit `bd50993`; DOCUMENTATIE_IMPLEMENTARE.md and the presentation guide were reconciled with all 12 supported routes and current evidence. The complete frontend suite against the deployed production bundle passed: **73 passed, 5 explicitly opt-in live tests skipped** (78 total). The new real browser policy test had already passed separately. Backend verify: 10 passed; production builds, actual 12-route smoke, >1 GB Database/FTP and Python checks are recorded in VALIDATION.md. Target release branch: `main`, through a PR from `feature/demo-command-center`; no force push.
