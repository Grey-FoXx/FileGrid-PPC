# BH02–BH06 backend hardening — 2026-11-14

Branch: `feature/backend-hardening`, following local BH01 commit `68fb0146e15608aa952af7f1cb8dcc2a9215e6f9`. The user approved this entire tranche. Public contracts and frontend sources are unchanged. This report does not certify completion of every PDF requirement.

## Changes

- Configurable category admission with bounded 429 backpressure, reserved SQL capacity and separate verification workers. Meter identity and upload idempotency are preserved across retries.
- Availability/progress timestamps, verification and ML queue-age gauges, server-time meter gap detection, integrity and dependency health. Histograms cover storage operations including asynchronous verification; SQL statistics retain exact recorded durations. Definitions and PromQL are in OBSERVABILITY.md. Background logs carry the stored operation correlation ID.
- Seven Prometheus rules, private Alertmanager, authenticated private webhook, fingerprint deduplication and FIRING/RESOLVED persistence. No public alert API or UI was added.
- FTPS control/data protection, trusted certificate and hostname verification, restricted MinIO object identity, service-specific secret environments/mounts, independent transaction for denial audit, and secret-safe gateway logs.
- Bounded Docker DNS caching for service recovery. Download acquires its second storage stream before setting file headers, preventing malformed error bodies when that connection fails. Correlation runs before Spring Security, covering rejected requests too.
- Reproducible basic, outage, storage-security, isolation and network verification tools. Tests create synthetic fixtures and never remove retained volumes/data.

## Deployment and defects found

Retained project `filegrid-bh01`, runtime `.runtime/bh01`, gateway `https://localhost:18443`. Existing SQL/S3/FTP volumes, credentials, AES key and gateway TLS identity were preserved. Bootstrap migrates root-as-app MinIO settings without losing the old root identity; intermediate secret files are private from creation.

The Debian vsftpd containers repeatedly exited with SIGSEGV/code 139 during FTPS reconnect probes (both Bookworm 3.0.3 and an independently tested Trixie 3.0.5). No upstream root cause is asserted. The service now uses pinned pyftpdlib 2.1.0, pyOpenSSL 26.4.0 and cryptography 50.0.2, requiring TLS >=1.2 as UID 1000 on the same FTP volume. Repeated FTPS operations and previously stored content passed after deployment.

Repeated MinIO policy attachment returned `XMinioAdminPolicyChangeAlreadyApplied`, initially blocking startup. The provisioner treats this exact condition as idempotent success. A subsequent complete one-command start passed. PostgreSQL migration V2 is additive; V1 was not rewritten.

Running: PostgreSQL, MinIO, FTPS, API, Nginx/Angular, meter simulator, ML worker, Prometheus and Alertmanager. Initializers `storage-init` and `minio-provision` complete successfully and exit. Only gateway port 18443 is published.

## Executed checks

- Maven package/integration: see VALIDATION.md for final count. Real embedded PostgreSQL 17; external storage mocked in Java. Coverage includes policy/integrity, FTPS trust, category admission, alert token/dedup/resolution, meter-gap grace and late arrivals, failed second download stream and security correlation.
- Simulator: 2 unittest cases pass. ML: 3 unittest cases pass.
- Seven promtool alert-rule cases pass, each checking FIRING and resolution. Live Prometheus rule health is OK; Alertmanager is ready.
- Live meter-gap alert delivered through Prometheus → Alertmanager → authenticated API → SQL, then resolved after 90 late synthetic readings closed the owned diagnostic meter gaps. `.runtime/bh01/alert-live.json` records the result. This did not modify real meter readings.
- `verify-compose.py recover` passes for the original BH01 fixtures, all four categories and all three storage destinations with exact SHA-256.
- `verify-storage-security.py` passes: API has no root MinIO credentials or administrative secret mounts; TLS1.0/1.1 and wrong hostname rejected; trusted TLS1.2 accepted; actual stored private document ciphertext differs from plaintext and includes GCM overhead; app bucket listing/policy read/bucket creation forbidden.
- `verify-hardening.py` basic and `--faults` pass against real Docker services. Role/owner/session checks, invalid internal worker token, concurrent exact/conflicting meter identity and incident replay are exercised.
- API restart preserves confirmed multipart parts; resume and recovered SHA-256 pass. During FTP or MinIO outage, the other storage's acknowledged fixtures remain readable; original affected fixtures recover after restart. Measured recovery reads after restart were <=0.49s FTP and <=0.53s MinIO in this run. IPs were unchanged: this is not a Docker address-change/failover proof.
- PostgreSQL restart recovers exact content (<=0.495s measured read after readiness). SQL outage is a global metadata outage, not HA.
- With ML stopped, new incident file becomes AVAILABLE and remains readable while ML is pending; analysis completes after worker restart.
- Deliberately corrupted **new sacrificial FTP fixture** returns an integrity failure and becomes CORRUPTED. Original fixture bytes are restored in `finally` and rehashed; the SQL quarantine state is intentionally retained. Existing user data is untouched.

