# BH05 — Security hardening notes

## Implemented in this checkpoint

- FTP storage uses explicit FTPS by default. The Java client trusts only the configured local CA certificate, verifies the server hostname, negotiates TLS 1.2 or 1.3, and protects both control and data connections (`PBSZ 0`, `PROT P`). Plain FTP is available only when `FTP_TLS_ENABLED=false` in isolated fixtures; the deployed server requires TLS for both login and data.
- The FTP service uses `pyftpdlib`'s RFC 4217 TLS handler with a PyOpenSSL context minimum of TLS 1.2, no anonymous account, a single configured FTP user, and the existing data directory at UID/GID 1000. Pyftpdlib was selected after reproduced SIGSEGV/restart loops in both Debian Bookworm vsftpd 3.0.3-13+b2 and the standalone Trixie 3.0.5-0.2 image during repeated FTPS connections. This is an observed failure, not an attribution to a specific upstream bug.
- The FTP image pins pyftpdlib 2.1.0, pyOpenSSL 26.4.0, and cryptography 50.0.2. The FTPS certificate is generated with a 30-day lifetime and bootstrap currently does not rotate it; regenerate deliberately before expiry while preserving the deployed key/certificate pair during normal restarts.
- MinIO receives a one-shot administrative provisioning helper. It refreshes a dedicated `filegrid-app` policy and app user; the policy grants object read/write, object-version read, and multipart cleanup/list-parts only under `filegrid/*`. It does not grant bucket listing or MinIO administration. The S3 initializer uses root credentials for bucket versioning/private-policy setup. Runtime API credentials remain distinct from root credentials.
- Spring Security records authentication and authorization denials without logging passwords or request query strings. Denial responses are marked `Cache-Control: no-store` and `X-Content-Type-Options: nosniff`; response JSON remains compatible.
- The category admission filter is installed after Basic authentication and applies configurable category lanes before bulk bodies are consumed. Authorization denials are written through the separate `REQUIRES_NEW` audit recorder so a failed request transaction cannot erase the audit row.

## Applied runtime/Compose integration

- The migration preserves existing MinIO root credentials as `MINIO_ROOT_USER` and `MINIO_ROOT_PASSWORD` and creates separate `S3_ACCESS_KEY` and `S3_SECRET_KEY` credentials without deleting buckets or volumes.
- Root+app credentials are scoped to `infra/minio/provision.Dockerfile`; root credentials are scoped to `storage-init`; API receives only the app credentials.
- Compose orders `storage-init`, the provisioning helper, and API startup by successful completion.
- FTP mounts `/run/filegrid/ftp-tls.crt` and `/run/filegrid/ftp-tls.key` read-only. API receives the CA certificate read-only and uses `FTP_TLS_ENABLED=true`, `FTP_TLS_CA_FILE=/run/filegrid/ftp-tls.crt`.
- Bootstrap generates the FTP certificate with DNS SAN `ftp`, `localhost`, and IP `127.0.0.1`; the Java client verifies hostname `ftp`.

## Validation state

Final deployment onto the retained `filegrid-bh01_ftp-data` volume passed: the original BH01 FTP fixture downloads with its original SHA-256, and the Docker outage suite passes repeated new upload/download plus stop/start recovery. No volume was deleted. The one-command start also passed after the provisioner treated an already-attached policy as an idempotent success.

The isolated pyftpdlib smoke passed ten sequential FTPS listings, one upload and five downloads without daemon exit. Deployed `scripts/verify-storage-security.py` passed TLS1.0/1.1 rejection, trusted TLS1.2, wrong-hostname rejection, real S3 ciphertext and forbidden bucket list/policy/create actions; API root-credential/mount isolation also passed. Java FTPS tests cover untrusted CA and hostname failures. See BH02_06_REPORT.md and VALIDATION.md for the final combined test count.

Authentication/role/document/session boundaries and concurrent exact/conflicting meter identities pass the real Docker basic suite. Full security certification, rotation and backup restore remain open. SQL document metadata is plaintext; encryption protects document content. Administrative Docker access remains trusted and can inspect local service secrets.
