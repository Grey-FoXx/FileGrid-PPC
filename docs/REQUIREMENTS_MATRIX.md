# Requirements traceability

States: PLANNED / IMPLEMENTED / VERIFIED / LIMITATION. VERIFIED requires recorded execution.

| ID | Source | Requirement | Owner | Milestone | Verification | State |
|---|---|---|---|---|---|---|
| F01 | PDF p2 | Four categories, manual UI and simulated meters | BE+FE | M1 | smoke + browser | PLANNED |
| F02 | PDF p2 | Separate, actually used Database/S3/FTP | BE | M1 | retrieve each destination | PLANNED |
| F03 | PDF p2 | Configurable policies | BE | M1 | change diagnostic route/restart | PLANNED |
| F04 | PDF p2 | Identical recovered bytes | BE | M1 | SHA-256 original/download | PLANNED |
| F05 | PDF p2 | One-command clean start | BE | M1 | scripts/start.sh on clean Docker | PLANNED |
| F06 | PDF p2 | UI upload/search/download | FE | M1 | browser E2E | PLANNED |
| F07 | PDF p2 | Continuous configurable simulator | BE | M1 | normal/spike/retry | PLANNED |
| F08 | PDF p2 | All source/config/scripts in Git | BE+FE | M1 | repository review | PLANNED |
| N01 | PDF p3 | 10x category isolation | BE | M4 | p95 <= +20%, errors < +1pp | PLANNED |
| N02 | PDF p3 | Scale by instances | BE | M4 | two APIs, no sticky sessions | PLANNED |
| N03 | PDF p3 | >1GB bounded resources | BE+FE | M4 | 1.2GiB, heap measurement | PLANNED |
| N04 | PDF p3 | p50/p95/p99, throughput, error rate | BE+FE | M3 | Prometheus/dashboard | PLANNED |
| N05 | PDF p3 | Operation tracing to storage | BE | M3 | correlation ID logs | PLANNED |
| N06 | PDF p3 | Automatic business alerts | BE+FE | M3 | trigger four alert types | PLANNED |
| N07 | PDF p3 | Private storage endpoints | BE | M1 | compose port scan | PLANNED |
| N08 | PDF p3 | TLS and authentication | BE+FE | M1/M3 | anonymous/wrong-role denied | PLANNED |
| N09 | PDF p3 | Direct storage cannot expose PII | BE | M1/M3 | ciphertext and authorization | PLANNED |
| N10 | PDF p3 | No secrets in Git | BE+FE | M1 | tracked-file review | PLANNED |
| N11 | PDF p3 | Storage failure isolation/no confirmed loss | BE | M4 | stop storage/restore/HA | PLANNED |
| N12 | PDF p3 | Retry/resume degraded connections | BE+FE | M4 | 200ms/2% loss | PLANNED |
| N13 | PDF p3 | No meter retry duplicates | BE | M1 | repeated/restarted simulator | PLANNED |
| N14 | PDF p3 | Corrupt recovery detected | BE | M1 | mutate stored bytes | PLANNED |
| B01 | PDF p4 | Routing explanation and useful statistics | BE+FE | M3 | normal/storm comparison | PLANNED |
| X01 | Team prompt | Two models + explainable Decision Agent | BE+FE | M2 | synthetic incidents | PLANNED |
| X02 | Team prompt | ML independent of availability | BE+FE | M2 | stopped ML worker | PLANNED |
