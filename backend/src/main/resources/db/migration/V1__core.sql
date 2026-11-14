CREATE TABLE files (
 id UUID PRIMARY KEY, category VARCHAR(40) NOT NULL, filename VARCHAR(255) NOT NULL,
 content_type VARCHAR(120) NOT NULL, size_bytes BIGINT NOT NULL CHECK(size_bytes>0),
 sha256 CHAR(64) NOT NULL, status VARCHAR(30) NOT NULL, integrity_status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
 storage VARCHAR(20) NOT NULL, storage_key VARCHAR(150) NOT NULL UNIQUE, storage_version TEXT,
 owner_name VARCHAR(120) NOT NULL, policy_version VARCHAR(40) NOT NULL, routing_reason TEXT NOT NULL,
 encrypted BOOLEAN NOT NULL DEFAULT FALSE, nonce BYTEA, context TEXT NOT NULL DEFAULT '{}',
 operation_id VARCHAR(100) NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX files_search ON files(category,status,created_at DESC);
CREATE TABLE blobs (storage_key VARCHAR(150) PRIMARY KEY, content BYTEA NOT NULL);
CREATE TABLE meter_readings (
 reading_id VARCHAR(120) PRIMARY KEY, meter_id VARCHAR(120) NOT NULL,
 sequence_number BIGINT NOT NULL CHECK(sequence_number>0), measured_at TIMESTAMPTZ NOT NULL,
 energy_kwh NUMERIC NOT NULL CHECK(energy_kwh>=0), file_id UUID NOT NULL REFERENCES files(id),
 UNIQUE(meter_id,sequence_number)
);
CREATE TABLE incidents (
 id UUID PRIMARY KEY, owner_name VARCHAR(120) NOT NULL, metadata TEXT NOT NULL,
 ml_status VARCHAR(25) NOT NULL DEFAULT 'NOT_REQUESTED', analysis TEXT,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE upload_sessions (
 id UUID PRIMARY KEY, file_id UUID NOT NULL UNIQUE REFERENCES files(id),
 upload_mode VARCHAR(20) NOT NULL, multipart_id TEXT, state VARCHAR(30) NOT NULL DEFAULT 'CREATED',
 expires_at TIMESTAMPTZ NOT NULL DEFAULT now()+interval '24 hours'
);
CREATE TABLE upload_parts (
 session_id UUID NOT NULL REFERENCES upload_sessions(id), part_number INT NOT NULL,
 sha256 CHAR(64) NOT NULL, size_bytes BIGINT NOT NULL, etag TEXT NOT NULL,
 PRIMARY KEY(session_id,part_number)
);
CREATE TABLE idempotency_records (
 owner_name VARCHAR(120) NOT NULL, operation VARCHAR(40) NOT NULL, idem_key VARCHAR(120) NOT NULL,
 fingerprint CHAR(64) NOT NULL, resource_id UUID NOT NULL,
 PRIMARY KEY(owner_name,operation,idem_key)
);
CREATE TABLE jobs (
 id UUID PRIMARY KEY, kind VARCHAR(30) NOT NULL, resource_id UUID NOT NULL,
 state VARCHAR(25) NOT NULL DEFAULT 'PENDING', attempts INT NOT NULL DEFAULT 0,
 available_at TIMESTAMPTZ NOT NULL DEFAULT now(), lease_until TIMESTAMPTZ,
 result TEXT, last_error TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 UNIQUE(kind,resource_id)
);
CREATE INDEX jobs_pending ON jobs(kind,state,available_at);
CREATE TABLE audit_events (
 id BIGSERIAL PRIMARY KEY, actor VARCHAR(120) NOT NULL, action VARCHAR(60) NOT NULL,
 resource_id VARCHAR(120), outcome VARCHAR(30) NOT NULL, correlation_id VARCHAR(100),
 created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE operations (
 id BIGSERIAL PRIMARY KEY, category VARCHAR(40), storage VARCHAR(20), operation VARCHAR(30),
 duration_ms DOUBLE PRECISION NOT NULL, bytes BIGINT NOT NULL, success BOOLEAN NOT NULL,
 correlation_id VARCHAR(100), created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
