# Physical MVP data model

Migration: backend/src/main/resources/db/migration/V1__core.sql. UUID resource IDs, UTC timestamptz, PostgreSQL constraints and transactions.

- `files`: category, original display filename/MIME/size/hash, lifecycle/integrity status, storage UUID key/version, owner, policy version/reason, AES nonce, JSON-text category context, operation ID and creation time.
- `blobs`: exact original Database content as bytea, addressed by immutable file storage key.
- `meter_readings`: unique reading_id and unique (meter_id,sequence_number), measured_at, decimal energy and FK to files. Payload bytes live in blobs.
- `incidents`: owner, validated metadata JSON text, independent ML state/result and creation time. Attachment relationship is stored in file context as incidentId.
- `upload_sessions`: file FK, transfer mode, multipart ID, lifecycle and expiry.
- `upload_parts`: unique (session_id,part_number), part SHA-256, size and ETag.
- `idempotency_records`: unique actor/operation/key, request fingerprint and resulting resource ID.
- `jobs`: unique kind/resource, status, attempt count, next retry, lease, result and last error.
- `audit_events`: actor, action, resource, outcome, correlation ID and time.
- `operations`: category/storage/operation, duration, bytes, outcome, correlation ID and time.

Prototype simplifications: accounts are generated local properties loaded into Spring Security rather than a users table; category-specific document/video metadata and routing criteria are held in files.context rather than separate tables. One persistent external AES key is supported; rotation is not implemented. These choices do not change the public API. A subsequent schema change requires a new Flyway migration, not rewriting V1 after deployment.
