# BACKEND tasks — hardening checkpoint

Owner: backend/, meter-simulator/, ml-service/, infra/, config/, contracts/, scripts/, .github/, Compose and shared technical docs. Current branch: feature/backend-hardening. User approved BH02–BH06; frontend stays on feature/frontend-improvements. Do not change public contracts unilaterally.

| ID | Task | Dependency | Acceptance / evidence | State |
|---|---|---|---|---|
| BE01 / BH01 | Compose, bootstrap, private storage, TLS, persistence | M0 | BH01 report + hardened repeat start and original fixture recovery | VERIFIED_DOCKER |
| BE02 | API/routing/metadata/SHA-256 | BE01 | Real Docker four-category DB/S3/FTP recovery | VERIFIED_DOCKER |
| BE03 | Durable simulator/deduplication | BE02 | Two journal tests; live replay and concurrent exact/conflicting identities | VERIFIED |
| BE04 | Multipart/document encryption/authorization | BE02 | Docker API-restart resume, owner/role/session checks, ciphertext; native 1229MiB | VERIFIED_WITH_LIMITS |
| BE05 | Async two-model ML | M1 | Three model tests; Docker ML outage preserves AVAILABLE then completes | VERIFIED_SYNTHETIC |
| BE07 / BH05 | Restricted MinIO identity, FTPS, denial audit | BH01 | Protocol/trust/permission/mount/owner tests; retained FTP volume | VERIFIED_WITH_LIMITS |
| BE08 / BH04 | Metrics and business alert backend | BH02 | Seven rule firing/resolution cases; live alert delivery/resolution | VERIFIED_BACKEND; coordinated UI/API open |
| BE09 / BH02–03 | Category bulkheads and measured 10x campaign | BH01 | BH02_06_REPORT.md, raw ignored JSON; shared-resource limits | SEE_REPORT |
| BE10a / BH06 | Storage/API/SQL/ML restart, integrity and retry recovery | BH03–05 | Real Docker fault runner, same confirmed hashes, all services restored | VERIFIED_RESTART; no HA |
| BE10b | Horizontal scaling, SQL HA, backup restore | BE09 | Two APIs gain, acknowledged-reading failover, restore rehearsal | TODO_SEPARATE_MILESTONE |
| BE10c | Degraded network | BE10a | Guarded 200ms/2% runner, exact hashes and stable IDs; see report | SEE_REPORT |
| BE11 | Simulator configurable gaps/invalid/outage scenarios | BE03 | Gap detection exists; full scenario generation/assertions still needed | TODO |
| BE12 | Session/orphan cleanup and lease races | BE04 | Concurrent expiration/retry/cancel tests; preserve confirmed content | TODO |
| BE14 | Key/certificate lifecycle and wider audit review | BH05 | Renewal, encrypted backup/restore and rotation rehearsal | TODO |
| BE15 | Coordinated public alert read/ack contract | BH04 + FE coordination | Agree authorization/pagination/semantics, then API and UI together | TODO_COORDINATE |
| BE13 | Publish current checkpoint | User Git authentication | Initial baseline published; current branch remains local until explicit publish | LOCAL |

Do not infer that verified recovery satisfies continuous PostgreSQL availability, horizontal scaling, universal isolation, operational ML validation or full hackathon completion. Retain the local volumes and generated keys; never commit them.
