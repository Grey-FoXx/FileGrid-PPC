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

## 2026-11-15: configurable destinations

All categories now accept DATABASE/S3/FTP; policy request fields and existing endpoints are unchanged. Meter acknowledgments additionally include `storage`. Upload-session multipart endpoints and part size remain unchanged for every destination, including Database/FTP drones. Connection encryption/ownership, stale-policy 409, and existing-session routing remain enforced. See POLICIES.md for transport and staging tradeoffs.
