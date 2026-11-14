#!/usr/bin/env python3
"""BH02/03 open-loop, bounded, simultaneous four-category benchmark. Never deletes data."""

import argparse, concurrent.futures, hashlib, json, math, shutil, threading, time, uuid, itertools
from datetime import datetime, timezone
from pathlib import Path
from smoke_test_import import Client

CATEGORIES = ("METER_READING", "INCIDENT", "CONNECTION_DOCUMENT", "DRONE_VIDEO")
RATES = dict(zip(CATEGORIES, (2.0, 0.1, 0.1, 0.1)))
SIZES = dict(zip(CATEGORIES, (1024, 1024 * 1024, 256 * 1024, 8 * 1024 * 1024 + 17)))


def quantile(values, p):
    if not values:
        return None
    s = sorted(values)
    k = (len(s) - 1) * p
    lo = math.floor(k)
    hi = math.ceil(k)
    return s[lo] + (s[hi] - s[lo]) * (k - lo)


class RetryClient(Client):
    def request(self, *args, **kwargs):
        for attempt in range(5):
            try:
                return super().request(*args, **kwargs)
            except (OSError, AssertionError) as e:
                retry = isinstance(e, OSError) or any(
                    ("got " + str(n) + ":") in str(e) for n in (429, 502, 503, 504)
                )
                if not retry or attempt == 4:
                    raise
                time.sleep(min(2, 0.1 * 2**attempt))


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--url", default="https://localhost:18443/api/v1")
    p.add_argument("--runtime-dir", type=Path, default=Path(".runtime/bh01"))
    p.add_argument("--seconds", type=int, default=300)
    p.add_argument("--spike", choices=CATEGORIES, default="INCIDENT")
    p.add_argument("--multiplier", type=float, default=10)
    p.add_argument("--min-samples", type=int, default=20)
    p.add_argument("--rate-scale", type=float, default=1)
    p.add_argument("--report", type=Path)
    a = p.parse_args()
    if a.seconds < 1 or a.rate_scale <= 0:
        p.error("positive duration/rate required")
    if shutil.disk_usage(".").free < 4 * 1024**3:
        raise SystemExit("Need >=4GiB free; no volumes will be deleted automatically")
    run = "ISO-" + uuid.uuid4().hex[:12]
    meter_sequences = itertools.count(1)
    rows = []
    lock = threading.Lock()
    clients = {
        c: RetryClient(
            a.url, a.runtime_dir / "accounts.properties", a.runtime_dir / "tls.crt"
        )
        for c in CATEGORIES
    }
    fixtures = {c: b"X" * SIZES[c] for c in CATEGORIES if c != "METER_READING"}

    def operation(category, index):
        client = clients[category]
        if category == "METER_READING":
            payload = json.dumps(
                {
                    "schema_version": 1,
                    "reading_id": f"{run}-{index}",
                    "meter_id": run,
                    "sequence_number": next(meter_sequences),
                    "measured_at": datetime.now(timezone.utc).isoformat(),
                    "energy_kwh": 1000 + index,
                    "padding": "x" * 700,
                }
            ).encode()
            client.request(
                "POST", "/meter-readings", payload, "meter", expected=(200, 201)
            )
            return len(payload)
        context = {}
        user = "admin"
        if category == "INCIDENT":
            context = {
                "incidentId": client.incident(stationId=run)["id"],
                "attachmentType": "BINARY",
                "sensitivity": "NON_SENSITIVE",
            }
        if category == "CONNECTION_DOCUMENT":
            context = {"applicationId": run}
            user = "connection"
        # Suppress fixture success output; Client.upload has no mutable shared state.
        import contextlib, io

        # Do not redirect global stdout from threads: use a small per-operation implementation.
        data = fixtures[category]
        body = {
            "category": category,
            "filename": run + ".bin",
            "contentType": "application/octet-stream",
            "sizeBytes": len(data),
            "sha256": hashlib.sha256(data).hexdigest(),
            **context,
        }
        key = str(uuid.uuid4())
        session = client.request(
            "POST", "/upload-sessions", body, user, {"Idempotency-Key": key}, 201
        )
        path = "/upload-sessions/" + session["sessionId"]
        if session["uploadMode"] == "SINGLE":
            client.request("PUT", path + "/content", data, user)
        else:
            size = session["partSizeBytes"]
            for n, offset in enumerate(range(0, len(data), size), 1):
                part = data[offset : offset + size]
                client.request(
                    "PUT",
                    path + f"/parts/{n}",
                    part,
                    user,
                    {"X-Part-SHA256": hashlib.sha256(part).hexdigest()},
                )
        client.request("POST", path + "/complete", user=user, expected=202)
        deadline = time.monotonic() + 90
        while True:
            f = client.request("GET", "/files/" + session["fileId"], user=user)
            if f["status"] == "AVAILABLE":
                break
            if f["status"] in ("FAILED", "CORRUPTED") or time.monotonic() > deadline:
                raise AssertionError("Availability failed " + f["status"])
            time.sleep(0.1)
        recovered = client.request(
            "GET", "/files/" + session["fileId"] + "/content", user=user, binary=True
        )
        if hashlib.sha256(recovered).hexdigest() != body["sha256"]:
            raise AssertionError("Integrity failure")
        return len(data)

    index = 0
    for phase in ("baseline", "spike"):
        print(
            json.dumps(
                {
                    "event": "phase_started",
                    "phase": phase,
                    "spike": a.spike,
                    "seconds": a.seconds,
                    "run": run,
                }
            ),
            flush=True,
        )
        start = time.monotonic()
        end = start + a.seconds
        next_due = {c: start for c in CATEGORIES}
        active = {c: 0 for c in CATEGORIES}
        futures = []
        pools = {
            c: concurrent.futures.ThreadPoolExecutor(max_workers=4) for c in CATEGORIES
        }

        def work(cat, i, due):
            began = time.monotonic()
            ok = False
            error = ""
            size = 0
            try:
                size = operation(cat, i)
                ok = True
            except Exception as e:
                error = str(e)[:300]
            finished = time.monotonic()
            with lock:
                rows.append(
                    {
                        "phase": phase,
                        "category": cat,
                        "launchedAt": began - start,
                        "finishedAt": finished - start,
                        "queueDelayMs": (began - due) * 1000,
                        "durationMs": (finished - due) * 1000,
                        "success": ok,
                        "bytes": size,
                        "error": error,
                    }
                )
                active[cat] -= 1

        while time.monotonic() < end:
            now = time.monotonic()
            for cat in CATEGORIES:
                rate = (
                    RATES[cat]
                    * a.rate_scale
                    * (a.multiplier if phase == "spike" and cat == a.spike else 1)
                )
                if now >= next_due[cat]:
                    due = next_due[cat]
                    next_due[cat] += 1 / rate
                    with lock:
                        accepted = active[cat] < 8
                        if accepted:
                            active[cat] += 1
                        else:
                            rows.append(
                                {
                                    "phase": phase,
                                    "category": cat,
                                    "durationMs": 0,
                                    "queueDelayMs": 0,
                                    "success": False,
                                    "bytes": 0,
                                    "error": "CLIENT_BACKPRESSURE",
                                    "launchedAt": now - start,
                                    "finishedAt": now - start,
                                }
                            )
                    if accepted:
                        futures.append(pools[cat].submit(work, cat, index, due))
                        index += 1
            time.sleep(0.005)
        for pool in pools.values():
            pool.shutdown(wait=True)
        print(
            json.dumps(
                {
                    "event": "phase_completed",
                    "phase": phase,
                    "drainSeconds": time.monotonic() - end,
                }
            ),
            flush=True,
        )
    summary = {}
    checks = []
    for cat in CATEGORIES:
        summary[cat] = {}
        for phase in ("baseline", "spike"):
            data = [x for x in rows if x["category"] == cat and x["phase"] == phase]
            success = [x for x in data if x["success"]]
            latencies = [x["durationMs"] for x in success]
            summary[cat][phase] = {
                "offered": len(data),
                "eventualCompleted": len(success),
                "completedInWindow": sum(x["finishedAt"] <= a.seconds for x in success),
                "achievedOperationsPerSecond": sum(
                    x["finishedAt"] <= a.seconds for x in success
                )
                / a.seconds,
                "errorRate": 1 - len(success) / len(data) if data else 1,
                "p50Ms": quantile(latencies, 0.5),
                "p95Ms": quantile(latencies, 0.95),
                "p99Ms": quantile(latencies, 0.99),
                "bytes": sum(x["bytes"] for x in success),
                "maxQueueDelayMs": max((x["queueDelayMs"] for x in data), default=0),
            }
        b, s = summary[cat]["baseline"], summary[cat]["spike"]
        if cat != a.spike:
            enough = (
                min(b["eventualCompleted"], s["eventualCompleted"]) >= a.min_samples
            )
            ratio = s["p95Ms"] / b["p95Ms"] if b["p95Ms"] and s["p95Ms"] else None
            checks.append(
                {
                    "category": cat,
                    "samplesSufficient": enough,
                    "p95Ratio": ratio,
                    "errorRateIncrease": s["errorRate"] - b["errorRate"],
                    "pass": enough
                    and ratio is not None
                    and ratio <= 1.2
                    and s["errorRate"] - b["errorRate"] < 0.01,
                }
            )
    sp = summary[a.spike]
    offeredRatio = (
        sp["spike"]["offered"] / sp["baseline"]["offered"]
        if sp["baseline"]["offered"]
        else 0
    )
    result = {
        "run": run,
        "spike": a.spike,
        "secondsPerPhase": a.seconds,
        "baselineRates": {k: v * a.rate_scale for k, v in RATES.items()},
        "fixtureSizes": SIZES,
        "offeredSpikeRatio": offeredRatio,
        "checks": checks,
        "summary": summary,
        "pass": all(x["pass"] for x in checks)
        and offeredRatio >= a.multiplier * 0.95
        and all(x["success"] for x in rows),
        "rows": rows,
        "limits": "Drone transport fixture is 8MiB+17 bytes, not semantic video; hardware/low sample confidence must be reported.",
    }
    path = a.report or a.runtime_dir / (run + ".json")
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(result, indent=2) + "\n")
    print(json.dumps({k: v for k, v in result.items() if k != "rows"}), flush=True)
    raise SystemExit(0 if result["pass"] else 2)


if __name__ == "__main__":
    main()
