# FileGrid collaboration contract

One repository; source requirements: FileGrid PPC PDF pp. 1–4 and team master prompt. Never claim an unexecuted check passed.

## Ownership
BACKEND owns backend/, meter-simulator/, ml-service/, infra/, config/, contracts/, scripts/, docker-compose.yml and general architecture. FRONTEND owns frontend/, docs/FRONTEND_TASKS.md and docs/PROGRESS_FRONTEND.md. BACKEND owns its corresponding task/progress documents. Shared documentation changes are coordinated by the principal.

API source of truth: contracts/openapi.yaml. No unilateral incompatible contract changes. Changes require updated examples, integration notes and consumer coordination.

## Architecture invariants
Spring Boot modular backend, Angular UI, PostgreSQL, private MinIO, separate private FTP, Docker Compose. Files enter through FileGrid only. Meter acknowledgments follow durable commit; preserve original bytes and stable identities. All storage routing decisions are explainable and versioned. Personal documents are encrypted before storage. ML must NEVER gate file availability.

## Agents and Git
At most two subagents per computer: implementation and verification, no recursive delegation. Verification reports findings without concurrently rewriting implementation files. Work sequentially if subagents are unavailable. Do not assign both agents the same files.

Use feature/backend-core and feature/frontend-core, integrate through develop; main contains demonstrable snapshots. No force push, no secrets, real personal data or large fixtures. Use one remote and a common initial commit.

## Before commit
Run backend tests/package, frontend production build, Python tests and compose config when relevant. Record exact checks, blockers and commit in progress files. Smoke-test all categories, DB/S3/FTP routing, SHA-256 and meter deduplication before declaring MVP verified. Docker absence is a verification limitation, never a passing integration result.
