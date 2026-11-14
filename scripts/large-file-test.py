#!/usr/bin/env python3
"""Bounded-memory transport fixture, not a semantic video validation test."""

import argparse, base64, hashlib, json, time, urllib.request, threading
from pathlib import Path
from smoke_test_import import Client


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--url", default="https://localhost:8443/api/v1")
    p.add_argument("--size-mib", type=int, default=1229)
    p.add_argument("--api-pid", type=int)
    a = p.parse_args()
    c = Client(
        a.url,
        ".runtime/accounts.properties",
        ".runtime/tls.crt" if a.url.startswith("https:") else None,
    )
    size = a.size_mib * 1024 * 1024
    if size <= 0:
        p.error("size must be positive")
    block = b"FILEGRID" + b"\0" * (8 * 1024 * 1024 - 8)
    sha = hashlib.sha256()
    for offset in range(0, size, len(block)):
        sha.update(block[: min(len(block), size - offset)])
    expected = sha.hexdigest()
    start = time.monotonic()
    memory = []
    stop = threading.Event()

    def sample():
        while not stop.wait(0.1):
            try:
                for line in Path(f"/proc/{a.api_pid}/status").read_text().splitlines():
                    if line.startswith("VmRSS:"):
                        memory.append(int(line.split()[1]) * 1024)
            except OSError:
                pass

    thread = threading.Thread(target=sample, daemon=True)
    if a.api_pid:
        thread.start()
    import uuid

    s = c.request(
        "POST",
        "/upload-sessions",
        {
            "category": "DRONE_VIDEO",
            "filename": "large-transport-fixture.bin",
            "contentType": "application/octet-stream",
            "sizeBytes": size,
            "sha256": expected,
        },
        headers={"Idempotency-Key": str(uuid.uuid4())},
        expected=201,
    )
    path = "/upload-sessions/" + s["sessionId"]
    count = (size + len(block) - 1) // len(block)
    for i in range(count):
        part = block[: min(len(block), size - i * len(block))]
        c.request(
            "PUT",
            path + f"/parts/{i + 1}",
            part,
            headers={"X-Part-SHA256": hashlib.sha256(part).hexdigest()},
        )
        if i == 0:
            assert len(c.request("GET", path)["confirmedParts"]) == 1
            # Reconnect and replay a confirmed part; no duplicate logical part.
            c.request(
                "PUT",
                path + "/parts/1",
                part,
                headers={"X-Part-SHA256": hashlib.sha256(part).hexdigest()},
            )
        if (i + 1) % 32 == 0:
            print(f"Uploaded {i + 1}/{count} parts", flush=True)
    c.request("POST", path + "/complete", expected=202)
    for _ in range(240):
        f = c.request("GET", "/files/" + s["fileId"])
        if f["status"] == "AVAILABLE":
            break
        if f["status"] in ("FAILED", "CORRUPTED"):
            raise AssertionError(f["status"])
        time.sleep(0.5)
    else:
        raise AssertionError("Verification timed out")
    request = urllib.request.Request(
        c.base + "/files/" + s["fileId"] + "/content",
        headers={
            "Authorization": "Basic "
            + base64.b64encode(f"admin:{c.accounts['admin']}".encode()).decode()
        },
    )
    recovered = hashlib.sha256()
    received = 0
    with urllib.request.urlopen(request, context=c.context, timeout=240) as response:
        while chunk := response.read(65536):
            recovered.update(chunk)
            received += len(chunk)
    stop.set()
    if a.api_pid:
        thread.join()
    assert received == size and recovered.hexdigest() == expected
    print(
        json.dumps(
            {
                "result": "PASS",
                "sizeBytes": size,
                "sha256": expected,
                "seconds": round(time.monotonic() - start, 2),
                "peakApiRssBytes": max(memory) if memory else None,
                "fileId": s["fileId"],
                "note": "Transport fixture; Compose/host-loss/10x isolation not certified",
            }
        ),
        flush=True,
    )


if __name__ == "__main__":
    main()
