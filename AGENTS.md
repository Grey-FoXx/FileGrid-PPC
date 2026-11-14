# FileGrid collaboration contract

One repository; source requirements: FileGrid PPC PDF pp. 1–4 and team master prompt. Never claim an unexecuted check passed.

## Ownership
BACKEND owns backend/, meter-simulator/, ml-service/, infra/, config/, contracts/, scripts/, docker-compose.yml and general architecture. FRONTEND owns frontend/, docs/FRONTEND_TASKS.md and docs/PROGRESS_FRONTEND.md. BACKEND owns its corresponding task/progress documents. Shared documentation changes are coordinated by the principal.

API source of truth: contracts/openapi.yaml. No unilateral incompatible contract changes. Changes require updated examples, integration notes and consumer coordination.

## Architecture invariants
Spring Boot modular backend, Angular UI, PostgreSQL, private MinIO, separate private FTP, Docker Compose. Files enter through FileGrid only. Meter acknowledgments follow durable commit; preserve original bytes and stable identities. All storage routing decisions are explainable and versioned. Personal documents are encrypted before storage. ML must NEVER gate file availability.

## Agents and Git
At most two subagents per computer: implementation and verification, no recursive delegation. Verification reports findings without concurrently rewriting implementation files. Work sequentially if subagents are unavailable. Do not assign both agents the same files.

Backend hardening and coordinated command-center work use explicit feature branches; verify the active branch before every commit. Frontend work may continue independently on `feature/frontend-improvements`; do not change incompatible API contracts unilaterally. No force push, secrets, real personal data or large fixtures. Use one remote and a common integration base.

## Before commit
Run backend tests/package, frontend production build, Python tests and compose config when relevant. Record exact checks, blockers and commit in progress files. Smoke-test all categories, DB/S3/FTP routing, SHA-256 and meter deduplication before declaring MVP verified. Docker absence is a verification limitation, never a passing integration result.

## Active checkpoint — 2026-11-15

Current reviewed branch: `feature/demo-command-center`. It includes the persistent live policy API/UI and bounded dispatcher-map layout. The minimum Compose stack is available at the isolated review URL documented in `VALIDATION.md`. Do not infer that work present only on `feature/backend-hardening` is merged here.

Before claiming PDF completion, consult `docs/PDF_REQUIREMENTS_REVIEW.md`: 10× isolation, horizontal scaling, external automatic alerts and the degraded-network/HA campaigns remain open or partial. BACKEND also owns `.github/` CI changes.

Docker config validation is not a container startup test. The 2026-11-15 isolated Compose run validates PostgreSQL, MinIO, vsftpd, API, gateway/frontend, simulator, ML and Prometheus on this machine. Do not overwrite an executable JAR while its Java process is running: stop it or launch an immutable runtime copy for tests.

Local IDE/runtime/test artifacts and generated credentials must remain ignored. No secrets or real personal documents may be committed. HTTPS push currently needs user authentication; never ask for tokens in chat and never force push.