## BH02/BH03 workload and interpretation

Open-loop per-category arrivals, bounded independent client pools, up to four client workers/eight in-flight operations per category, TLS certificate verified. Every manual-file operation includes session creation, upload, completion, availability wait and verified download. Meter payloads use stable IDs and contiguous per-meter sequences. Retrying retains the original logical identity.

Each case: 300-second baseline and 300-second spike. Baseline rates: meters 2/s, incidents 0.1/s, private documents 0.1/s, drones 0.1/s, with the existing simulator also running. Spike multiplies one rate by 10. Fixtures: meter approximately 0.9KiB JSON, incident 1MiB, document 256KiB, drone 8MiB+17 bytes. These bound transport/isolation tests, not realistic 100MiB–1GiB video throughput.

Acceptance: actual offered spike ratio >=9.5; at least 20 successes per unaffected category/phase; unaffected p95 ratio <=1.20; logical terminal error-rate increase <0.01; all offered operations eventually succeed. Report includes within-window completed rate, drain/queue time and end-to-end p50/p95/p99. Terminal operation errors differ from physical HTTP retry/backpressure counts; report those separately.

Machine: Intel Core i7-13650HX, 20 logical CPUs, about 15GiB RAM, shared local development workload. API container 1GiB memory limit, Java MaxRAMPercentage 65; ML 512MiB. Resource sampling uses Docker stats. Finite sample counts (30 baseline manual operations/phase) limit p99 confidence; no universal performance guarantee follows.

<!-- ISOLATION_RESULTS -->

## Reproduce safely

From repository root, keep project/runtime/port together. If the IDE has stale groups, wrap Docker-dependent commands with `sg docker -c '...'`. Never use `down -v`, prune or unguarded fault scripts.

```bash
COMPOSE_PROJECT_NAME=filegrid-bh01 FILEGRID_RUNTIME_DIR=.runtime/bh01 FILEGRID_HTTPS_PORT=18443 COMPOSE_BAKE=false ./scripts/start.sh
python3 scripts/verify-compose.py recover
python3 scripts/verify-storage-security.py
python3 scripts/verify-hardening.py
# Exclusive mutation window only; stops/restarts this isolated project's services:
python3 scripts/verify-hardening.py --faults
# One case at a time, enough free disk; fixtures are retained:
python3 scripts/isolation-test.py --spike INCIDENT --seconds 300 --report .runtime/bh01/isolation-incident.json
```

Other spike choices: METER_READING, CONNECTION_DOCUMENT, DRONE_VIDEO. Do not benchmark during builds, restarts or fault injection. Runtime JSON/logs and generated accounts are ignored, not published. The commit hash is reported separately after this document is committed. The 40-minute benchmark ran on API image sha256:49647cbb17255f0c921649d92290edf4570204a94b06b60f14573e5da67a00e7. The subsequent final rebuild additionally places correlation before authentication and makes bootstrap temporary secrets private at creation; these changes do not alter category budgets, storage scheduling or workload.

## Remaining work

See LIMITATIONS.md and BACKEND_TASKS.md. Horizontal scaling, SQL HA/backup restore, general host/network partitions, long-duration realistic large-video loads, key/certificate rotation, coordinated frontend alert UI/API and operational ML validation remain outside the verified scope. Current Basic authentication and local single-key storage are a prototype security model.
