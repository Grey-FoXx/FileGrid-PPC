# Decisions

| ID | Decision | Reason / tradeoff | Status |
|---|---|---|---|
| ADR-01 | Modular Spring backend | Avoid distributed coordination in a two-hour prototype | Accepted |
| ADR-02 | PostgreSQL jobs, no broker | Durable async verification/ML with existing dependency | Accepted |
| ADR-03 | All browser transfers proxy through API | Storage must remain private | Accepted |
| ADR-04 | 8 MiB S3 multipart | Bounded memory and persistent resume | Accepted |
| ADR-05 | Exact meter bytes plus parsed columns | Byte identity and business queries | Accepted |
| ADR-06 | AES-GCM before S3 | Storage access alone cannot expose personal documents | Accepted |
| ADR-07 | Basic over HTTPS in prototype | Stateless, minimal auth; credentials stay in browser memory | Accepted |
| ADR-08 | Two-pass download verification | Detect corruption before sending content; doubles storage reads | Accepted |
| ADR-09 | MinIO from fixed source commit | Community upstream archived/source-only; document maintenance limit | Accepted |

| ADR-10 | Prototype accounts in local properties; category metadata in files.context | Reduce schema/bootstrap work while preserving API; DATA_MODEL.md documents physical representation | Accepted for MVP |
| ADR-11 | Preserve MinIO built-in stale multipart cleanup | Pinned MinIO rejects AWS AbortIncompleteMultipartUpload lifecycle; tracked sessions also have application cleanup | Accepted with tests pending |
