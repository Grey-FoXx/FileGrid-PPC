#!/usr/bin/env python3
"""BH01: verify a running isolated Compose stack, then recover the same fixtures after restart.

This script never deletes resources, stops services, or changes Docker configuration.
"""

import argparse
import hashlib
import json
import socket
import ssl
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid
from datetime import datetime, timezone
from pathlib import Path

from smoke_test_import import Client


def require(condition, message):
    if not condition:
        raise AssertionError(message)


def wait_ready(client, timeout=180):
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        try:
            client.request("GET", "/me")
            return
        except (OSError, AssertionError):
            time.sleep(1)
    raise AssertionError("HTTPS API did not become ready within the deadline")


def transport(client):
    address = urllib.parse.urlsplit(client.base)
    require(address.scheme == "https", "BH01 requires HTTPS, not HTTP")
    with socket.create_connection(
        (address.hostname, address.port or 443), timeout=10
    ) as raw:
        with client.context.wrap_socket(
            raw, server_hostname=address.hostname
        ) as connection:
            protocol = connection.version()
            require(protocol in ("TLSv1.2", "TLSv1.3"), "Unsupported TLS protocol")
    root = urllib.parse.urlunsplit((address.scheme, address.netloc, "/", "", ""))
    with urllib.request.urlopen(root, context=client.context, timeout=20) as response:
        html = response.read().decode()
        require(
            response.status == 200 and "app-root" in html,
            "Angular entrypoint unavailable",
        )
    try:
        urllib.request.urlopen(client.base + "/me", context=client.context, timeout=10)
        raise AssertionError("Anonymous API access unexpectedly allowed")
    except urllib.error.HTTPError as error:
        require(error.code == 401, "Anonymous API access must return 401")
    for path in ("/internal/v1/jobs/claim", "/actuator/health"):
        try:
            urllib.request.urlopen(
                root.rstrip("/") + path, context=client.context, timeout=10
            )
            raise AssertionError("Internal endpoint exposed through gateway: " + path)
        except urllib.error.HTTPError as error:
            require(
                error.code == 404, "Gateway did not block internal endpoint: " + path
            )
    print(
        "PASS HTTPS: trusted local certificate, hostname, "
        + protocol
        + ", Angular entrypoint, private routes",
        flush=True,
    )
    return protocol


def recovered(client, files):
    for file in files:
        metadata = client.request("GET", "/files/" + file["id"])
        require(metadata["status"] == "AVAILABLE", "Confirmed file became unavailable")
        require(
            metadata["storage"] == file["storage"],
            "Storage route changed after restart",
        )
        data = client.request("GET", "/files/" + file["id"] + "/content", binary=True)
        require(len(data) == file["sizeBytes"], "Recovered file size differs")
        require(
            hashlib.sha256(data).hexdigest() == file["sha256"],
            "Recovered SHA-256 differs",
        )
        print(
            "PASS recovered " + file["category"] + " / " + file["storage"], flush=True
        )


