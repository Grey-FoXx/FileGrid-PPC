#!/usr/bin/env python3
"""Generate local-only persistent secrets. Never print credentials to build logs."""

import os, secrets, subprocess
from pathlib import Path

os.umask(0o077)  # Secret temporary files must be private from their first write.
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

# Upgrade legacy MinIO root-as-app settings without replacing data, accounts, AES or gateway TLS.
service_path = root / "services.env"
settings = dict(
    line.split("=", 1) for line in service_path.read_text().splitlines() if "=" in line
)
if "MINIO_ROOT_USER" not in settings:
    create("services.pre-hardening.env", service_path.read_bytes())
    settings["MINIO_ROOT_USER"] = settings["S3_ACCESS_KEY"]
    settings["MINIO_ROOT_PASSWORD"] = settings["S3_SECRET_KEY"]
    settings["S3_ACCESS_KEY"] = "fgapp" + secrets.token_hex(12)
    settings["S3_SECRET_KEY"] = secrets.token_hex(24)
    temp = root / "services.env.new"
    temp.write_text("".join(f"{k}={v}\n" for k, v in settings.items()))
    temp.chmod(0o600)
    temp.replace(service_path)


def scoped_env(name, keys):
    path = root / name
    temp = root / (name + ".new")
    temp.write_text("".join(f"{k}={settings[k]}\n" for k in keys))
    temp.chmod(0o600)
    temp.replace(path)


scoped_env(
    "api.env",
    [
        "POSTGRES_USER",
        "POSTGRES_PASSWORD",
        "S3_ACCESS_KEY",
        "S3_SECRET_KEY",
        "FTP_USER",
        "FTP_PASSWORD",
    ],
)
scoped_env("postgres.env", ["POSTGRES_USER", "POSTGRES_PASSWORD", "POSTGRES_DB"])
scoped_env("minio.env", ["MINIO_ROOT_USER", "MINIO_ROOT_PASSWORD"])
scoped_env("ftp.env", ["FTP_USER", "FTP_PASSWORD"])
scoped_env(
    "provision.env",
    ["MINIO_ROOT_USER", "MINIO_ROOT_PASSWORD", "S3_ACCESS_KEY", "S3_SECRET_KEY"],
)
create("alerts.token", secrets.token_hex(32) + "\n")
meter_line = next(
    line
    for line in (root / "accounts.properties").read_text().splitlines()
    if line.startswith("meter=")
)
create("meter.properties", meter_line + "\n")
(root / "alertmanager").mkdir(exist_ok=True)
(root / "alertmanager").chmod(0o700)
if not (root / "ftp-tls.crt").exists():
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
            "/CN=ftp",
            "-addext",
            "subjectAltName=DNS:ftp,DNS:localhost,IP:127.0.0.1",
            "-keyout",
            str(root / "ftp-tls.key"),
            "-out",
            str(root / "ftp-tls.crt"),
        ],
        check=True,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    (root / "ftp-tls.key").chmod(0o600)
print("Scoped service credentials and private FTPS/alert credentials ready.")
