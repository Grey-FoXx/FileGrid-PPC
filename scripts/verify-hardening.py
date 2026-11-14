#!/usr/bin/env python3
"""BH06 API/security/recovery checks for the retained local BH01 Compose project.

The default suite does not stop services.  The disruptive outage and restart suite
is opt-in with --faults and must only be run on the disposable filegrid-bh01 project.
It never removes containers, volumes, files or test fixtures.
"""

import argparse
import concurrent.futures
import hashlib
import http.client
import json
import os
import shlex
import subprocess
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid
from datetime import datetime, timezone
from pathlib import Path

from smoke_test_import import Client


PROJECT = "filegrid-bh01"
DEFAULT_RUNTIME = Path(".runtime/bh01")
DEFAULT_URL = "https://localhost:18443/api/v1"


def require(value, message):
    if not value:
        raise AssertionError(message)


def raw_status(client, method, path, user=None, data=None, headers=None):
    h = {"X-Correlation-ID": "bh06-" + uuid.uuid4().hex}
    if user:
        import base64

        h["Authorization"] = "Basic " + base64.b64encode(
            f"{user}:{client.accounts[user]}".encode()
        ).decode()
    h.update(headers or {})
    if data is not None:
        h.setdefault("Content-Type", "application/octet-stream")
    request = urllib.request.Request(
        client.base + path, data=data, headers=h, method=method
    )
    try:
        with urllib.request.urlopen(request, context=client.context, timeout=30) as r:
            return r.status, r.read()
    except urllib.error.HTTPError as e:
        try:
            body = e.read()
        except http.client.IncompleteRead as partial:
            body = partial.partial
        return e.code, body


def retry_rate_limited(send, max_retries=12):
    """Retry 429 without changing payload, stable ID or idempotency headers."""
    for attempt in range(max_retries + 1):
        result = send()
        if result[0] != 429:
            return result
        if attempt == max_retries:
            return result
        time.sleep(min(0.15 * (2**attempt), 2.0))


def session(client, category, payload, user, **context):
    body = {
        "category": category,
        "filename": "bh06-" + category.lower() + ".bin",
        "contentType": "application/octet-stream",
        "sizeBytes": len(payload),
        "sha256": hashlib.sha256(payload).hexdigest(),
        **context,
    }
    created = client.request(
        "POST",
        "/upload-sessions",
        body,
        user=user,
        headers={"Idempotency-Key": "bh06-" + uuid.uuid4().hex},
        expected=201,
    )
    return created


def put_part(client, session_info, payload, number, user):
    size = session_info["partSizeBytes"]
    part = payload[(number - 1) * size : number * size]
    return client.request(
        "PUT",
        f"/upload-sessions/{session_info['sessionId']}/parts/{number}",
        part,
        user=user,
        headers={"X-Part-SHA256": hashlib.sha256(part).hexdigest()},
    )


def wait_file(client, file_id, timeout=120):
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        current = client.request("GET", "/files/" + file_id)
        if current["status"] == "AVAILABLE":
            return current
        if current["status"] in ("FAILED", "CORRUPTED", "CANCELLED"):
            raise AssertionError(f"File reached terminal state {current['status']}")
        time.sleep(0.5)
    raise AssertionError("File did not become AVAILABLE")


def wait_ready(client, timeout=180):
    end = time.monotonic() + timeout
    last = None
    while time.monotonic() < end:
        try:
            # Check authenticated API plus a database-backed query, not only the
            # process/authentication path. Storage readiness is measured separately
            # by retrying the exact acknowledged fixture after service recovery.
            client.request("GET", "/stats/business")
            return
        except (OSError, AssertionError) as e:
            last = e
            time.sleep(1)
    raise AssertionError(f"API not ready before timeout: {last}")


