#!/usr/bin/env bash
set -euo pipefail

IMAGE="${1:-ericbrearley/proton-bridge:dev}"
EXPECTED_DEB_VERSION="$(tr -d '[:space:]' < VERSION)"
EXPECTED_APP_VERSION="${EXPECTED_DEB_VERSION%%-*}"
CONTAINER="proton-bridge-smoke"

cleanup() {
  docker rm -f "$CONTAINER" >/dev/null 2>&1 || true
}
trap cleanup EXIT

cleanup
docker run -d --name "$CONTAINER" -p 18081:8081 "$IMAGE" >/dev/null

for _ in $(seq 1 30); do
  if curl -fsS http://127.0.0.1:18081/api/status >/tmp/proton-bridge-status.json; then
    break
  fi
  sleep 1
done

cat /tmp/proton-bridge-status.json
grep -q "$EXPECTED_APP_VERSION" /tmp/proton-bridge-status.json
echo "Smoke test passed for $IMAGE"
