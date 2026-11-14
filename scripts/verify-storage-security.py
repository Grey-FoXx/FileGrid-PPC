#!/usr/bin/env python3
"""Private-container FTPS and S3 privilege checks; never deletes data or prints secrets."""

import json, os, subprocess
from pathlib import Path

runtime = Path(".runtime/bh01")
env = {
    **os.environ,
    "COMPOSE_PROJECT_NAME": "filegrid-bh01",
    "FILEGRID_RUNTIME_DIR": str(runtime),
    "FILEGRID_HTTPS_PORT": "18443",
}


def compose(*args, **kw):
    return subprocess.run(
        ["docker", "compose", "-p", "filegrid-bh01", *args],
        env=env,
        capture_output=True,
        text=True,
        **kw,
    )


# The application must not inherit root or other services' credentials.
container = compose("ps", "-q", "api", check=True).stdout.strip()
values = json.loads(
    subprocess.check_output(
        ["docker", "inspect", "--format", "{{json .Config.Env}}", container], text=True
    )
)
keys = {x.split("=", 1)[0] for x in values}
assert not {"MINIO_ROOT_USER", "MINIO_ROOT_PASSWORD"} & keys
result = compose(
    "exec",
    "-T",
    "api",
    "sh",
    "-c",
    "test ! -e /run/filegrid/services.env && test ! -e /run/filegrid/provision.env && test ! -e /run/filegrid/ftp-tls.key",
    check=True,
)
print(
    "PASS API has no root MinIO environment or administrative secret mounts", flush=True
)
# Each legacy TLS protocol must fail, a current protocol with correct CA/name must succeed.
for option in ("-tls1", "-tls1_1"):
    r = compose(
        "exec",
        "-T",
        "ftp",
        "openssl",
        "s_client",
        "-brief",
        "-starttls",
        "ftp",
        "-connect",
        "127.0.0.1:21",
        option,
        "-cipher",
        "DEFAULT:@SECLEVEL=0",
        input="",
        timeout=15,
    )
    assert r.returncode != 0, "Legacy FTPS TLS version accepted: " + option
print("PASS FTPS rejects TLS1.0 and TLS1.1", flush=True)
base = [
    "exec",
    "-T",
    "ftp",
    "openssl",
    "s_client",
    "-brief",
    "-starttls",
    "ftp",
    "-connect",
    "127.0.0.1:21",
    "-tls1_2",
    "-verify_return_error",
    "-CAfile",
    "/run/filegrid/ftp-tls.crt",
    "-verify_hostname",
]
r = compose(*base, "ftp", input="", timeout=15)
assert r.returncode == 0, "Trusted modern FTPS handshake failed: " + r.stderr[-300:]
r = compose(*base, "wrong.invalid", input="", timeout=15)
assert r.returncode != 0, "Wrong FTPS hostname accepted"
print("PASS FTPS trusted TLS1.2 handshake and wrong-host rejection", flush=True)
# The one-shot Python image has boto3; pass test-only app settings via stdin, never argv/logs.
settings = dict(
    line.split("=", 1)
    for line in (runtime / "api.env").read_text().splitlines()
    if "=" in line
)
report = json.loads((runtime / "verification.json").read_text())
document = next(f for f in report["files"] if f["category"] == "CONNECTION_DOCUMENT")
source = """import boto3,json,hashlib
from botocore.exceptions import ClientError
settings=json.loads(SETTINGS)
document=json.loads(DOCUMENT)
s=boto3.client('s3',endpoint_url='http://minio:9000',aws_access_key_id=settings['S3_ACCESS_KEY'],aws_secret_access_key=settings['S3_SECRET_KEY'],region_name='us-east-1')
raw=s.get_object(Bucket='filegrid',Key=document['id']+'.bin')['Body'].read()
assert len(raw)==document['sizeBytes']+16 and hashlib.sha256(raw).hexdigest()!=document['sha256']
for operation in [lambda:s.list_buckets(),lambda:s.get_bucket_policy(Bucket='filegrid'),lambda:s.create_bucket(Bucket='forbidden-filegrid-security-probe')]:
 try:operation();raise AssertionError('Administrative S3 operation unexpectedly allowed')
 except ClientError as e:assert e.response['ResponseMetadata']['HTTPStatusCode']==403
print('PASS app object access, ciphertext at rest and denied bucket/admin actions')
""".replace("SETTINGS", repr(json.dumps(settings))).replace(
    "DOCUMENT", repr(json.dumps(document))
)
r = compose(
    "run",
    "--rm",
    "--no-deps",
    "--entrypoint",
    "python",
    "storage-init",
    "-",
    input=source,
    timeout=60,
)
if r.returncode:
    raise AssertionError(
        "Private S3 privilege probe failed (credentials suppressed); " + r.stderr[-500:]
    )
print(r.stdout.strip(), flush=True)
print("Storage security checks passed")
