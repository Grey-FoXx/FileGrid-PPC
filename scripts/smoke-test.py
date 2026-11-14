#!/usr/bin/env python3
"""Real API smoke test. Requires a running FileGrid stack; uses fictitious data only."""

import argparse, base64, hashlib, json, ssl, time, urllib.request, urllib.error, uuid
from pathlib import Path


class Client:
    def __init__(self, base, accounts, certificate=None):
        self.base = base.rstrip("/")
        self.accounts = {}
        for line in Path(accounts).read_text().splitlines():
            if "=" in line:
                name, value = line.split("=", 1)
                self.accounts[name] = value.split(":", 1)[0]
        self.context = (
            ssl.create_default_context(cafile=str(certificate))
            if certificate
            else ssl.create_default_context()
        )

    def request(
        self,
        method,
        path,
        data=None,
        user="admin",
        headers=None,
        expected=200,
        binary=False,
    ):
        h = {
            "Authorization": "Basic "
            + base64.b64encode(f"{user}:{self.accounts[user]}".encode()).decode(),
            "X-Correlation-ID": str(uuid.uuid4()),
            **(headers or {}),
        }
        if data is not None and not isinstance(data, bytes):
            data = json.dumps(data).encode()
            h["Content-Type"] = "application/json"
        if isinstance(data, bytes):
            h.setdefault("Content-Type", "application/octet-stream")
        req = urllib.request.Request(
            self.base + path, data=data, headers=h, method=method
        )
        try:
            with urllib.request.urlopen(
                req, context=self.context, timeout=180
            ) as response:
                status = response.status
                payload = response.read()
        except urllib.error.HTTPError as e:
            status = e.code
            payload = e.read()
        if isinstance(expected, int):
            expected = (expected,)
        if status not in expected:
            raise AssertionError(
                f"{method} {path}: expected {expected}, got {status}: {payload[:500]!r}"
            )
        return payload if binary else json.loads(payload) if payload else None

    def incident(self, **fields):
        body = {
            "stationId": "ST-DEMO",
            "zone": "Dobrogea",
            "eventType": "VOLTAGE_DROP",
            "severity": 4,
            "affectedCustomers": 240,
            "latitude": 44.18,
            "longitude": 28.65,
            **fields,
        }
        return self.request(
            "POST",
            "/incidents",
            body,
            headers={"Idempotency-Key": str(uuid.uuid4())},
            expected=201,
        )

    def upload(self, category, data, user="admin", **context):
        body = {
            "category": category,
            "filename": category.lower() + "-fixture.bin",
            "contentType": "application/octet-stream",
            "sizeBytes": len(data),
            "sha256": hashlib.sha256(data).hexdigest(),
            **context,
        }
        key = str(uuid.uuid4())
        s = self.request(
            "POST", "/upload-sessions", body, user, {"Idempotency-Key": key}, 201
        )
        replay = self.request(
            "POST", "/upload-sessions", body, user, {"Idempotency-Key": key}, 201
        )
        assert replay["sessionId"] == s["sessionId"]
        path = "/upload-sessions/" + s["sessionId"]
        if s["uploadMode"] == "SINGLE":
            self.request("PUT", path + "/content", data, user)
        else:
            count = (len(data) + s["partSizeBytes"] - 1) // s["partSizeBytes"]
            for i in range(count):
                part = data[i * s["partSizeBytes"] : (i + 1) * s["partSizeBytes"]]
                headers = {"X-Part-SHA256": hashlib.sha256(part).hexdigest()}
                self.request("PUT", path + f"/parts/{i + 1}", part, user, headers)
                if i == 0:
                    state = self.request("GET", path, user=user)
                    assert len(state["confirmedParts"]) == 1
                    self.request(
                        "PUT", path + "/parts/1", part, user, headers
                    )  # retry the confirmed part
        self.request("POST", path + "/complete", user=user, expected=202)
        for _ in range(120):
            f = self.request("GET", "/files/" + s["fileId"], user=user)
            if f["status"] == "AVAILABLE":
                break
            if f["status"] in ("FAILED", "CORRUPTED", "CANCELLED"):
                raise AssertionError(f)
            time.sleep(0.5)
        else:
            raise AssertionError("File verification timed out")
        recovered = self.request(
            "GET", "/files/" + s["fileId"] + "/content", user=user, binary=True
        )
        assert (
            data == recovered and hashlib.sha256(recovered).hexdigest() == f["sha256"]
        )
        print(
            f"PASS {category}: {f['storage']}, SHA-256 original == recovered",
            flush=True,
        )
        return f


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--url", default="https://localhost:8443/api/v1")
    parser.add_argument("--accounts", default=".runtime/accounts.properties")
    parser.add_argument("--certificate", default=".runtime/tls.crt")
    args = parser.parse_args()
    c = Client(
        args.url,
        args.accounts,
        args.certificate if args.url.startswith("https:") else None,
    )
    c.request("GET", "/me")
    identity = "SMOKE-" + uuid.uuid4().hex
    payload = json.dumps(
        {
            "schema_version": 1,
            "reading_id": identity + "-1",
            "meter_id": identity,
            "sequence_number": 1,
            "measured_at": "2026-11-14T10:00:00Z",
            "energy_kwh": 1542.8,
        },
        indent=2,
    ).encode()
    reading = c.request("POST", "/meter-readings", payload, "meter", expected=201)
    assert c.request("POST", "/meter-readings", payload, "meter")["duplicate"]
    c.request(
        "POST",
        "/meter-readings",
        payload.replace(b"1542.8", b"1542.9"),
        "meter",
        expected=409,
    )
    assert (
        c.request("GET", "/files/" + reading["fileId"] + "/content", binary=True)
        == payload
    )
    print(
        "PASS METER_READING: DATABASE, exact bytes, duplicate replay and conflicting retry",
        flush=True,
    )
    incident = c.incident()
    c.upload(
        "INCIDENT",
        b"legacy diagnostic without personal data\n" * 100,
        incidentId=incident["id"],
        attachmentType="LEGACY_LOG",
        sensitivity="NON_SENSITIVE",
    )
    c.upload(
        "INCIDENT",
        b"binary diagnostic report\n" * 100,
        incidentId=incident["id"],
        attachmentType="BINARY",
        sensitivity="NON_SENSITIVE",
    )
    doc = c.upload(
        "CONNECTION_DOCUMENT",
        b"FICTITIOUS PERSONAL DOCUMENT\n" * 100,
        user="connection",
        applicationId="DEMO-APP",
        documentType="APPLICATION",
    )
    c.request(
        "GET", "/files/" + doc["id"] + "/content", user="connection2", expected=403
    )
    print("PASS document authorization: second owner denied", flush=True)
    c.upload("DRONE_VIDEO", b"DRONE-FIXTURE" * (8 * 1024 * 1024 // 13 + 2))
    c.request("GET", "/stats/technical")
    c.request("GET", "/stats/business")
    analysis = c.request("GET", "/incidents/" + incident["id"] + "/analysis")
    print(
        "PASS file availability independent of ML; current ML state:",
        analysis["mlStatus"],
        flush=True,
    )
    print(
        "All smoke checks passed. This does not certify 10x isolation, HA or >1GB resource bounds."
    )


if __name__ == "__main__":
    main()
