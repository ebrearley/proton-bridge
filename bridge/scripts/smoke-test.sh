#!/usr/bin/env bash
set -euo pipefail

IMAGE="${1:-ericbrearley/proton-bridge:dev}"
EXPECTED_DEB_VERSION="$(tr -d '[:space:]' < VERSION)"
EXPECTED_APP_VERSION="${EXPECTED_DEB_VERSION%%-*}"
CONTAINER="proton-bridge-smoke"
STATUS_FILE="$(mktemp "${TMPDIR:-/tmp}/proton-bridge-status.XXXXXX.json")"
TERMINAL_FILE="$(mktemp "${TMPDIR:-/tmp}/proton-bridge-terminal.XXXXXX.log")"

cleanup() {
  docker rm -f "$CONTAINER" >/dev/null 2>&1 || true
  rm -f "$STATUS_FILE" "$TERMINAL_FILE"
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

if ! node - "$TERMINAL_FILE" <<'JS'
const fs = require("node:fs");
const outputPath = process.argv[2];
const ws = new WebSocket("ws://127.0.0.1:18081/api/terminal");
let output = "";
const done = (code) => {
  fs.writeFileSync(outputPath, output);
  try {
    ws.close();
  } catch {
  }
  process.exit(code);
};

const timer = setTimeout(() => done(2), 8000);
ws.addEventListener("message", async (event) => {
  if (typeof event.data === "string") {
    output += event.data;
  } else if (event.data instanceof Blob) {
    output += await event.data.text();
  } else {
    output += Buffer.from(event.data).toString("utf8");
  }
  if (output.includes("not able to detect a supported password manager")) {
    clearTimeout(timer);
    done(1);
  }
  if (output.includes(">>>") || output.includes("Proton Mail Bridge interactive shell")) {
    clearTimeout(timer);
    done(0);
  }
});
ws.addEventListener("error", () => {
  clearTimeout(timer);
  done(3);
});
JS
then
  cat "$TERMINAL_FILE" >&2
  exit 1
fi

if grep -q "not able to detect a supported password manager" "$TERMINAL_FILE"; then
  cat "$TERMINAL_FILE" >&2
  exit 1
fi

echo "Terminal smoke test passed for $IMAGE"
