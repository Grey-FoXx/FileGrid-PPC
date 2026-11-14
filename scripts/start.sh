#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
command -v docker >/dev/null || { echo 'Docker is required.' >&2; exit 1; }
docker compose version >/dev/null
docker info >/dev/null 2>&1 || { echo 'Docker daemon is unavailable or this user cannot access its socket. Resolve Docker access, then rerun this command.' >&2; exit 1; }
export LOCAL_UID="$(id -u)" LOCAL_GID="$(id -g)"
mkdir -p .runtime/simulator
chmod 700 .runtime .runtime/simulator
docker compose --profile tools run --build --rm --no-deps bootstrap
docker compose up --build -d
port="${FILEGRID_HTTPS_PORT:-8443}"
echo "Waiting for FileGrid at https://localhost:$port ..."
for attempt in $(seq 1 120); do
  if docker compose exec -T gateway wget -q --no-check-certificate -O /dev/null "https://localhost:8443/" 2>/dev/null; then
    # API startup can lag the static frontend; verify the backend health separately.
    if docker compose exec -T postgres sh -c 'pg_isready -U filegrid -d filegrid' >/dev/null 2>&1 && docker compose logs api --tail 200 | grep -q 'Started FileGridApplication'; then
      echo "Ready: https://localhost:$port"
      echo 'Local credentials: .runtime/accounts.txt'
      exit 0
    fi
  fi
  sleep 2
done
echo 'Startup timed out. Inspect: docker compose logs --tail=100' >&2
exit 1
