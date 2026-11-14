#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
command -v docker >/dev/null || { echo 'Docker is required.' >&2; exit 1; }
docker compose version >/dev/null
docker info >/dev/null 2>&1 || { echo 'Docker daemon is unavailable or this user cannot access its socket. Resolve Docker access, then rerun this command.' >&2; exit 1; }
export LOCAL_UID="$(id -u)" LOCAL_GID="$(id -g)"
export COMPOSE_PARALLEL_LIMIT="${COMPOSE_PARALLEL_LIMIT:-1}"
runtime_dir="${FILEGRID_RUNTIME_DIR:-.runtime}"
mkdir -p "$runtime_dir/simulator"
chmod 700 "$runtime_dir" "$runtime_dir/simulator"
docker compose --profile tools run --build --rm --no-deps bootstrap
docker compose up --build -d
port="${FILEGRID_HTTPS_PORT:-8443}"
echo "Waiting for FileGrid at https://localhost:$port ..."
for attempt in $(seq 1 120); do
  # These are live probes. Old startup log lines never imply current readiness.
  if docker compose exec -T api curl -fsS http://localhost:8080/actuator/health >/dev/null 2>&1 &&
     docker compose exec -T gateway wget -q --no-check-certificate -O /dev/null https://127.0.0.1:8443/ 2>/dev/null; then
    echo "Ready: https://localhost:$port"
    echo "Local credentials: $runtime_dir/accounts.txt"
    echo 'Gateway readiness only skips local certificate validation; smoke tests must trust the generated CA explicitly.'
    exit 0
  fi
  sleep 2
done
echo 'Startup timed out. Inspect the selected project with: docker compose ps; docker compose logs --tail=100' >&2
exit 1