def wait_compose_healthy(runtime, service, timeout=180):
    end = time.monotonic() + timeout
    while time.monotonic() < end:
        result = compose(runtime, "ps", "-q", service)
        container = result.stdout.strip().splitlines()
        if container:
            state = subprocess.run(
                ["docker", "inspect", "--format", "{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}", container[0]],
                text=True, capture_output=True, check=True
            ).stdout.strip()
            if state == "healthy":
                return
        time.sleep(1)
    raise AssertionError(f"Compose service {service} did not become healthy")


def compose(runtime, *args, check=True):
    env = os.environ.copy()
    env.update(
        {
            "COMPOSE_PROJECT_NAME": PROJECT,
            "FILEGRID_RUNTIME_DIR": str(runtime),
            "FILEGRID_HTTPS_PORT": "18443",
        }
    )
    command = ["docker", "compose", "-p", PROJECT, *args]
    result = subprocess.run(command, env=env, text=True, capture_output=True)
    if check and result.returncode:
        raise RuntimeError(
            f"Compose command failed ({' '.join(command)}): "
            f"{result.stderr[-1200:]}"
        )
    return result


def assert_local_target(url, runtime):
    parsed = urllib.parse.urlsplit(url)
    require(parsed.scheme == "https", "Only the BH01 HTTPS endpoint is allowed")
    require(parsed.hostname in ("localhost", "127.0.0.1", "::1"), "URL must be loopback")
    require(parsed.port == 18443, "Refusing to target a port outside the BH01 project")
    require(runtime.resolve() == DEFAULT_RUNTIME.resolve(), "Runtime must be .runtime/bh01")


def verify_compose_identity(runtime):
    result = compose(runtime, "ps", "-q")
    ids = [line for line in result.stdout.splitlines() if line.strip()]
    require(ids, f"Compose project {PROJECT} has no containers")
    for container in ids:
        inspect = subprocess.run(
            ["docker", "inspect", "--format", "{{ index .Config.Labels \"com.docker.compose.project\" }}", container],
            text=True,
            capture_output=True,
            check=True,
        )
        require(inspect.stdout.strip() == PROJECT, "Compose project label mismatch")


def create_meter_payload(meter_id, sequence=1, energy=828.125):
    return json.dumps(
        {
            "schema_version": 1,
            "reading_id": f"{meter_id}-{sequence}",
            "meter_id": meter_id,
            "sequence_number": sequence,
            "measured_at": datetime.now(timezone.utc).isoformat(),
            "energy_kwh": energy,
        },
        indent=2,
    ).encode()


def concurrent_meter_checks(client):
    meter = "BH06-" + uuid.uuid4().hex
    payload = create_meter_payload(meter)

    def send(data):
        status, body = retry_rate_limited(
            lambda: raw_status(client, "POST", "/meter-readings", "meter", data)
        )
        require(status in (200, 201), f"Meter request failed after 429 retries: HTTP {status}")
        return json.loads(body)

    with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:
        exact = list(pool.map(lambda _: send(payload), range(8)))
    require(sum(not r["duplicate"] for r in exact) == 1, "Concurrent exact replay created duplicates")
    require(sum(bool(r["duplicate"]) for r in exact) == 7, "Exact concurrent replay count mismatch")

    conflict_meter = "BH06-CONFLICT-" + uuid.uuid4().hex
    original = create_meter_payload(conflict_meter, energy=100.0)
    conflicting = create_meter_payload(conflict_meter, energy=101.0)
    attempts = [original] * 4 + [conflicting] * 4

    def send_conflict(data):
        status, body = retry_rate_limited(
            lambda: raw_status(client, "POST", "/meter-readings", "meter", data)
        )
        return status, body

    with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:
        responses = list(pool.map(send_conflict, attempts))
    accepted = [r for r in responses if r[0] in (200, 201)]
    rejected = [r for r in responses if r[0] == 409]
    require(accepted and rejected, "Conflicting concurrent identities were not deterministically rejected")
    listed = client.request(
        "GET", "/meter-readings?meterId=" + urllib.parse.quote(conflict_meter), user="dispatcher"
    )
    require(listed["total"] == 1, "Conflicting concurrent identities stored multiple readings")
    accepted_id = json.loads(accepted[0][1])["fileId"]
    stored = client.request("GET", "/files/" + accepted_id + "/content", binary=True)
    require(stored in (original, conflicting), "Stored conflict bytes do not match a submitted payload")
    print("PASS concurrent meter exact replay and conflicting identity idempotency", flush=True)
    return {"meterId": meter, "conflictMeterId": conflict_meter}


