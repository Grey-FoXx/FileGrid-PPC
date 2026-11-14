# Architecture

HTTPS gateway → Spring Boot → policy engine → PostgreSQL / MinIO / FTP. Angular is served at the same origin. Storage ports are not published. PostgreSQL also stores metadata, sessions, jobs and audit. No broker is required.

Small manual uploads use durable sessions and one binary PUT. Drone uploads use 8 MiB S3 multipart parts through FileGrid. Stored content is read back before AVAILABLE. Download verifies plaintext SHA-256 before a second streaming read. Personal document content uses AES-256-GCM, a unique nonce and an external persistent key. Immutable storage keys contain UUIDs, never customer names.

Meter JSON is stored byte-for-byte in PostgreSQL, with parsed indexed fields. Unique reading_id and (meter_id, sequence_number) enforce logical identity. Identical retries replay the result; changed payload returns 409. Simulator keeps original pending payloads in SQLite, on a persistent volume.

ML uses durable jobs and a private Python worker. Random Forest and spatiotemporal DBSCAN feed a deterministic Decision Agent. File status and ML status are independent. Synthetic models are demonstration-only.

PostgreSQL is a shared availability dependency in MVP. Named volumes survive process restart but do not provide high availability or host-loss protection. PostgreSQL HA remains a later milestone. Category isolation is measured under the bounded workloads recorded in BH02_06_REPORT.md.

## Backend hardening

HTTP category admission limits are configurable via FILEGRID_LIMIT_<CATEGORY>, CONTROL and INTERNAL. Defaults are 3/2/2/1 category requests, four control requests and one internal job request. Excess gets the existing 429 problem response and Retry-After: 1; reuse the original identity on retry. SQL pool defaults to 16 and must exceed all admission slots by at least three. This reserves capacity without claiming separate physical databases or CPU isolation.

VERIFY jobs run in separate incident/document/drone scheduled workers with atomic SKIP LOCKED claims. ML keeps its independent job lane. Availability timestamps, queue-age gauges, resumable-session activity and meter-gap observations support seven private Prometheus rules. Alertmanager forwards authenticated notifications to /internal/v1/alerts/receive, deduplicated by fingerprint in SQL. The gateway blocks this endpoint. There is no public alert contract.

FTP now runs a non-root pyftpdlib FTPS service on the preserved FTP data layout, requiring trusted TLS for control and data. A one-shot MinIO administrative helper provisions a restricted object account; API mounts only its own required secrets and never the runtime directory or root MinIO environment. Initializers exit after successful completion. Alertmanager adds one long-running monitoring service.
