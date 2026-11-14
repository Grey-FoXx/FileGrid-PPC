# BACKEND tasks — 2026-11-15

Owner: backend/, meter-simulator/, ml-service/, infra/, config/, contracts/, scripts/, .github/, Compose and shared technical docs. Do not implement the open items below without a newly approved scope; this review only records them.

| ID | Task | Dependency | Acceptance / evidence | State |
|---|---|---|---|---|
| BE01 | Compose, bootstrap, private storage | M0 | One-command isolated start; only gateway port published; all services healthy/running | VERIFIED_COMPOSE |
| BE02 | API, live routing, metadata, integrity | BE01 | Compose smoke all categories/DB/S3/FTP/SHA; policy v1→v2 live and v3 reset persisted | VERIFIED_COMPOSE |
| BE03 | Durable simulator/deduplication | BE02 | 2 journal tests, Compose replay/conflict and continuous simulator | VERIFIED_COMPOSE |
| BE04 | Multipart, encryption and authorization | BE02 | Private owner test in Compose; 1229 MiB and resume evidence remains native | PARTIAL_COMPOSE |
| BE05 | Async two-model ML | M1 core | 4 model tests + Compose COMPLETED analysis independent of file availability | VERIFIED_COMPOSE |
| BE06 | Docker access and Compose/TLS/vsftpd | User environment | Isolated `scripts/start.sh` returns Ready; smoke and API restart pass | DONE |
| BE07 | Complete security campaign/audit/key lifecycle | BE06 | Negative role/direct-storage/ciphertext tests and documented key rotation/recovery | TODO |
| BE08 | External automatic business alerts | BE02 | Trigger every table-2.1 risk and prove delivery/clear lifecycle; local UI warnings are insufficient | TODO |
| BE09 | Isolation at 10x and horizontal scaling | BE08 | Criteria in MILESTONES.md, raw measurements | TODO |
| BE10 | HA, backup restore and degraded-network campaign | BE09 | Durable acknowledgment/failover/recovery demonstrated | TODO |
| BE11 | Gaps/invalid-message/outage simulator scenarios | BE03 | Explicitly configurable scenarios and assertions | TODO |
| BE12 | Session/orphan cleanup and lease race hardening | BE04 | Concurrent expiration/retry/cancel tests; keep confirmed content intact | TODO |
| BE13 | Publish current checkpoint | Git authentication | Remote feature branch SHA equals local commit; no force push | IN_PROGRESS |
| BE14 | Complete PDF evidence presentation | BE08–BE10 | Re-run 10×, scale-out, netem, outage, HA/restore and attach raw measurements | TODO |
