# Test plan

M1: validate startup; upload/recover all four categories; prove DATABASE/S3/FTP actual use; compare original/download SHA-256; reject unauthorized document download; verify encrypted bytes in storage; replay identical meter readings; reject altered identity payload; restart simulator with pending events; resume multipart after API/client interruption; change a routing policy for new uploads; detect intentional storage corruption.

M2: two synthetic models produce versioned recommendations; file is AVAILABLE before ML completion; stop/restart worker and prove continued file access and eventual job retry.

M3: permissions matrix, TLS and no published storage ports; audit; metric histogram quantiles per category/storage; automatically triggered alert events; useful normal/storm comparison.

M4: 5-minute baseline then 5-minute incident load at 10x; unrelated categories p95 <= +20% and errors < +1 percentage point. 1.2GiB transfer with bounded backend heap. 200ms latency/2% packet loss. Restart API mid-upload. Two API replicas. Storage stop/recovery, PostgreSQL HA and backup restore. Record hardware and raw results, never invent benchmarks.
