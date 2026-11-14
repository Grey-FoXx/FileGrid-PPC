#!/usr/bin/env python3
"""BH06 degraded-network check through a NET_ADMIN sidecar in gateway's netns.

This script is deliberately scoped to the retained filegrid-bh01 Compose project,
HTTPS localhost:18443, and .runtime/bh01. The sidecar has no mounts, ports, secrets,
or project data access. It shares only the gateway network namespace.
"""

import argparse
import base64
import hashlib
import http.client
import json
import os
import subprocess
import time
import urllib.error
import urllib.request
import uuid
from datetime import datetime, timezone
from pathlib import Path

from smoke_test_import import Client


PROJECT = "filegrid-bh01"
RUNTIME = Path(".runtime/bh01")
URL = "https://localhost:18443/api/v1"
HELPER_IMAGE = "filegrid-netem:bh06"
SIDECAR_NAME = "filegrid-bh06-netem"


def require(condition, message):
    if not condition:
        raise AssertionError(message)


def command(args, check=True, input_data=None, env=None):
    result = subprocess.run(args, text=True, capture_output=True, input=input_data, env=env)
    if check and result.returncode:
        raise RuntimeError(f"Command failed ({' '.join(args)}): {result.stderr[-1000:]}")
    return result


def compose(*args):
    env = os.environ.copy()
    env.update({
        "COMPOSE_PROJECT_NAME": PROJECT,
        "FILEGRID_RUNTIME_DIR": str(RUNTIME),
        "FILEGRID_HTTPS_PORT": "18443",
    })
    return command(["docker", "compose", "-p", PROJECT, *args], env=env)


def target_gateway():
    ids = compose("ps", "-q", "gateway").stdout.splitlines()
    require(len(ids) == 1 and ids[0], "Expected one running gateway in filegrid-bh01")
    gateway = ids[0].strip()
    label = command([
        "docker", "inspect", "--format",
        '{{ index .Config.Labels "com.docker.compose.project" }}', gateway,
    ]).stdout.strip()
    require(label == PROJECT, "Gateway Compose project label mismatch")
    running = command(["docker", "inspect", "--format", "{{.State.Running}}", gateway]).stdout.strip()
    require(running == "true", "BH01 gateway is not running")
    return gateway


def request_retry(client, method, path, data=None, user="admin", headers=None,
                  success=(200,), binary=False, max_attempts=10):
    """Repeat only the identical request; transient 429/5xx and transport failures retry."""
    last_error = None
    for attempt in range(1, max_attempts + 1):
        try:
            request_headers = {
                "Authorization": "Basic " + base64.b64encode(
                    f"{user}:{client.accounts[user]}".encode()
                ).decode(),
                "X-Correlation-ID": "bh06-netem-" + uuid.uuid4().hex,
                **(headers or {}),
            }
            request = urllib.request.Request(
                client.base + path, data=data, headers=request_headers, method=method
            )
            try:
                with urllib.request.urlopen(
                    request, context=client.context, timeout=45
                ) as response:
                    status, payload = response.status, response.read()
            except urllib.error.HTTPError as error:
                status = error.code
                try:
                    payload = error.read()
                except http.client.IncompleteRead as partial:
                    payload = partial.partial
            if status in (429, 502, 503, 504):
                last_error = f"HTTP {status}: {payload[:200]!r}"
            elif status in success:
                return (payload if binary else json.loads(payload) if payload else None), attempt
            else:
                raise RuntimeError(f"{method} {path} returned HTTP {status}: {payload[:300]!r}")
        except (OSError, urllib.error.URLError, http.client.HTTPException, AssertionError) as error:
            last_error = f"{type(error).__name__}: {error}"
        if attempt < max_attempts:
            time.sleep(min(0.4 * (2 ** (attempt - 1)), 3.0))
    raise AssertionError(f"{method} {path} did not recover after {max_attempts} identical attempts: {last_error}")


def verify_seeded_fixtures(client):
    report = json.loads((RUNTIME / "verification.json").read_text())
    files = report.get("files", [])
    require(files, "BH01 seed report contains no confirmed fixtures")
    checked = []
    for item in files:
        metadata, _ = request_retry(client, "GET", "/files/" + item["id"])
        require(metadata["status"] == "AVAILABLE", f"Seeded fixture {item['id']} is not AVAILABLE")
        content, tries = request_retry(
            client, "GET", "/files/" + item["id"] + "/content", binary=True
        )
        digest = hashlib.sha256(content).hexdigest()
        require(digest == item["sha256"], f"Seeded fixture {item['id']} SHA-256 mismatch")
        checked.append({"id": item["id"], "category": item["category"], "storage": item["storage"], "sha256": digest, "attempts": tries})
    return checked