def concurrent_incident_replay(client):
    body = {
        "stationId": "BH06-IDEMPOTENCY",
        "zone": "Dobrogea",
        "eventType": "VOLTAGE_DROP",
        "severity": 2,
        "affectedCustomers": 3,
        "safetyCritical": False,
    }
    key = "bh06-concurrent-" + uuid.uuid4().hex
    headers = {"Idempotency-Key": key, "Content-Type": "application/json"}

    def send_same_incident(_):
        status, payload = retry_rate_limited(
            lambda: raw_status(client, "POST", "/incidents", "field", json.dumps(body).encode(), headers)
        )
        require(status == 201, f"Idempotent incident retry failed: HTTP {status}")
        return json.loads(payload)["id"]

    with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:
        identities = list(pool.map(send_same_incident, range(8)))
    require(len(set(identities)) == 1, "Concurrent incident replay created multiple resources")
    client.request("GET", "/incidents/" + identities[0], user="dispatcher")
    print("PASS concurrent incident replay reuses identical Idempotency-Key", flush=True)
    return identities[0]


def basic_suite(client, runtime):
    wait_ready(client)
    require(client.request("GET", "/me")["role"] == "ADMIN", "Admin login failed")

    # A database-backed meter fixture is used to exercise read roles and download ACLs.
    meter_id = "BH06-" + uuid.uuid4().hex
    meter_payload = create_meter_payload(meter_id)
    meter = client.request("POST", "/meter-readings", meter_payload, user="meter", expected=201)
    client.request("GET", "/meter-readings?meterId=" + meter_id, user="dispatcher")
    client.request("GET", "/meter-readings?meterId=" + meter_id, user="field", expected=403)
    client.request("GET", "/files/" + meter["fileId"] + "/content", user="dispatcher", binary=True)
    client.request("GET", "/files/" + meter["fileId"] + "/content", user="field", expected=403)

    incident_body = {
        "stationId": "BH06",
        "zone": "Dobrogea",
        "eventType": "VOLTAGE_DROP",
        "severity": 3,
        "affectedCustomers": 4,
        "safetyCritical": False,
    }
    incident = client.request(
        "POST", "/incidents", incident_body, user="field",
        headers={"Idempotency-Key": "bh06-" + uuid.uuid4().hex}, expected=201
    )
    client.request("GET", "/incidents/" + incident["id"], user="field")
    client.request("GET", "/incidents/" + incident["id"], user="dispatcher")
    client.request("GET", "/incidents/" + incident["id"], user="connection", expected=403)

    incident_data = b"BH06 incident authorization fixture\n" * 64
    incident_session = session(
        client,
        "INCIDENT",
        incident_data,
        "field",
        incidentId=incident["id"],
        attachmentType="BINARY",
        sensitivity="NON_SENSITIVE",
    )
    session_path = "/upload-sessions/" + incident_session["sessionId"]
    client.request("GET", session_path, user="field")
    client.request("GET", session_path, user="dispatcher", expected=403)
    client.request("GET", session_path, user="connection", expected=403)
    client.request("PUT", session_path + "/content", incident_data, user="dispatcher", expected=403)
    client.request("DELETE", session_path, user="dispatcher", expected=403)
    require(client.request("GET", session_path, user="field")["status"] == "CREATED",
            "Unauthorized session operation changed its state")
    client.request("PUT", session_path + "/content", incident_data, user="field")
    client.request("POST", session_path + "/complete", user="field", expected=202)
    incident_file = wait_file(client, incident_session["fileId"])
    client.request("GET", "/files/" + incident_file["id"] + "/content", user="dispatcher", binary=True)
    client.request("GET", "/files/" + incident_file["id"] + "/content", user="connection", expected=403)

    doc_data = b"FICTIONAL BH06 private connection document\n" * 32
    doc = client.upload(
        "CONNECTION_DOCUMENT", doc_data, user="connection",
        applicationId="BH06-" + uuid.uuid4().hex, documentType="APPLICATION"
    )
    doc_path = "/files/" + doc["id"] + "/content"
    client.request("GET", doc_path, user="connection2", expected=403)
    client.request("GET", doc_path, user="dispatcher", expected=403)
    require(client.request("GET", doc_path, user="admin", binary=True) == doc_data, "Admin document read failed")

    # A role outside either upload category must not allocate a resumable session.
    denied_body = {
        "category": "CONNECTION_DOCUMENT", "filename": "denied.bin",
        "contentType": "application/octet-stream", "sizeBytes": 1,
        "sha256": hashlib.sha256(b"x").hexdigest(), "applicationId": "BH06-denied",
        "documentType": "APPLICATION",
    }
    client.request("POST", "/upload-sessions", denied_body, user="field",
                   headers={"Idempotency-Key": uuid.uuid4().hex}, expected=403)

    anonymous, _ = raw_status(client, "GET", "/me")
    require(anonymous == 401, f"Anonymous API returned {anonymous}, expected 401")

    # The controller is private behind Nginx; probe it from the API network namespace.
    for token, expected in ((None, (400, 401, 403, 422)), ("forged-bh06-token", (401, 403))):
        header = "" if token is None else " -H " + shlex.quote("X-Worker-Token: " + token)
        cmd = "curl -sS -o /dev/null -w '%{http_code}' -X POST" + header + " http://localhost:8080/internal/v1/jobs/claim"
        probe = compose(runtime, "exec", "-T", "api", "sh", "-lc", cmd)
        code = int(probe.stdout.strip())
        require(code in expected, f"Internal endpoint accepted invalid token (HTTP {code})")
    print("PASS public role/session/download authorization and internal token rejection", flush=True)

    meter_concurrency = concurrent_meter_checks(client)
    incident_replay_id = concurrent_incident_replay(client)
    return {
        "incidentId": incident["id"],
        "files": [
            {"id": meter["fileId"], "category": "METER_READING", "storage": "DATABASE", "sha256": hashlib.sha256(meter_payload).hexdigest()},
            {"id": incident_file["id"], "category": "INCIDENT", "storage": incident_file["storage"], "sha256": incident_file["sha256"]},
            {"id": doc["id"], "category": "CONNECTION_DOCUMENT", "storage": doc["storage"], "sha256": doc["sha256"]},
        ],
        "meterConcurrency": meter_concurrency,
        "incidentReplayId": incident_replay_id,
    }


