# Milestones and dependencies

M0: common baseline is published on origin/develop. M1/BH01: one-command Compose startup, all categories/storage, HTTPS and persistent restart verified. M2: minimal synthetic two-model demonstration runs in Compose independently of file availability.

## Approved backend hardening tranche

The user authorized BH02–BH06 after BH01. These stages preserve frontend/ and public contracts. Exact results and limits are in BH02_06_REPORT.md.

| Stage | Dependency | Deliverable | Acceptance evidence |
|---|---|---|---|
| BH02 | BH01 | Simultaneous four-category bounded baseline, reproducible latency/rate report | Real offered/completed rates, p50/p95/p99, bytes, errors and sample counts |
| BH03 | BH02 | Category admission budgets, dedicated verification workers, reserved SQL capacity | 300s baseline + 300s 10x spike; unaffected p95 <= +20%, error increase <1pp; report exact workload and any failed case |
| BH04 | BH02 | Queue/availability/integrity/gap/progress/ML metrics; Prometheus/Alertmanager/private authenticated receiver | Seven rule firing/resolution tests plus live end-to-end delivery; no frontend contract added |
| BH05 | BH01 | TLS-protected FTP, restricted S3 identity, scoped secrets, denial audit | Wrong CA/hostname/protocol and app bucket-admin denial; role/owner/idempotency integration checks |
| BH06 | BH03–BH05 | Restart/outage recovery, multipart replay, corruption, async ML, degraded-network checks | Exact recovered hashes and durable IDs; record SQL outage/global dependency; restore services in finally blocks |

## Remaining hackathon work

M3 completion still needs coordinated frontend alert presentation/API, broader trace/audit review and key/certificate lifecycle work. Backend alert delivery alone does not satisfy the UI requirement.

M4 beyond this tranche: two API instances with a measured gain under an API-limited workload; PostgreSQL synchronous standby and managed failover; backup restore; broader sustained/large-file/realistic category loads and full chaos/network-partition campaign. HA must preserve acknowledged meter readings. Native >1GB and local process restarts do not prove host-loss durability.

No milestone is declared complete merely because configuration exists. Acceptance must reference an executed result and its limitations.
