# BACKEND tasks — checkpoint

Owner: backend/, meter-simulator/, ml-service/, infra/, config/, contracts/, scripts/, .github/, Compose and shared technical docs. BH01 alone was authorized and completed on feature/backend-hardening. BH02–BH06 require explicit approval to start; do not start them automatically.

| ID | Task | Dependency | Acceptance / evidence | State |
|---|---|---|---|---|
| BE01 | Compose, bootstrap, private storage | M0 | BH01: fresh application project, real containers, HTTPS and restart persistence pass | VERIFIED_DOCKER |
| BE02 | API, routing, metadata, integrity | BE01 | Real smoke covers all categories and DB/S3/FTP, checksum/corruption | VERIFIED_NATIVE |
| BE03 | Durable simulator/deduplication | BE02 | 2 journal tests, real replay/conflict and simulator execution | VERIFIED_NATIVE |
| BE04 | Multipart, encryption and authorization | BE02 | 1229 MiB, API restart resume, private document tests | VERIFIED_NATIVE |
| BE05 | Async two-model ML | M1 core | 3 model tests + live recommendations and paused worker | VERIFIED_NATIVE |
| BE06 / BH01 | Docker access and Compose/TLS/vsftpd | User environment | One-command startup, all-category checksum tests, live Angular login and restart persistence pass | VERIFIED_DOCKER |
| BE07 | Restricted MinIO account, FTPS, complete audit/authorization | BE06 | Negative access tests and no unencrypted personal content exposure | TODO |
| BE08 | Business alerts and complete metrics coverage | BE02 | Trigger configured alerts; documented quantile/rate definitions | TODO |
| BE09 | Isolation at 10x and horizontal scaling | BE08 | Criteria in MILESTONES.md, raw measurements | TODO |
| BE10 | HA, backup restore and degraded-network campaign | BE09 | Durable acknowledgment/failover/recovery demonstrated | TODO |
| BE11 | Gaps/invalid-message/outage simulator scenarios | BE03 | Explicitly configurable scenarios and assertions | TODO |
| BE12 | Session/orphan cleanup and lease race hardening | BE04 | Concurrent expiration/retry/cancel tests; keep confirmed content intact | TODO |
| BE13 | Publish checkpoint | User authentication | Initial checkpoint confirmed on origin/develop; BH01 local commit only, push not requested | INITIAL_CHECKPOINT_PUBLISHED |
