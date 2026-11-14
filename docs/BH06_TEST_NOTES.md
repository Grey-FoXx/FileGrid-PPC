# BH06 verification runner

`scripts/verify-hardening.py` is the reproducible BH06 verification entry point for
the retained local Compose project. It uses the existing `Client` from
`scripts/smoke_test_import.py`, generated credentials and TLS certificate under
`.runtime/bh01`, and synthetic fixtures only. It refuses non-HTTPS, non-loopback,
non-18443 targets and requires the `filegrid-bh01` Compose project label. It never
deletes containers, volumes, records or objects.

## Basic suite

Run from the repository root after the implementation checkpoint is built and the
isolated BH01 stack is healthy:

```bash
python3 scripts/verify-hardening.py
```

This creates new synthetic records and checks meter/file/incident/document role
boundaries, upload-session ownership, anonymous rejection, invalid internal worker
tokens, concurrent exact and conflicting meter identities, and exact downloaded
bytes. The report is written with mode 0600 to the ignored path
`.runtime/bh01/hardening-verification.json`. A Docker CLI is required for the
project identity and private internal-controller probes. Credentials are never
printed or copied into the report.

## Restart and outage suite

The `--faults` path deliberately restarts API and stops PostgreSQL, MinIO, FTP and
the ML worker one at a time. Run it only when the principal agent has explicitly
scheduled the isolated-stack fault window:

```bash
python3 scripts/verify-hardening.py --faults
```

It verifies confirmed multipart state across an API restart; observes storage
failure and reads the same acknowledged fixtures after service recovery; restarts
PostgreSQL and confirms exact data recovery; and checks a file reaches `AVAILABLE`
while ML is stopped before confirming the queued analysis completes after restart.
PostgreSQL is a global metadata dependency: this test demonstrates recovery and
does not demonstrate availability during a PostgreSQL outage or HA.

The corruption case creates a fresh FTP-routed incident fixture, modifies only
that fixture inside the named Compose FTP container, expects the API to detect the
checksum mismatch and mark it `CORRUPTED`, and restores the original bytes from
memory in a `finally` block. It then verifies the restored bytes' SHA-256. The
fixture's database state intentionally remains quarantined as `CORRUPTED`; no
existing record or object is modified. If the FTP service or restoration command
fails, the test fails visibly and must not be reported as passed.

The runner never executes `down`, `rm`, volume removal, prune or cleanup. It
supplies `-p filegrid-bh01` and the `.runtime/bh01` runtime to every Compose action.
Do not override those fixed target guards. The disruptive suite must not be run
against any shared or production-like project.

## Coverage boundaries

This runner is an integration check, not a load, benchmark, alert-delivery, backup
restore, network-partition or high-availability test. It does not prove 10x
category isolation; that belongs to BH02/BH03. Alert-rule thresholds and delivery
belong to BH04. FTPS and restricted MinIO credentials belong to BH05. Outcomes must be recorded separately from script review. The final basic and fault suites passed against the deployed stack; see BH02_06_REPORT.md and the ignored .runtime/bh01/hardening-verification.json. FTP/MinIO/PostgreSQL recovered exact content; API multipart resume, ML independence and corruption quarantine/restoration passed. All services were restored. Network degradation is tested separately.

## Executed Compose results — 2026-11-14

After the final BH05 redeploy, both commands passed in sequence against
`filegrid-bh01`:

```bash
sg docker -c 'python3 scripts/verify-hardening.py'
sg docker -c 'python3 scripts/verify-hardening.py --faults'
```

The basic suite passed role/session/download checks, anonymous rejection, missing
and forged worker-token rejection, concurrent exact and conflicting meter
identities, concurrent incident replay with the same `Idempotency-Key`, and exact
fixture downloads.

The fault suite passed API restart with confirmed multipart resume, then FTP,
MinIO and PostgreSQL stop/start recovery. The slowest fixture recovery after each
dependency restart was 0.490 s for FTP, 0.530 s for MinIO and 0.495 s for
PostgreSQL. FTP address remained `172.20.0.3`; MinIO remained `172.20.0.2`. The
PostgreSQL test demonstrates recovery only; metadata and API availability remain
globally dependent on PostgreSQL during its outage. With ML stopped, the file
reached `AVAILABLE`; after ML restarted, analysis reached `COMPLETED`. A new
synthetic FTP fixture detected tampering, was quarantined as `CORRUPTED`, and its
original bytes were restored exactly. No volumes or pre-existing objects were
deleted or modified. The report is retained in ignored
`.runtime/bh01/hardening-verification.json`, mode 0600. All nine Compose services
were running at the end; API, gateway, FTP, MinIO and PostgreSQL were healthy.

A fault run against the earlier redeploy initially exposed a persistent FTP
`UnknownHostException` after restart and timed out at 60 seconds. After the JDK
DNS-cache and FTP-server corrections, the final run passed recovery under the same
60-second bound. The failed pre-fix run is not counted as a pass.

## Degraded network runner — prepared, not executed

`scripts/verify-network.py` prepares a 200 ms delay and 2% packet loss rule through
a short-lived sidecar that shares only the `filegrid-bh01` gateway network
namespace. It refuses to replace a non-default existing root qdisc, does not
mount files or receive application credentials, replays a confirmed multipart
part and session with the same IDs/keys, completes the upload, and verifies exact
SHA-256 for both the existing seed fixtures and the new multipart object. A
`finally` block removes the qdisc and sidecar and checks that the default qdisc is
restored. It does not modify the host network namespace.

The helper image is intentionally not built and the network rule has not been
applied. Once the principal agent's benchmark window has ended and the test is
approved, build and run it with:

```bash
docker build -f infra/testing/netem.Dockerfile -t filegrid-netem:bh06 .
sg docker -c 'python3 scripts/verify-network.py'
```

If the kernel denies `NET_ADMIN` or does not support `netem`, report that exact
error and do not alter host networking. The run writes its credential-free summary
to `.runtime/bh01/network-verification.json` with mode 0600.
