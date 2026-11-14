# Test plan

M1: validate startup; upload/recover all four categories; prove DATABASE/S3/FTP actual use; compare original/download SHA-256; reject unauthorized document download; verify encrypted bytes in storage; replay identical meter readings; reject altered identity payload; restart simulator with pending events; resume multipart after API/client interruption; change a routing policy for new uploads; detect intentional storage corruption.

M2: two synthetic models produce versioned recommendations; file is AVAILABLE before ML completion; stop/restart worker and prove continued file access and eventual job retry.

M3: permissions matrix, TLS and no published storage ports; audit; metric histogram quantiles per category/storage; automatically triggered alert events; useful normal/storm comparison.

M4: 5-minute baseline then 5-minute incident load at 10x; unrelated categories p95 <= +20% and errors < +1 percentage point. 1.2GiB transfer with bounded backend heap. 200ms latency/2% packet loss. Restart API mid-upload. Two API replicas. Storage stop/recovery, PostgreSQL HA and backup restore. Record hardware and raw results, never invent benchmarks.

## BH02–BH06 reproducible campaign

See BH02_06_REPORT.md for actual outcomes. `isolation-test.py` offers all four categories simultaneously, then spikes one by 10; run four cases sequentially, 300s/phase. Check actual offered ratio, terminal errors, within-window throughput, queue/drain and >=20 unaffected samples; compare p95 <=1.20 and error increase <1pp. Physical retry/429 counts must be distinguished from terminal logical-operation errors. Preserve fixture data and record resource/disk budget.

Run `verify-hardening.py` basic, then `--faults` only in the principal's exclusive mutation window. Restore stopped services in finally paths, hash the same acknowledged objects and restore only the newly created sacrificial corruption fixture. Run storage-security probes for live TLS/restricted credentials/ciphertext. Seven declarative alert tests run with promtool; separately prove authenticated live delivery and resolution.

`verify-network.py --build-helper` uses a disposable NET_ADMIN sidecar sharing only the guarded gateway namespace, checks it has the default qdisc, installs 200ms/2% egress netem, verifies existing hashes and multipart replay/resume, records dropped packets and removes qdisc/sidecar in finally. Never run network injection concurrently with benchmarks or against the host network. This is a bounded synthetic transfer test, not arbitrary partition/HA coverage.
