# Requirements traceability

States: PLANNED / IMPLEMENTED / VERIFIED / LIMITATION. VERIFIED requires recorded execution.

| ID | Source | Requirement | Owner | Milestone | Verification | State |
|---|---|---|---|---|---|---|
| F01 | PDF p2 | Four categories, manual UI and simulated meters | BE+FE | M1 | BH01 Docker smoke + live browser | VERIFIED |
| F02 | PDF p2 | Separate, actually used Database/S3/FTP | BE | M1 | retrieve each destination | VERIFIED |
| F03 | PDF p2 | Configurable policies | BE | M1 | change diagnostic route/restart | VERIFIED |
| F04 | PDF p2 | Identical recovered bytes | BE | M1 | SHA-256 original/download | VERIFIED |
| F05 | PDF p2 | One-command clean start | BE | M1 | BH01 scripts/start.sh with fresh application runtime/volumes | VERIFIED |
| F06 | PDF p2 | UI upload/search/download | FE | M1 | browser E2E | VERIFIED |
| F07 | PDF p2 | Continuous configurable simulator | BE | M1 | normal/spike/retry | VERIFIED |
| F08 | PDF p2 | All source/config/scripts in Git | BE+FE | M1 | repository review | IMPLEMENTED |
| N01 | PDF p3 | 10x category isolation | BE | M4 | p95 <= +20%, errors < +1pp | PLANNED |
| N02 | PDF p3 | Scale by instances | BE | M4 | two APIs, no sticky sessions | PLANNED |
| N03 | PDF p3 | >1GB bounded resources | BE+FE | M4 | 1.2GiB, heap measurement | VERIFIED |
| N04 | PDF p3 | p50/p95/p99, throughput, error rate | BE+FE | M3 | Prometheus/dashboard | IMPLEMENTED |
| N05 | PDF p3 | Operation tracing to storage | BE | M3 | correlation ID logs | IMPLEMENTED |
| N06 | PDF p3 | Automatic business alerts | BE+FE | M3 | trigger four alert types | PLANNED |
| N07 | PDF p3 | Private storage endpoints | BE | M1 | BH01 actual port bindings: gateway only | VERIFIED |
| N08 | PDF p3 | TLS and authentication | BE+FE | M1/M3 | anonymous/wrong-role denied | IMPLEMENTED |
| N09 | PDF p3 | Direct storage cannot expose PII | BE | M1/M3 | ciphertext and authorization | VERIFIED |
| N10 | PDF p3 | No secrets in Git | BE+FE | M1 | tracked-file review | PLANNED |
| N11 | PDF p3 | Storage failure isolation/no confirmed loss | BE | M4 | stop storage/restore/HA | PLANNED |
| N12 | PDF p3 | Retry/resume degraded connections | BE+FE | M4 | 200ms/2% loss | PLANNED |
| N13 | PDF p3 | No meter retry duplicates | BE | M1 | repeated/restarted simulator | VERIFIED |
| N14 | PDF p3 | Corrupt recovery detected | BE | M1 | mutate stored bytes | VERIFIED |
| B01 | PDF p4 | Routing explanation and useful statistics | BE+FE | M3 | normal/storm comparison | IMPLEMENTED |
| X01 | Team prompt | Two models + explainable Decision Agent | BE+FE | M2 | synthetic incidents | VERIFIED |
| X02 | Team prompt | ML independent of availability | BE+FE | M2 | stopped ML worker | VERIFIED |

Verification scope: VERIFIED above refers to the native harness or explicitly recorded test in VALIDATION.md. It does not certify Compose startup or all subrequirements. F01 manual flows and simulator work natively; final container acceptance is pending. N03 is the 1229 MiB transport fixture under a 512 MiB heap. N09 verifies ciphertext and owner checks, not a comprehensive penetration test. N04/N05 and B01 are partial; alerts and normal/peak interpretation remain open.

BH01 update: Docker startup, actual vsftpd, HTTPS with trusted local certificate/hostname, all-category SHA-256 recovery, real Angular login and full-stack persistent restart are verified in BH01_REPORT.md. This supplements the older native scope note above; it does not upgrade N01/N02/N06/N11/N12 or complete the comprehensive N08/N09 security campaign.
