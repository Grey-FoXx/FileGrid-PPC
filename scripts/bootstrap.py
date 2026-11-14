#!/usr/bin/env python3
"""Generate local-only persistent secrets. Never print credentials to build logs."""

import os, secrets, subprocess
from pathlib import Path

root = Path(os.environ.get("RUNTIME_DIR", "/runtime"))
root.mkdir(parents=True, exist_ok=True)


def create(name, data):
    path = root / name
    try:
        with path.open("xb") as f:
            f.write(data if isinstance(data, bytes) else data.encode())
        path.chmod(0o600)
    except FileExistsError:
        pass


if not (root / "services.env").exists():
    create(
        "services.env",
        "\n".join(
            f"{k}={secrets.token_hex(24)}"
            for k in [
                "POSTGRES_PASSWORD",
                "S3_ACCESS_KEY",
                "S3_SECRET_KEY",
                "FTP_PASSWORD",
            ]
        )
        + "\nPOSTGRES_USER=filegrid\nPOSTGRES_DB=filegrid\nFTP_USER=filegrid\n",
    )
if not (root / "accounts.properties").exists():
    roles = {
        "admin": "ADMIN",
        "dispatcher": "DISPATCHER",
        "connection": "CONNECTION_AGENT",
        "connection2": "CONNECTION_AGENT",
        "field": "FIELD_OPERATOR",
        "meter": "METER_INGEST",
    }
    accounts = {u: (secrets.token_hex(16), role) for u, role in roles.items()}
    create(
        "accounts.properties",
        "".join(f"{u}={p}:{role}\n" for u, (p, role) in accounts.items()),
    )
    create(
        "accounts.txt",
        "".join(f"{u} {p} {role}\n" for u, (p, role) in accounts.items()),
    )
create("encryption.key", secrets.token_bytes(32))
create("worker.token", secrets.token_hex(32) + "\n")
if not (root / "tls.crt").exists():
    subprocess.run(
        [
            "openssl",
            "req",
            "-x509",
            "-newkey",
            "rsa:2048",
            "-nodes",
            "-days",
            "30",
            "-subj",
            "/CN=localhost",
            "-addext",
            "subjectAltName=DNS:localhost,IP:127.0.0.1",
            "-keyout",
            str(root / "tls.key"),
            "-out",
            str(root / "tls.crt"),
        ],
        check=True,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    (root / "tls.key").chmod(0o600)
print("Persistent local credentials and TLS certificate ready.")
