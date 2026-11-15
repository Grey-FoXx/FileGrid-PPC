CREATE TABLE storage_policy_config (
 id SMALLINT PRIMARY KEY CHECK (id=1),
 version BIGINT NOT NULL CHECK (version>0),
 rules JSONB NOT NULL,
 updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
