# BACKEND handoff — BH01, 2026-11-14

Current branch: feature/backend-hardening; base f5b2580a4a669a27d90ad91a2f1af2e199df018b (confirmed on origin/develop). Obtain the BH01 commit with git rev-parse HEAD. User authorized BH01 only, followed by a local commit and stop. No push requested; no subagents used.

Changes: isolated FILEGRID_RUNTIME_DIR; live HTTP startup probes; API/gateway/FTP health checks and API-ready dependencies; explicit API curl/CA; bounded build parallelism; seed/recover Compose verification script. No frontend/, public contract or business-logic changes.

Actual stack: filegrid-bh01, runtime .runtime/bh01, HTTPS https://localhost:18443. PostgreSQL, MinIO, vsftpd, API, Nginx/Angular, simulator, ML and Prometheus are running; storage-init exited 0. Existing volumes/data were not deleted. Test stack and dedicated volumes are retained.

Passed: full image builds and startup; strict TLS/hostname and TLS1.3; DB/S3/FTP upload/download across all four categories; SHA-256 identity before/after full restart; persistent meter identity and ML result; repeated bootstrap preserves credentials/key/TLS; simulator ingestion; Prometheus scrape; real browser login/catalog. Initial IPv6 localhost gateway readiness failure fixed with 127.0.0.1 probes.

Detailed evidence and reproducible commands: BH01_REPORT.md. Original native/JUnit/Python results remain in VALIDATION.md. Stage BH01 did not repeat the native >1GB probe inside Docker and does not claim 10x isolation, alerts, HA or outage validation.

Docker group membership is now configured by the user. This IDE process still has old groups; sg docker successfully activates group 984 without changing socket permissions. Prefix every Compose operation with the same project/runtime/port variables.

Next proposed stage: BH02 baseline and simultaneous category measurements with actual offered/processed rates and resource budget. Await explicit user approval; do not start BH02–BH06 automatically.
