# Verification record

## Compose and live-policy review — 2026-11-15

Isolated project: `filegrid-review-ready`, runtime directory `.runtime/review`, URL `https://localhost:20443`. No pre-existing volume was deleted.

| Check | Result | Boundary |
|---|---|---|
| `scripts/start.sh` | PASS | One command built/bootstraped the isolated project and returned Ready only after HTTPS gateway and current API health passed |
| Compose services | PASS | PostgreSQL, MinIO, FTP/vsftpd, API, gateway/Angular, meter simulator, ML worker and Prometheus are running; storage-init exited 0 |
| Compose smoke | PASS | All four categories; DATABASE, FTP and S3; exact downloaded bytes/SHA-256; meter replay/conflict; second document owner denied; ML completed asynchronously |
| Live policy update | PASS | Existing legacy file remained FTP/v1; new file became S3/v2 without restart; defaults restored as v3; API restart retained the persisted configuration |
| API restart/data volumes | PASS | API health returned after restart with the same PostgreSQL/MinIO/FTP volumes and previously completed smoke data still present |
| Focused browser policy/map suite | PASS: 7/7 | Live save/conflict/role behavior; coincident groups; 77 dense groups remain inside Romania and within 140 px; arrival target; reduced motion |
| Angular production build | PASS | Production bundle built before Compose image creation and independently during this review |
| Maven clean test | PASS: 7/7 | 4 API integration + 3 integrity/policy tests; embedded PostgreSQL migrations v1–v3 |
| Simulator unittest | PASS: 2/2 | Stable sequence/original bytes and rejected-event retention |
| ML unittest | PASS: 4/4 | Spatial/temporal members, missing coordinates, safety override |

Corrections made from evidence: runtime paths are parameterized by `FILEGRID_RUNTIME_DIR`; the readiness probe uses IPv4 and checks the live API with `curl`; the API runtime image now contains `curl`. The map uses the actual Romania polygon and a bounded adaptive layout rather than only a rectangular bounding box.

Persistence was rechecked with the simulator temporarily stopped: after restarting PostgreSQL, MinIO, FTP, API, gateway, ML and Prometheus, a pre-existing file ID still existed, the file count had not decreased, and policy version v3 was unchanged. The simulator was then resumed. An earlier strict count comparison across a full restart was discarded because restarting the simulator legitimately creates new readings.

Not newly certified in this run: 10× cross-category isolation, two-instance scaling, external automatic alerts, 200 ms/2% network impairment, PostgreSQL HA/backup restore, and a >1 GB Compose transfer. The historical 1229 MiB native result below remains valid evidence for streaming but was not repeated because only approximately 2.5 GiB was free locally. See `PDF_REQUIREMENTS_REVIEW.md`.

## Native checkpoint — 2026-11-14

## Automated checks

| Check | Result | Boundary |
|---|---|---|
| Maven package + JUnit | PASS: 4 tests | 3 integrity/policy/crypto tests and 1 multi-scenario API integration test; real PostgreSQL 17.6, external Storage mocked |
| Angular production build | PASS | Angular 22.2.6, Node 24.15.0; includes Web Worker |
| Playwright | PASS: 4 tests | 3 contract-fixture UI tests + 1 live browser workflow against the native API/storage stack |
| Simulator unittest | PASS: 2 tests | Exact pending bytes and sequence survive SQLite reopen; rejected payload retained |
| ML unittest | PASS: 3 tests | Safety override, spatiotemporal clustering, missing coordinates |
| OpenAPI 3.0 validation | PASS | openapi-spec-validator 0.7.2 |
| Docker Compose config | PASS | Syntax and service wiring only; no daemon required |
| Shell syntax and Git whitespace | PASS | start.sh, fault-test.sh, diff --check |

The live browser workflow previously failed when a running executable JAR was overwritten by a concurrent Maven package. Restarting from a separate immutable runtime copy resolved the harness failure. This is not treated as a successful failed run; the final fresh-snapshot run is the result reported above.

## Real native services

Because Docker socket access is denied, integration was executed with separate local processes: PostgreSQL 17.6, MinIO built from the fixed source commit in its Dockerfile, and pyftpdlib 2.1.0 FTP. The production Compose FTP container uses vsftpd; that container remains unverified.

Passed:

- Database meter ingestion/recovery preserves original bytes; identical retry is a duplicate response; changed payload is rejected.
- Actual FTP diagnostic upload/download, actual S3 diagnostic upload/download, encrypted connection document recovery, multipart drone-category recovery.
- Different document owner receives 403. Anonymous MinIO bucket listing receives 403.
- Intentional mutation of an FTP fixture is detected before content delivery and marks the file CORRUPTED.
- Database and S3 recovery continue while the FTP process is suspended.
- Two synthetic models produce versioned results; critical safety rule overrides scores.
- With ML suspended: file AVAILABLE / ML PENDING. Restoring the worker completes analysis.
- Actual API process restart after part 1: persisted session resumes with part 2 and SHA-256 matches.
- A configuration-only change to policy v2 routes a new eligible legacy log to S3; an existing session retains policy v1. Tracked policy restored to v1.
- Browser connected to real API: private document upload/download with byte comparison, legacy diagnostic upload to FTP, desktop/mobile rendering.

## Large transport fixture

Actual upload, verification and streamed recovery:

- Size: **1,288,699,904 bytes** (1229 MiB).
- Multipart: **154 parts**, including replay of a confirmed first part.
- SHA-256: `6843f475f051d40b5423719a2a4938ffa200dc8806f67a943156782996491ed1`.
- Backend JVM limit: **-Xmx512m**.
- Observed peak API RSS: **644,526,080 bytes**, approximately 615 MiB.
- Elapsed upload + verification + recovery: **39.27 seconds** on this machine, in the native harness.

This is a bounded-memory transport demonstration using synthetic bytes, not a codec test, generalized throughput benchmark, or validation of Docker memory limits.

## Not verified at the 2026-11-14 checkpoint

Clean Docker startup, container-level TLS/permissions/health checks, the vsftpd image, GitHub Actions execution, 10x category isolation, horizontal-scale throughput gain, degraded network campaign, PostgreSQL HA, backup restore, automatic alerts and complete audit coverage.

No secrets or raw test logs are committed. Local screenshots and generated credentials remain under ignored `.runtime/`; Playwright artifacts are ignored.
