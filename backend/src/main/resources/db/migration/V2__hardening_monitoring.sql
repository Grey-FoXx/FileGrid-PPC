ALTER TABLE files ADD COLUMN uploaded_at TIMESTAMPTZ;
ALTER TABLE files ADD COLUMN available_at TIMESTAMPTZ;
ALTER TABLE upload_sessions ADD COLUMN last_activity_at TIMESTAMPTZ NOT NULL DEFAULT now();
CREATE INDEX operations_window ON operations(created_at,category,storage,operation);
CREATE INDEX files_verification ON files(status,category);
CREATE INDEX audit_window ON audit_events(created_at,outcome);
CREATE TABLE alerts (
 fingerprint VARCHAR(100) PRIMARY KEY, name VARCHAR(120) NOT NULL,
 status VARCHAR(20) NOT NULL CHECK(status IN ('FIRING','RESOLVED')),
 labels TEXT NOT NULL, annotations TEXT NOT NULL,
 starts_at TIMESTAMPTZ NOT NULL, ends_at TIMESTAMPTZ,
 first_received_at TIMESTAMPTZ NOT NULL DEFAULT now(), last_received_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
