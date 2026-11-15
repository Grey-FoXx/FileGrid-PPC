CREATE TABLE incident_groups (
 id UUID PRIMARY KEY,
 status VARCHAR(20) NOT NULL DEFAULT 'NEW'
   CHECK(status IN ('NEW','DISPATCHED','RESOLVED')),
 zone VARCHAR(120) NOT NULL,
 event_type VARCHAR(120) NOT NULL,
 demo_scope BOOLEAN NOT NULL DEFAULT FALSE,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE incidents ADD COLUMN group_id UUID REFERENCES incident_groups(id);
CREATE INDEX incidents_group ON incidents(group_id);
CREATE INDEX incident_groups_open ON incident_groups(status,updated_at DESC);

CREATE TABLE demo_resources (
 resource_type VARCHAR(30) NOT NULL,
 resource_id VARCHAR(120) NOT NULL,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 PRIMARY KEY(resource_type,resource_id)
);
CREATE INDEX demo_resources_by_type ON demo_resources(resource_type,created_at DESC);
CREATE TABLE demo_state (
 id SMALLINT PRIMARY KEY CHECK(id=1),
 mode VARCHAR(10) NOT NULL DEFAULT 'NORMAL' CHECK(mode IN ('NORMAL','STORM')),
 initialized_at TIMESTAMPTZ,
 seed_version VARCHAR(40),
 generation_counter BIGINT NOT NULL DEFAULT 0
);
INSERT INTO demo_state(id) VALUES (1);

ALTER TABLE operations ADD COLUMN demo_scope BOOLEAN NOT NULL DEFAULT FALSE;
