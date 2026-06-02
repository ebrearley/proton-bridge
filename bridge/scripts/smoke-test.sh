#!/usr/bin/env bash
set -euo pipefail

IMAGE="${1:-ericbrearley/proton-bridge:dev}"
EXPECTED_DEB_VERSION="$(tr -d '[:space:]' < VERSION)"
EXPECTED_APP_VERSION="${EXPECTED_DEB_VERSION%%-*}"
CONTAINER="proton-bridge-smoke"
STATUS_FILE="$(mktemp "${TMPDIR:-/tmp}/proton-bridge-status.XXXXXX.json")"

cleanup() {
  docker rm -f "$CONTAINER" >/dev/null 2>&1 || true
  rm -f "$STATUS_FILE"
}
trap cleanup EXIT

cleanup
docker run -d --name "$CONTAINER" -p 18081:8081 "$IMAGE" >/dev/null

ready=false
for _ in $(seq 1 30); do
  if curl -fsS http://127.0.0.1:18081/api/status >"$STATUS_FILE"; then
    ready=true
    break
  fi
  sleep 1
done

if [ "$ready" != true ]; then
  docker logs "$CONTAINER" >&2 || true
  exit 1
fi

cat "$STATUS_FILE"
python3 - "$STATUS_FILE" "$EXPECTED_APP_VERSION" <<'PY'
import json
import sys

status_path, expected = sys.argv[1], sys.argv[2]
with open(status_path, encoding="utf-8") as handle:
    status = json.load(handle)
expected_version = f"Proton Mail Bridge {expected}"

if status.get("running") is not True:
    raise SystemExit(f"Bridge is not running: {status}")
if status.get("version") != expected_version:
    raise SystemExit(f"Expected {expected_version!r}, got {status.get('version')!r}")
PY

echo "Smoke test passed for $IMAGE"
