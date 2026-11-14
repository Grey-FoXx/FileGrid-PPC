#!/usr/bin/env python3
"""Reproducible incident load generator; produces measurements, not isolation claims."""

import argparse, time, statistics, json
from concurrent.futures import ThreadPoolExecutor
from smoke_test_import import Client


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--url", default="https://localhost:8443/api/v1")
    p.add_argument("--rate", type=float, default=1)
    p.add_argument("--seconds", type=int, default=60)
    p.add_argument("--workers", type=int, default=8)
    a = p.parse_args()
    if a.rate <= 0 or a.seconds <= 0:
        p.error("rate and seconds must be positive")
    c = Client(
        a.url,
        ".runtime/accounts.properties",
        ".runtime/tls.crt" if a.url.startswith("https:") else None,
    )

    def one(i):
        start = time.monotonic()
        try:
            incident = c.incident(stationId=f"LOAD-{i}")
            # Includes upload + storage verification + download for an actual incident flow.
            c.upload(
                "INCIDENT",
                b"load-fixture\n" * 80000,
                incidentId=incident["id"],
                attachmentType="BINARY",
                sensitivity="NON_SENSITIVE",
            )
            return (time.monotonic() - start, True)
        except Exception:
            return (time.monotonic() - start, False)

    futures = []
    start = time.monotonic()
    with ThreadPoolExecutor(max_workers=a.workers) as pool:
        for i in range(int(a.rate * a.seconds)):
            delay = start + i / a.rate - time.monotonic()
            if delay > 0:
                time.sleep(delay)
            futures.append(pool.submit(one, i))
    results = [f.result() for f in futures]
    latencies = sorted(x[0] for x in results)

    def q(p):
        return (
            latencies[min(len(latencies) - 1, int((len(latencies) - 1) * p))]
            if latencies
            else None
        )

    print(
        json.dumps(
            {
                "requestedRate": a.rate,
                "requests": len(results),
                "elapsedSeconds": time.monotonic() - start,
                "errors": sum(not x[1] for x in results),
                "p50Seconds": q(0.5),
                "p95Seconds": q(0.95),
                "p99Seconds": q(0.99),
            }
        )
    )


if __name__ == "__main__":
    main()
