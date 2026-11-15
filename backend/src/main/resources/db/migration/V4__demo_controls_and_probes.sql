CREATE TABLE demo_flow_control (
 id SMALLINT PRIMARY KEY CHECK(id=1),
 multiplier INTEGER NOT NULL DEFAULT 1 CHECK(multiplier BETWEEN 1 AND 10),
 next_files_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
INSERT INTO demo_flow_control(id) VALUES (1);
CREATE TABLE demo_notifications (
 id UUID PRIMARY KEY,
 code VARCHAR(60) NOT NULL,
 message TEXT NOT NULL,
 synthetic BOOLEAN NOT NULL,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE demo_integrity_probes (
 file_id UUID PRIMARY KEY REFERENCES files(id) ON DELETE CASCADE,
 original_bytes BYTEA NOT NULL,
 state VARCHAR(30) NOT NULL,
 detail TEXT NOT NULL,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