def recover_records(client, records, timeout=0):
    timings = {}
    for item in records:
        started = time.monotonic()
        last_error = None
        deadline = started + timeout
        while True:
            try:
                meta = client.request("GET", "/files/" + item["id"])
                require(meta["status"] == "AVAILABLE", f"Fixture {item['id']} is not AVAILABLE")
                data = client.request("GET", "/files/" + item["id"] + "/content", binary=True)
                require(hashlib.sha256(data).hexdigest() == item["sha256"], f"Fixture {item['id']} checksum changed")
                timings[item["id"]] = round(time.monotonic() - started, 3)
                break
            except Exception as error:
                last_error = error
                if time.monotonic() >= deadline:
                    raise AssertionError(f"Fixture {item['id']} did not recover within {timeout}s; last error: {last_error}") from error
                time.sleep(1)
    longest = max(timings.values(), default=0)
    print(f"PASS exact fixture recovery and SHA-256 (slowest {longest:.3f}s)", flush=True)
    return timings


def compose_ip(runtime, service):
    result = compose(runtime, "ps", "-q", service)
    container = result.stdout.strip().splitlines()
    if not container:
        return None
    address = subprocess.run(
        ["docker", "inspect", "--format", "{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}", container[0]],
        text=True, capture_output=True, check=True
    ).stdout.strip()
    return address or None


