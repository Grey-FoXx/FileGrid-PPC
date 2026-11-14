# Known limitations at checkpoint

- Docker socket access is denied on this host. Compose validates statically; clean container startup, Nginx TLS and the actual vsftpd image remain unverified. Native integration uses a separate Python FTP server, not the vsftpd container.
- Git HTTPS push requires authentication. No remote publication is assumed until the develop commit SHA is verified remotely.
- PostgreSQL is a shared availability dependency; no HA, host-loss protection, backup restore or measured 10x isolation is delivered.
- Authentication is prototype Basic over configured HTTPS; accounts are local generated properties. AES-GCM uses one persistent local key, with no KMS or rotation. Keep its backup separately.
- The API currently uses administrative MinIO credentials within private networks. A restricted application account remains a security task. MinIO Community is archived/source-only and built from a fixed commit.
- FTP is internal-only and limited to declared non-sensitive legacy diagnostics. FTPS and complete audit coverage remain open.
- Policies support category, attachmentType and sensitivity. Unsupported criteria fail validation. Changes apply on restart to new sessions, without migrating existing files. Health/cost/performance-driven soft routing is not implemented.
- Download performs verification followed by a second read. It increases latency and relies on immutable storage versions/keys; client SHA-256 is a further check. Browser streaming downloads over 128 MiB require File System Access (Chrome/Edge); fallback buffers only smaller downloads.
- Single-request content is limited to 10 MiB; drone category uses 8 MiB parts and a 20 GiB declared maximum. Large transport was demonstrated with synthetic bytes, not codec validation.
- Tracked session cleanup is present but concurrency/orphan cleanup needs further tests. Do not configure AWS AbortIncompleteMultipartUpload lifecycle through this MinIO build: it rejects that API rule. MinIO's built-in stale-multipart expiry defaults to 24h, cleanup interval 6h; this timing was inspected in pinned source, not elapsed-time tested.
- Simulator durable retries and replay work; explicit gap reporting and a complete invalid/outage scenario suite remain open.
- Metrics and statistics are basic. Failed operations contribute zero acknowledged throughput bytes; the system does not claim to measure all raw network bytes. Alerts, normal/peak comparison and full tracing coverage remain M3 tasks.
- ML is synthetic, advisory and independent of file availability. Cluster labels are local to an analysis. Storm Mode is a volume indicator; full group exploration and operational validation are not provided.
- GitHub Actions is configured but has not executed on GitHub in this session.
