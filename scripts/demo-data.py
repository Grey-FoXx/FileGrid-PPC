#!/usr/bin/env python3
"""Seed nearby fictitious incidents for the synthetic storm demonstration."""

import argparse
from smoke_test_import import Client


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--count", type=int, default=22)
    p.add_argument("--url", default="https://localhost:8443/api/v1")
    a = p.parse_args()
    c = Client(
        a.url,
        ".runtime/accounts.properties",
        ".runtime/tls.crt" if a.url.startswith("https:") else None,
    )
    for i in range(a.count):
        incident = c.incident(
            stationId=f"ST-STORM-{i:03d}",
            severity=4 + i % 2,
            affectedCustomers=900 + i * 50,
            latitude=44.18 + (i % 5) * 0.0002,
            longitude=28.65 + (i % 4) * 0.0002,
            safetyCritical=i == 0,
        )
        c.upload(
            "INCIDENT",
            f"Synthetic storm diagnostic {i}".encode(),
            incidentId=incident["id"],
            attachmentType="BINARY",
            sensitivity="NON_SENSITIVE",
        )
    print("Synthetic incidents ready. Open the dispatch dashboard.")


if __name__ == "__main__":
    main()
