# Architecture

HTTPS gateway → Spring Boot → policy engine → PostgreSQL / MinIO / FTP. Angular is served at the same origin. Storage ports are not published. PostgreSQL also stores metadata, sessions, jobs and audit. No broker is required.

Small manual uploads use durable sessions and one binary PUT. Drone uploads use 8 MiB S3 multipart parts through FileGrid. Stored content is read back before AVAILABLE. Download verifies plaintext SHA-256 before a second streaming read. Personal documents use AES-256-GCM, a unique nonce and an external persistent key. Immutable storage keys contain UUIDs, never customer names.

Meter JSON is stored byte-for-byte in PostgreSQL, with parsed indexed fields. Unique reading_id and (meter_id, sequence_number) enforce logical identity. Identical retries replay the result; changed payload returns 409. Simulator keeps original pending payloads in SQLite, on a persistent volume.

ML uses durable jobs and a private Python worker. Random Forest and spatiotemporal DBSCAN feed a deterministic Decision Agent. File status and ML status are independent. Synthetic models are demonstration-only.

PostgreSQL is a shared availability dependency in MVP. Named volumes survive process restart but do not provide high availability or host-loss protection. PostgreSQL HA and category isolation under 10x are later validation milestones.