def make_payload(size):
    block = b"BH06 NETEM resumable multipart fixture\n"
    return (block * ((size + len(block) - 1) // len(block)))[:size]


def qdisc_show(gateway_id):
    # A short-lived helper container shares the gateway namespace for read-only tc.
    return command([
        "docker", "run", "--rm", "--network", "container:" + gateway_id,
        "--cap-add", "NET_ADMIN", HELPER_IMAGE, "tc", "qdisc", "show", "dev", "eth0",
    ]).stdout


def verify_default_qdisc(text):
    root = [line for line in text.splitlines() if " root" in line]
    require(len(root) == 1 and "noqueue" in root[0],
            "Gateway eth0 has a pre-existing non-default root qdisc; refusing to replace it")


def make_session(client, payload):
    digest = hashlib.sha256(payload).hexdigest()
    body = {
        "category": "DRONE_VIDEO",
        "filename": "bh06-netem-" + uuid.uuid4().hex + ".bin",
        "contentType": "application/octet-stream",
        "sizeBytes": len(payload),
        "sha256": digest,
    }
    key = "bh06-netem-" + uuid.uuid4().hex
    headers = {"Idempotency-Key": key}
    response, _ = request_retry(
        client, "POST", "/upload-sessions", json.dumps(body).encode(),
        headers={**headers, "Content-Type": "application/json"}, success=(201,),
    )
    require(response["uploadMode"] == "MULTIPART", "Fixture did not select multipart mode")
    return body, headers, response


def send_part(client, session, payload, number):
    size = session["partSizeBytes"]
    part = payload[(number - 1) * size : number * size]
    digest = hashlib.sha256(part).hexdigest()
    result, tries = request_retry(
        client, "PUT",
        f"/upload-sessions/{session['sessionId']}/parts/{number}",
        part, headers={"X-Part-SHA256": digest}, success=(200,),
    )
    confirmed = {int(p["number"]): p for p in result["confirmedParts"]}
    require(number in confirmed and confirmed[number]["sha256"] == digest,
            f"Part {number} was not durably confirmed")
    return tries


def ensure_helper_image(build_helper):
    if build_helper:
        command(["docker", "build", "-f", "infra/testing/netem.Dockerfile", "-t", HELPER_IMAGE, "."])
    else:
        image = command(["docker", "image", "inspect", HELPER_IMAGE], check=False)
        require(image.returncode == 0,
                f"Helper image {HELPER_IMAGE} is missing; after the benchmark, build it with: "
                "docker build -f infra/testing/netem.Dockerfile -t filegrid-netem:bh06 .")


def begin_sidecar(gateway):
    existing = command(["docker", "inspect", SIDECAR_NAME], check=False)
    require(existing.returncode != 0, f"Refusing to reuse existing sidecar {SIDECAR_NAME}")
    return command([
        "docker", "run", "-d", "--rm", "--name", SIDECAR_NAME,
        "--network", "container:" + gateway,
        "--cap-drop", "ALL", "--cap-add", "NET_ADMIN",
        "--security-opt", "no-new-privileges", HELPER_IMAGE,
    ]).stdout.strip()


def apply_netem():
    command(["docker", "exec", SIDECAR_NAME,
             "tc", "qdisc", "add", "dev", "eth0", "root", "netem",
             "delay", "200ms", "loss", "2%"])
    state = command(["docker", "exec", SIDECAR_NAME, "tc", "-s", "qdisc", "show", "dev", "eth0"]).stdout
    require("netem" in state and "delay 200ms" in state and "loss 2%" in state,
            "Expected 200ms/2% netem qdisc was not installed")


def remove_netem():
    current = command(["docker", "exec", SIDECAR_NAME, "tc", "qdisc", "show", "dev", "eth0"]).stdout
    if "netem" not in current:
        return
    result = command(["docker", "exec", SIDECAR_NAME, "tc", "qdisc", "del", "dev", "eth0", "root"], check=False)
    if result.returncode:
        raise RuntimeError(f"Could not remove netem qdisc: {result.stderr[-800:]}")
    restored = command(["docker", "exec", SIDECAR_NAME, "tc", "qdisc", "show", "dev", "eth0"]).stdout
    verify_default_qdisc(restored)


def run_degraded_requests(client, session, body, idempotency_headers, payload):
    stats = {"createReplayAttempts": 0, "partReplayAttempts": 0, "remainingPartAttempts": [], "completeAttempts": 0}
    created, stats["createReplayAttempts"] = request_retry(
        client, "POST", "/upload-sessions", json.dumps(body).encode(),
        headers={**idempotency_headers, "Content-Type": "application/json"}, success=(201,),
    )
    require(created["sessionId"] == session["sessionId"] and created["fileId"] == session["fileId"],
            "Same Idempotency-Key did not return the original session/file IDs")

    stats["partReplayAttempts"] = send_part(client, session, payload, 1)
    part_size = session["partSizeBytes"]
    count = (len(payload) + part_size - 1) // part_size
    for number in range(2, count + 1):
        stats["remainingPartAttempts"].append(send_part(client, session, payload, number))
    complete_path = "/upload-sessions/" + session["sessionId"] + "/complete"
    _, stats["completeAttempts"] = request_retry(
        client, "POST", complete_path, success=(202,), user="admin"
    )
    # Replay completion with the same session identity to cover a lost response.
    request_retry(client, "POST", complete_path, success=(202,), user="admin")
    return stats


def wait_available(client, file_id, timeout=180):
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        metadata, _ = request_retry(client, "GET", "/files/" + file_id)
        if metadata["status"] == "AVAILABLE":
            return metadata
        require(metadata["status"] not in ("FAILED", "CORRUPTED", "CANCELLED"),
                f"Network fixture became {metadata['status']}")
        time.sleep(1)
    raise AssertionError("Network fixture did not become AVAILABLE")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--build-helper", action="store_true", help="Build the small tc helper image; only run after the benchmark window")
    parser.add_argument("--degraded-seconds", type=int, default=45)
    args = parser.parse_args()
    require(10 <= args.degraded_seconds <= 600, "--degraded-seconds must be 10..600")
    require((RUNTIME / "accounts.properties").is_file() and (RUNTIME / "tls.crt").is_file(),
            "BH01 local credentials/certificate files are missing")
    gateway = target_gateway()
    ensure_helper_image(args.build_helper)
    client = Client(URL, RUNTIME / "accounts.properties", RUNTIME / "tls.crt")
    fixtures = verify_seeded_fixtures(client)
    payload = make_payload(12 * 1024 * 1024)
    body, idem_headers, session = make_session(client, payload)
    first_attempts = send_part(client, session, payload, 1)
    confirmed = client.request("GET", "/upload-sessions/" + session["sessionId"])
    require(len(confirmed["confirmedParts"]) == 1, "Pre-fault multipart part not confirmed")

    # Ensure we will not replace another test's existing network shaping rule.
    before_qdisc = qdisc_show(gateway)
    verify_default_qdisc(before_qdisc)
    sidecar = begin_sidecar(gateway)
    result = {
        "project": PROJECT,
        "profile": {"delayMs": 200, "lossPercent": 2, "durationSeconds": args.degraded_seconds},
        "gatewayNetworkNamespaceContainer": gateway,
        "sidecarContainer": sidecar,
        "seededFixtures": fixtures,
        "multipartFileId": session["fileId"],
        "multipartSessionId": session["sessionId"],
        "payloadSha256": hashlib.sha256(payload).hexdigest(),
        "initialPartAttempts": first_attempts,
    }
    netem_attempted = False
    try:
        netem_attempted = True
        apply_netem()
        started = time.monotonic()
        result["degradedRequestAttempts"] = run_degraded_requests(client, session, body, idem_headers, payload)
        metadata = wait_available(client, session["fileId"])
        downloaded, attempts = request_retry(
            client, "GET", "/files/" + session["fileId"] + "/content", binary=True
        )
        require(downloaded == payload and hashlib.sha256(downloaded).hexdigest() == metadata["sha256"],
                "Resumed multipart bytes or SHA-256 changed under network impairment")
        result["degradedRecoverySeconds"] = round(time.monotonic() - started, 3)
        result["downloadAttempts"] = attempts
        result["multipartStatus"] = metadata["status"]
        result["degradedSeededFixtures"] = verify_seeded_fixtures(client)
        probe_count = 0
        while time.monotonic() - started < args.degraded_seconds:
            request_retry(client, "GET", "/stats/business")
            probe_count += 1
            time.sleep(1)
        result["degradedProbeCount"] = probe_count
        result["actualDegradedSeconds"] = round(time.monotonic() - started, 3)
        result["tcStatsBeforeCleanup"] = command([
            "docker", "exec", SIDECAR_NAME, "tc", "-s", "qdisc", "show", "dev", "eth0"
        ]).stdout
    finally:
        cleanup_errors = []
        if netem_attempted:
            try:
                remove_netem()
            except Exception as error:
                cleanup_errors.append(str(error))
        # Keep the helper alive if shaping could not be removed, so the same
        # namespace-scoped NET_ADMIN capability remains available for recovery.
        if not cleanup_errors:
            stop = command(["docker", "stop", "--time", "10", SIDECAR_NAME], check=False)
            if stop.returncode:
                cleanup_errors.append(f"Could not stop/remove sidecar: {stop.stderr[-500:]}")
        if cleanup_errors:
            raise RuntimeError("Network cleanup failed: " + "; ".join(cleanup_errors))

    after_qdisc = qdisc_show(gateway)
    verify_default_qdisc(after_qdisc)
    result["netemRemoved"] = True
    # Confirm both the seeded acknowledged objects and the new multipart fixture recover
    # over the normal path after qdisc cleanup.
    result["postCleanupFixtures"] = verify_seeded_fixtures(client)
    final_metadata, _ = request_retry(client, "GET", "/files/" + session["fileId"])
    final_data, _ = request_retry(client, "GET", "/files/" + session["fileId"] + "/content", binary=True)
    require(final_metadata["status"] == "AVAILABLE" and final_data == payload,
            "Multipart fixture did not recover after qdisc removal")
    report = RUNTIME / "network-verification.json"
    result["completedAt"] = datetime.now(timezone.utc).isoformat()
    report.write_text(json.dumps(result, indent=2) + "\n")
    report.chmod(0o600)
    print("PASS 200ms/2% egress netem multipart retry/resume and exact SHA-256; qdisc removed", flush=True)
    print("Report: " + str(report), flush=True)


if __name__ == "__main__":
    main()
