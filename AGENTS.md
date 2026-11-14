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

## Checkpoint and stop — 2026-11-14

The user explicitly requested final verification, documentation, one local Git checkpoint and a non-force push attempt, followed by stopping. Do not autonomously implement more features after this checkpoint. A later explicit task is required to resume.

Integration branch: develop. Match its exact SHA on both machines before branching. See docs/HANDOFF_SECOND_COMPUTER.md, docs/VALIDATION.md and task lists. BACKEND also owns .github/ CI changes.

Docker config validation is not a container startup test. Native verification used PostgreSQL 17, MinIO and Python FTP; vsftpd/Nginx containers still need validation. Do not overwrite an executable JAR while its Java process is running: stop it or launch an immutable runtime copy for tests.

Local IDE/runtime/test artifacts and generated credentials must remain ignored. No secrets or real personal documents may be committed. HTTPS push currently needs user authentication; never ask for tokens in chat and never force push.
