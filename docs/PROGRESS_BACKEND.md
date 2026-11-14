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

## Historical handoff — 2026-11-14

Checkpoint branch: develop. Initial architecture commit: 8ca20c0. Final checkpoint SHA is obtained with git rev-parse HEAD and reported in the session handoff.

Implemented: Spring Boot API/security, PostgreSQL schema, policies, actual DB/S3/FTP adapters, exact meter bytes/idempotency, durable simulator, AES-GCM documents, persistent multipart sessions, verification jobs, asynchronous two-model worker, basic metrics/audit and container/bootstrap configuration.

Checks: Maven package/4 JUnit tests; 2 simulator tests; 3 ML tests; native smoke on real PostgreSQL 17/MinIO/FTP; 1229 MiB streaming with -Xmx512m and SHA-256 identity; API restart resume; configurable routing change; FTP corruption and outage isolation; ML pause/recovery; live browser integration. Detailed measurements: VALIDATION.md.

Historical blockers recorded then: Docker socket permission and Git HTTPS credentials. Docker access and the Compose/vsftpd/TLS startup are now verified on this machine; publish status is reported from the current Git push attempt.

Contract notes: v1 OpenAPI follows implemented filters (files: category/status/search; meters: meterId; lists: page/size). Date filters are not implemented. No direct storage URLs. Synthetic ML is not operationally validated.

Work stopped by user request after checkpoint. No subagents were spawned. Do not resume implementation without a new instruction.
