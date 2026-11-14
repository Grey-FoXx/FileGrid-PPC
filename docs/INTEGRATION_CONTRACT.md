# Integration

Source of truth: ../contracts/openapi.yaml. Prefix /api/v1. Categories: METER_READING, INCIDENT, CONNECTION_DOCUMENT, DRONE_VIDEO. Storage: DATABASE, S3, FTP. SHA-256 is lowercase hex; sizes bytes; times UTC; IDs UUID.

Basic authentication over HTTPS. UI retains credentials in memory only. GET /me validates them. Idempotency-Key is mandatory for incident/session creation. X-Correlation-ID is returned on all responses. Errors are application/problem+json with code, status, detail, correlationId.

File states: CREATED, UPLOADING, UPLOADED, VERIFYING, AVAILABLE, RETRY_PENDING, FAILED, CANCELLED, CORRUPTED. ML: NOT_REQUESTED, PENDING, RUNNING, COMPLETED, FAILED. Upload complete returns 202; poll file status until AVAILABLE. Never infer ML completion from file availability.

Session POST fields: category, filename, contentType, sizeBytes, sha256, incidentId (incident), applicationId/documentType (connection), attachmentType, sensitivity. Session result: sessionId, fileId, uploadMode (SINGLE/MULTIPART), partSizeBytes, expiresAt.

Small upload: PUT /upload-sessions/{id}/content with application/octet-stream. Multipart: PUT /upload-sessions/{id}/parts/{number} with X-Part-SHA256. GET session returns confirmedParts. POST complete is idempotent. Download response includes X-Content-SHA256. No direct storage links.

Lists return {items,page,size,total}; query page starts at 0, max size 100. Policy changes apply to new sessions after API restart. Frontend uses contract fixtures until the live API is ready.

## Checkpoint corrections

Only implemented query filters are declared in OpenAPI: files category/status/search; meters meterId; all lists page/size. Date-range filters and global cluster IDs are not provided. The v1 UI must not infer them.

Private worker contract: POST /internal/v1/jobs/claim returns {} or {jobId,attempt,incident,context}; complete uses POST /internal/v1/jobs/{id}/complete with attempt plus ml-result fields; fail uses /fail with attempt. X-Worker-Token is required; gateway blocks /internal/. Jobs use leases and bounded retries.

Workflow verification and outstanding compatibility notes are in VALIDATION.md and HANDOFF_SECOND_COMPUTER.md. No unilateral frontend changes to contracts are allowed.

## BH02–BH06 compatibility note

Public OpenAPI and frontend sources are unchanged. Under category saturation, clients may receive the existing 429 problem shape with code CATEGORY_BUSY and Retry-After: 1. Retry the same Idempotency-Key, reading_id and multipart part content/checksum; do not generate a new logical request identity. Keep bounded backoff and preserve the selected file/session.

Alerts currently have only an internal authenticated Alertmanager webhook blocked by the gateway. FRONTEND must not call /internal/ or invent public alert endpoints. A future public read/ack contract, authorization and pagination must be agreed together before implementation. Existing statistics/ML/file endpoints retain their schemas.