def compose_input(runtime, service, payload, destination):
    # The key is constrained to UUID-safe characters by the caller. Bytes go on stdin,
    # not through shell interpolation, and are restored from the exact in-memory fixture.
    prefix = "/srv/ftp/data/"
    require(service == "ftp" and destination.startswith(prefix), "Unsafe fixture target")
    name = destination.removeprefix(prefix)
    require(name.endswith(".bin"), "Unexpected fixture extension")
    try:
        uuid.UUID(name.removesuffix(".bin"))
    except ValueError as error:
        raise AssertionError("Unsafe fixture key") from error
    command = ["docker", "compose", "-p", PROJECT, "exec", "-T", service,
               "sh", "-c", "cat > " + shlex.quote(destination)]
    env = os.environ.copy()
    env.update({"COMPOSE_PROJECT_NAME": PROJECT, "FILEGRID_RUNTIME_DIR": str(runtime), "FILEGRID_HTTPS_PORT": "18443"})
    result = subprocess.run(command, env=env, input=payload, capture_output=True)
    if result.returncode:
        raise RuntimeError(f"Could not restore isolated fixture in {service}: {result.stderr[-500:]!r}")


def corrupt_and_restore_new_ftp_fixture(client, runtime, incident_id):
    original = b"BH06 sacrificial FTP checksum fixture\n" * 100
    file = client.upload(
        "INCIDENT", original, incidentId=incident_id,
        attachmentType="LEGACY_LOG", sensitivity="NON_SENSITIVE"
    )
    require(file["storage"] == "FTP", "Corruption fixture did not route to FTP")
    query = "SELECT storage_key FROM files WHERE id='" + file["id"] + "'"
    result = compose(runtime, "exec", "-T", "postgres", "sh", "-lc",
                     "psql -U filegrid -d filegrid -Atc " + shlex.quote(query))
    key = result.stdout.strip()
    require(key.endswith(".bin"), "Database returned an unexpected storage extension")
    try:
        uuid.UUID(key.removesuffix(".bin"))
    except ValueError as error:
        raise AssertionError("Database returned an unexpected storage key") from error
    path = "/srv/ftp/data/" + key
    changed = b"BH06 deliberately corrupted bytes\n" * 97
    compose_input(runtime, "ftp", changed, path)
    try:
        status, _ = raw_status(client, "GET", "/files/" + file["id"] + "/content", "admin")
        require(status == 502, f"Corrupted FTP object returned HTTP {status}, expected 502")
    finally:
        compose_input(runtime, "ftp", original, path)
    restored = compose(runtime, "exec", "-T", "ftp", "sha256sum", path)
    require(restored.stdout.split()[0] == hashlib.sha256(original).hexdigest(),
            "FTP fixture bytes were not restored exactly")
    # The intentionally sacrificial fixture remains marked CORRUPTED by design. Its
    # external bytes have been restored, but production metadata must not silently
    # downgrade a verified integrity failure back to AVAILABLE.
    state = client.request("GET", "/files/" + file["id"])
    require(state["status"] == "CORRUPTED", "Integrity failure did not quarantine the fixture")
    print("PASS corruption detection; exact bytes restored for sacrificial fixture", flush=True)
    return {"id": file["id"], "category": file["category"], "sha256": file["sha256"], "storage": "FTP", "status": "CORRUPTED"}


