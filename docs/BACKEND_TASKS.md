# BACKEND tasks — checkpoint

Owner: backend/, meter-simulator/, ml-service/, infra/, config/, contracts/, scripts/, .github/, Compose and shared technical docs. All work is paused at the user's checkpoint request; do not start remaining tasks automatically.

| ID | Task | Dependency | Acceptance / evidence | State |
|---|---|---|---|---|
| BE01 | Compose, bootstrap, private storage | M0 | Static config passes; native storages work; actual clean container start pending | PARTIAL |
| BE02 | API, routing, metadata, integrity | BE01 | Real smoke covers all categories and DB/S3/FTP, checksum/corruption | VERIFIED_NATIVE |
| BE03 | Durable simulator/deduplication | BE02 | 2 journal tests, real replay/conflict and simulator execution | VERIFIED_NATIVE |
| BE04 | Multipart, encryption and authorization | BE02 | 1229 MiB, API restart resume, private document tests | VERIFIED_NATIVE |
| BE05 | Async two-model ML | M1 core | 3 model tests + live recommendations and paused worker | VERIFIED_NATIVE |
| BE06 | Resolve Docker access and validate Compose/TLS/vsftpd | User environment | One-command startup on clean host; smoke + live UI on containers | TODO |
| BE07 | Restricted MinIO account, FTPS, complete audit/authorization | BE06 | Negative access tests and no unencrypted personal content exposure | TODO |
| BE08 | Business alerts and complete metrics coverage | BE02 | Trigger configured alerts; documented quantile/rate definitions | TODO |
| BE09 | Isolation at 10x and horizontal scaling | BE08 | Criteria in MILESTONES.md, raw measurements | TODO |
| BE10 | HA, backup restore and degraded-network campaign | BE09 | Durable acknowledgment/failover/recovery demonstrated | TODO |
| BE11 | Gaps/invalid-message/outage simulator scenarios | BE03 | Explicitly configurable scenarios and assertions | TODO |
| BE12 | Session/orphan cleanup and lease race hardening | BE04 | Concurrent expiration/retry/cancel tests; keep confirmed content intact | TODO |
| BE13 | Secure GitHub authentication and publish checkpoint | User authentication | Remote develop SHA equals local commit, no force push | BLOCKED_AUTH |
