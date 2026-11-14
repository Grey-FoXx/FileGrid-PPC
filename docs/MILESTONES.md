# Remaining milestones and dependencies

M0: contracts and collaboration baseline committed locally. M1: core implementation complete with native integration evidence; clean Compose acceptance is still pending. M2: minimal two-model asynchronous synthetic demonstration verified natively.

M3 depends on M1: Docker/TLS/container validation, FTPS, restricted S3 application account, complete audit and authorization tests, automatic business alerts, normal/storm comparison and key-management hardening. Acceptance: measured p50/p95/p99, throughput/errors for used category/storage combinations, traceable operations and deliberately triggered alerts delivered to the UI.

M4 depends on M1 and M3: category bulkheads and reserved budgets; two API instances; measured 10x campaign (other categories p95 <= +20%, errors < +1 percentage point); degraded network at 200ms/2% loss; PostgreSQL synchronous standby and managed failover; backup restore. The >1GB native transport and API-restart resume probes already pass, but do not replace these tests. Acceptance of scaling requires a measured gain under a documented API-limited workload; HA must preserve acknowledged readings.

No milestone is declared complete solely because its configuration exists. The user requested a checkpoint and stop; all future implementation requires a new explicit task.