def api_restart_resume(client, runtime):
    # Slightly over one S3 multipart part, so at least one confirmed part survives restart.
    payload = (b"BH06 multipart restart fixture\n" * (9 * 1024 * 1024 // 31 + 2))[: 9 * 1024 * 1024]
    created = session(client, "DRONE_VIDEO", payload, "admin")
    require(created["uploadMode"] == "MULTIPART", "Large drone fixture did not select multipart")
    put_part(client, created, payload, 1, "admin")
    before = client.request("GET", "/upload-sessions/" + created["sessionId"])
    require(before["confirmedParts"], "Multipart part was not confirmed before restart")
    compose(runtime, "restart", "--timeout", "30", "api")
    wait_ready(client)
    after = client.request("GET", "/upload-sessions/" + created["sessionId"])
    require(after["confirmedParts"] == before["confirmedParts"], "Confirmed part did not survive API restart")
    count = (len(payload) + created["partSizeBytes"] - 1) // created["partSizeBytes"]
    for number in range(2, count + 1):
        put_part(client, created, payload, number, "admin")
    client.request("POST", "/upload-sessions/" + created["sessionId"] + "/complete", user="admin", expected=202)
    file = wait_file(client, created["fileId"])
    recovered = client.request("GET", "/files/" + file["id"] + "/content", binary=True)
    require(recovered == payload and hashlib.sha256(recovered).hexdigest() == file["sha256"], "Multipart recovery bytes differ")
    return {"id": file["id"], "category": file["category"], "sha256": file["sha256"]}


def wait_ml(client, incident_id, timeout=180):
    end = time.monotonic() + timeout
    while time.monotonic() < end:
        result = client.request("GET", "/incidents/" + incident_id + "/analysis")
        if result["mlStatus"] == "COMPLETED":
            return result
        require(result["mlStatus"] != "FAILED", "ML job reached FAILED")
        time.sleep(1)
    raise AssertionError("ML did not recover after worker restart")


def service_outage(client, runtime, service, records):
    # Restart is always in finally; no volume or data removal is performed.
    old_ip = compose_ip(runtime, service)
    compose(runtime, "stop", "--timeout", "15", service)
    try:
        if service in ("ftp", "minio"):
            match = next((r for r in records if (r.get("storage") == service.upper())), None)
            # Storage labels are included by the fixture seed when available.
            if match:
                status, _ = raw_status(client, "GET", "/files/" + match["id"] + "/content", "admin")
                require(status >= 500, f"{service} outage unexpectedly served uncached fixture (HTTP {status})")
    finally:
        compose(runtime, "start", service)
    wait_compose_healthy(runtime, service, timeout=240)
    wait_ready(client, timeout=240)
    new_ip = compose_ip(runtime, service)
    recoveries = recover_records(client, records, timeout=60)
    print(f"PASS {service} restart and exact recovery (IP {old_ip} -> {new_ip})", flush=True)
    return {"service": service, "ipBefore": old_ip, "ipAfter": new_ip,
            "maxRecoverySeconds": max(recoveries.values(), default=0), "recovery": "exact SHA-256"}


def fault_suite(client, runtime, records):
    results = {"storageOutages": []}
    # API process restart and resumable multipart state.
    multipart = api_restart_resume(client, runtime)
    results["multipartAfterApiRestart"] = multipart
    records.append(multipart)
    recover_records(client, records)

    # Known storage fixtures from the initial BH01 seed are needed to probe each outage.
    seed_path = runtime / "verification.json"
    if seed_path.exists():
        seed = json.loads(seed_path.read_text())
        for f in seed.get("files", []):
            records.append({"id": f["id"], "category": f["category"], "sha256": f["sha256"], "storage": f["storage"]})
    for storage_service in ("ftp", "minio"):
        results["storageOutages"].append(service_outage(client, runtime, storage_service, records))

    # PostgreSQL remains a global metadata dependency: stop/restart tests recovery,
    # not HA or isolation. Use no requests while it is down; never imply otherwise.
    compose(runtime, "stop", "--timeout", "15", "postgres")
    compose(runtime, "start", "postgres")
    wait_compose_healthy(runtime, "postgres", timeout=240)
    wait_ready(client, timeout=240)
    recoveries = recover_records(client, records, timeout=60)
    print("PASS PostgreSQL restart and acknowledged-data recovery (availability is global)", flush=True)
    results["postgresRecovery"] = {"exact": True, "maxRecoverySeconds": max(recoveries.values(), default=0), "availability": "global dependency unavailable during outage"}

    compose(runtime, "stop", "--timeout", "15", "ml-worker")
    try:
        incident = client.request(
            "POST", "/incidents",
            {"stationId": "BH06-ML", "zone": "Dobrogea", "eventType": "VOLTAGE_DROP", "severity": 3, "safetyCritical": False},
            user="field", headers={"Idempotency-Key": "bh06-" + uuid.uuid4().hex}, expected=201
        )
        payload = b"BH06 file stays available while ML worker is stopped\n" * 50
        file = client.upload("INCIDENT", payload, user="field", incidentId=incident["id"], attachmentType="BINARY", sensitivity="NON_SENSITIVE")
        require(file["status"] == "AVAILABLE", "FileGrid gated file availability on ML")
        analysis = client.request("GET", "/incidents/" + incident["id"] + "/analysis", user="field")
        require(analysis["mlStatus"] in ("PENDING", "RUNNING"), "Expected queued ML while worker was down")
        records.append({"id": file["id"], "category": file["category"], "sha256": file["sha256"]})
    finally:
        compose(runtime, "start", "ml-worker")
    # ML has no healthcheck; wait for its container to be running before polling jobs.
    end = time.monotonic() + 60
    while time.monotonic() < end:
        if compose(runtime, "ps", "--status", "running", "-q", "ml-worker").stdout.strip():
            break
        time.sleep(1)
    require(wait_ml(client, incident["id"])["mlStatus"] == "COMPLETED", "ML did not complete after service recovery")
    recover_records(client, records)
    print("PASS ML outage: file AVAILABLE while stopped, analysis completed after recovery", flush=True)
    results["mlOutage"] = {"fileId": file["id"], "fileStatus": "AVAILABLE", "mlStatus": "COMPLETED"}

    # Corruption is isolated to a freshly created synthetic FTP fixture. The exact
    # original bytes are restored in a finally block; that one row is quarantined.
    results["corruptionFixture"] = corrupt_and_restore_new_ftp_fixture(client, runtime, incident["id"])
    return results


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--url", default=DEFAULT_URL)
    parser.add_argument("--runtime-dir", type=Path, default=DEFAULT_RUNTIME)
    parser.add_argument("--faults", action="store_true", help="Restart/stop services in isolated filegrid-bh01 project")
    parser.add_argument("--basic-only", action="store_true", help="Run auth/idempotency checks without API restart/fault tests")
    args = parser.parse_args()
    assert_local_target(args.url, args.runtime_dir)
    require((args.runtime_dir / "accounts.properties").is_file(), "BH01 accounts file is missing")
    require((args.runtime_dir / "tls.crt").is_file(), "BH01 TLS certificate is missing")
    verify_compose_identity(args.runtime_dir)
    client = Client(args.url, args.runtime_dir / "accounts.properties", args.runtime_dir / "tls.crt")
    report = basic_suite(client, args.runtime_dir)
    if args.faults:
        require(not args.basic_only, "--faults and --basic-only cannot be combined")
        report["faultResults"] = fault_suite(client, args.runtime_dir, report["files"])
    recover_records(client, report["files"])
    report.update({"completedAt": datetime.now(timezone.utc).isoformat(), "faults": args.faults})
    report_path = args.runtime_dir / "hardening-verification.json"
    report_path.write_text(json.dumps(report, indent=2) + "\n")
    report_path.chmod(0o600)
    print(f"PASS BH06 {'fault' if args.faults else 'basic'} suite; report: {report_path}", flush=True)


if __name__ == "__main__":
    main()