def wait_analysis(client, incident):
    for _ in range(90):
        result = client.request("GET", "/incidents/" + incident + "/analysis")
        if result["mlStatus"] == "COMPLETED":
            require(
                result["analysis"]["synthetic"] is True, "Synthetic ML marker missing"
            )
            require(
                len(result["analysis"]["modelVersions"]) == 2,
                "Expected two model versions",
            )
            return result
        require(result["mlStatus"] != "FAILED", "ML failed in the full Compose stack")
        time.sleep(1)
    raise AssertionError("ML did not finish within 90 seconds")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("phase", choices=("seed", "recover"))
    parser.add_argument("--url", default="https://localhost:18443/api/v1")
    parser.add_argument("--runtime-dir", type=Path, default=Path(".runtime/bh01"))
    parser.add_argument("--report", type=Path)
    args = parser.parse_args()
    report_path = args.report or args.runtime_dir / "verification.json"
    client = Client(
        args.url, args.runtime_dir / "accounts.properties", args.runtime_dir / "tls.crt"
    )
    wait_ready(client)
    protocol = transport(client)
    if args.phase == "seed":
        identity = "BH01-" + uuid.uuid4().hex
        reading = {
            "schema_version": 1,
            "reading_id": identity + "-1",
            "meter_id": identity,
            "sequence_number": 1,
            "measured_at": datetime.now(timezone.utc).isoformat(),
            "energy_kwh": 1542.8,
        }
        payload = json.dumps(reading, indent=2).encode()
        result = client.request(
            "POST", "/meter-readings", payload, "meter", expected=201
        )
        meter_file = client.request("GET", "/files/" + result["fileId"])
        require(
            meter_file["storage"] == "DATABASE", "Meter reading not stored in Database"
        )
        require(
            meter_file["sha256"] == hashlib.sha256(payload).hexdigest(),
            "Meter hash differs",
        )
        incident = client.incident(stationId="ST-BH01", safetyCritical=True)
        legacy = client.upload(
            "INCIDENT",
            b"Non-sensitive legacy diagnostic\n" * 100,
            incidentId=incident["id"],
            attachmentType="LEGACY_LOG",
            sensitivity="NON_SENSITIVE",
        )
        binary = client.upload(
            "INCIDENT",
            b"Synthetic diagnostic attachment\n" * 100,
            incidentId=incident["id"],
            attachmentType="BINARY",
            sensitivity="NON_SENSITIVE",
        )
        document = client.upload(
            "CONNECTION_DOCUMENT",
            b"FICTITIOUS CONNECTION DOCUMENT\n" * 100,
            user="connection",
            applicationId="BH01-APP",
            documentType="APPLICATION",
        )
        video = client.upload(
            "DRONE_VIDEO", b"DRONE-FIXTURE" * (8 * 1024 * 1024 // 13 + 2)
        )
        require(legacy["storage"] == "FTP", "Legacy diagnostic did not use FTP")
        require(
            all(f["storage"] == "S3" for f in (binary, document, video)),
            "S3 routing differs",
        )
        files = [meter_file, legacy, binary, document, video]
        recovered(client, files)
        analysis = wait_analysis(client, incident["id"])
        report = {
            "url": args.url,
            "seededAt": datetime.now(timezone.utc).isoformat(),
            "tls": protocol,
            "files": files,
            "readingPayload": payload.decode(),
            "incidentId": incident["id"],
            "mlRecommendation": analysis["analysis"]["recommendation"],
            "phase": "seed_passed",
        }
    else:
        report = json.loads(report_path.read_text())
        require(report["url"] == args.url, "Recovery URL differs from seeded stack")
        recovered(client, report["files"])
        replay = client.request(
            "POST", "/meter-readings", report["readingPayload"].encode(), "meter"
        )
        require(
            replay["duplicate"] is True,
            "Reading retry after restart created a new reading",
        )
        meter = json.loads(report["readingPayload"])["meter_id"]
        rows = client.request(
            "GET", "/meter-readings?meterId=" + urllib.parse.quote(meter)
        )
        require(rows["total"] == 1, "Reading count changed after replay")
        require(
            wait_analysis(client, report["incidentId"])["mlStatus"] == "COMPLETED",
            "ML result not persisted",
        )
        report.update(
            phase="recovery_passed", recoveredAt=datetime.now(timezone.utc).isoformat()
        )
        print(
            "PASS restart persistence: files, exact bytes, meter identity and ML result",
            flush=True,
        )
    simulator = client.request("GET", "/meter-readings?meterId=MTR-1001&size=1")
    require(
        simulator["total"] > 0, "Continuous meter simulator has not ingested readings"
    )
    document = next(
        f for f in report["files"] if f["category"] == "CONNECTION_DOCUMENT"
    )
    client.request(
        "GET", "/files/" + document["id"] + "/content", user="connection2", expected=403
    )
    client.request("GET", "/stats/technical")
    client.request("GET", "/stats/business")
    report_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.write_text(json.dumps(report, indent=2) + "\n")
    report_path.chmod(0o600)
    print("PASS " + args.phase + "; report: " + str(report_path), flush=True)


if __name__ == "__main__":
    main()
