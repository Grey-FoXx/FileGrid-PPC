# FileGrid PPC

Unified ingestion and verified recovery of smart-meter readings, incidents, private connection documents and drone videos. Spring Boot + Angular + PostgreSQL + MinIO + separate FTP, launched with Docker Compose.

## Start

Prerequisites: Docker Engine with usable daemon access, Docker Compose v2, internet for the initial image builds, 16GB RAM and 20GB free disk.

```bash
./scripts/start.sh
```

Open https://localhost:8443 and trust the locally generated certificate for this demo. Credentials are generated in `.runtime/accounts.txt`; no passwords or encryption keys are tracked. Do not delete `.runtime/` while retaining storage volumes: it contains the decryption key. Storage ports are private.

## Collaboration

Read [AGENTS.md](AGENTS.md), [architecture](docs/ARCHITECTURE.md), [API contract](contracts/openapi.yaml), [integration](docs/INTEGRATION_CONTRACT.md), [test plan](docs/TEST_PLAN.md), [demo](docs/DEMO_PLAN.md) and [limitations](docs/LIMITATIONS.md).

BACKEND owns API/contracts/infrastructure/simulator/ML; FRONTEND owns Angular and browser checks. Both start from the same initial Git commit. No incompatible contract changes without coordination.

## Milestones

M0 common scaffold → M1 four-category MVP → M2 synthetic asynchronous ML demo. M3 security/observability and M4 measured scalability/resilience remain explicit further milestones. Last 30 minutes of the two-hour target are reserved for validation.
