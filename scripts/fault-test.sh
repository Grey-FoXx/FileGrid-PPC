#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
service="${1:-ftp}"
case "$service" in ftp|minio|ml-worker) ;; *) echo 'Choose ftp, minio or ml-worker' >&2; exit 2 ;; esac
trap 'docker compose start "$service" >/dev/null' EXIT
docker compose stop "$service"
echo "$service stopped. Verify unrelated categories and AVAILABLE files in the UI."
read -r -p 'Press Enter to restore the service. ' _
