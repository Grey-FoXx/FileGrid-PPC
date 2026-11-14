# Requirements traceability

States: PLANNED / IMPLEMENTED / VERIFIED / PARTIAL / LIMITATION. PARTIAL means an explicitly bounded subset is verified. VERIFIED requires recorded execution.

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
| N01 | PDF p3 | 10x category isolation | BE | BH02/03 | BH02_06_REPORT.md: 300s/phase, actual rates, p95/error/sample bounds | PARTIAL |
| N02 | PDF p3 | Scale by instances | BE | M4 | two APIs, no sticky sessions | PLANNED |
| N03 | PDF p3 | >1GB bounded resources | BE+FE | M4 | 1.2GiB, heap measurement | VERIFIED |
| N04 | PDF p3 | p50/p95/p99, throughput, error rate | BE+FE | BH02/04 | Histograms, SQL stats and measured baseline/spikes; UI scope separate | PARTIAL |
| N05 | PDF p3 | Operation tracing to storage | BE | BH04/05 | Correlated HTTP/storage/job logs and SQL operation IDs; no distributed tracer | PARTIAL |
| N06 | PDF p3 | Automatic business alerts | BE+FE | BH04 | Seven rule tests, live FIRING/RESOLVED webhook; public UI open | PARTIAL |
| N07 | PDF p3 | Private storage endpoints | BE | M1 | BH01 actual port bindings: gateway only | VERIFIED |
| N08 | PDF p3 | TLS and authentication | BE+FE | BH05 | Docker role/session/owner negatives, HTTPS/FTPS trust checks | VERIFIED |
| N09 | PDF p3 | Direct storage cannot expose PII | BE | M1/M3 | ciphertext and authorization | VERIFIED |
| N10 | PDF p3 | No secrets in Git | BE+FE | BH05 | Generated-runtime ignore and staged secret-value scan before commit | VERIFIED |
| N11 | PDF p3 | Storage failure isolation/no confirmed loss | BE | BH06/M4 | FTP/S3 isolation + recovery pass; SQL outage is global, HA open | PARTIAL |
| N12 | PDF p3 | Retry/resume degraded connections | BE+FE | BH06/M4 | Network runner/report; browser auto-retry still frontend scope | PARTIAL |
| N13 | PDF p3 | No meter retry duplicates | BE | M1 | repeated/restarted simulator | VERIFIED |
| N14 | PDF p3 | Corrupt recovery detected | BE | M1 | mutate stored bytes | VERIFIED |
| B01 | PDF p4 | Routing explanation and useful statistics | BE+FE | M3 | Measured comparison/report and existing stats; wider interpretation/UI open | PARTIAL |
| X01 | Team prompt | Two models + explainable Decision Agent | BE+FE | M2 | synthetic incidents | VERIFIED |
| X02 | Team prompt | ML independent of availability | BE+FE | M2 | stopped ML worker | VERIFIED |

Verification scope: historical native results are in VALIDATION.md; BH01_REPORT.md covers Docker MVP; BH02_06_REPORT.md records the hardened container campaign. N03 remains the native 1229MiB/512MiB-heap transport test, not a Docker large-video benchmark. N09 protects content; SQL filename/owner metadata is plaintext. N01 is bounded to measured synthetic traffic and shared local hardware. N06 backend delivery does not implement frontend alert presentation. N11 does not claim SQL HA or host-loss protection. N12 does not certify every browser/network failure combination. See LIMITATIONS.md before describing full PDF compliance.
