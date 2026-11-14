# Requirements traceability

States: PLANNED / IMPLEMENTED / VERIFIED / LIMITATION. VERIFIED requires recorded execution.

| ID | Source | Requirement | Owner | Milestone | Verification | State |
|---|---|---|---|---|---|---|
| F01 | PDF p2 | Four categories, manual UI and simulated meters | BE+FE | M1 | Compose smoke + browser | VERIFIED |
| F02 | PDF p2 | Separate, actually used Database/S3/FTP | BE | M1 | retrieve each destination | VERIFIED |
| F03 | PDF p2 | Configurable policies | BE+FE | M1 | live API/UI change, old/new session versions, restart persistence | VERIFIED |
| F04 | PDF p2 | Identical recovered bytes | BE | M1 | SHA-256 original/download | VERIFIED |
| F05 | PDF p2 | One-command clean start | BE | M1 | isolated scripts/start.sh + live health | VERIFIED_LOCAL |
| F06 | PDF p2 | UI upload/search/download | FE | M1 | browser E2E | VERIFIED |
| F07 | PDF p2 | Continuous configurable simulator | BE | M1 | rate/meters env, journal, normal/storm and replay | VERIFIED |
| F08 | PDF p2 | All source/config/scripts in Git | BE+FE | M1 | repository review | IMPLEMENTED |
| N01 | PDF p3 | 10x category isolation | BE | M4 | p95 <= +20%, errors < +1pp | PLANNED |
| N02 | PDF p3 | Scale by instances | BE | M4 | two APIs, no sticky sessions | PLANNED |
| N03 | PDF p3 | >1GB bounded resources | BE+FE | M4 | 1.2GiB, heap measurement | VERIFIED |
| N04 | PDF p3 | p50/p95/p99, throughput, error rate | BE+FE | M3 | Prometheus/dashboard | IMPLEMENTED |
| N05 | PDF p3 | Operation tracing to storage | BE | M3 | correlation ID logs | IMPLEMENTED |
| N06 | PDF p3 | Automatic business alerts | BE+FE | M3 | trigger and deliver table-2.1 risks | PLANNED; UI WARNINGS ONLY |
| N07 | PDF p3 | Private storage endpoints | BE | M1 | compose port scan | IMPLEMENTED |
| N08 | PDF p3 | TLS and authentication | BE+FE | M1/M3 | anonymous/wrong-role denied | IMPLEMENTED |
| N09 | PDF p3 | Direct storage cannot expose PII | BE | M1/M3 | ciphertext and authorization | VERIFIED |
| N10 | PDF p3 | No secrets in Git | BE+FE | M1 | ignored runtime + tracked-file scan | VERIFIED_LOCAL |
| N11 | PDF p3 | Storage failure isolation/no confirmed loss | BE | M4 | stop storage/restore/HA | PLANNED |
| N12 | PDF p3 | Retry/resume degraded connections | BE+FE | M4 | 200ms/2% loss | PLANNED |
| N13 | PDF p3 | No meter retry duplicates | BE | M1 | repeated/restarted simulator | VERIFIED |
| N14 | PDF p3 | Corrupt recovery detected | BE | M1 | mutate stored bytes | VERIFIED |
| B01 | PDF p4 | Routing explanation and useful statistics | BE+FE | M3 | normal/storm comparison | IMPLEMENTED |
| X01 | Team prompt | Two models + explainable Decision Agent | BE+FE | M2 | synthetic incidents | VERIFIED |
| X02 | Team prompt | ML independent of availability | BE+FE | M2 | stopped ML worker | VERIFIED |

Verification scope and UI/harness classification are detailed in `PDF_REQUIREMENTS_REVIEW.md`. Compose startup and minimum storage flows are now verified locally. N03 is still the historical 1229 MiB native fixture under a 512 MiB heap. N09 covers ciphertext and owner checks, not a complete penetration test. N01/N02/N06 remain open; N05/N11/N12 are partial.
