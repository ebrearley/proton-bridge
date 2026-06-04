#!/usr/bin/env bash
set -euo pipefail

IMAGE="${1:-ericbrearley/proton-bridge:dev}"
EXPECTED_DEB_VERSION="$(tr -d '[:space:]' < VERSION)"
EXPECTED_APP_VERSION="${EXPECTED_DEB_VERSION%%-*}"
CONTAINER="proton-bridge-smoke"
TLS_CONTAINER="proton-bridge-smoke-tls"
STATUS_FILE="$(mktemp "${TMPDIR:-/tmp}/proton-bridge-status.XXXXXX.json")"
TERMINAL_FILE="$(mktemp "${TMPDIR:-/tmp}/proton-bridge-terminal.XXXXXX.log")"
TLS_CERT_DIR="$(mktemp -d "${TMPDIR:-/tmp}/proton-bridge-tls.XXXXXX")"

cleanup() {
  docker rm -f "$CONTAINER" "$TLS_CONTAINER" >/dev/null 2>&1 || true
  rm -f "$STATUS_FILE" "$TERMINAL_FILE"
  rm -rf "$TLS_CERT_DIR"
}
trap cleanup EXIT

cleanup
mkdir -p "$TLS_CERT_DIR"
docker run -d --name "$CONTAINER" -p 18025:25 -p 18143:143 -p 18081:8081 "$IMAGE" >/dev/null

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

python3 - <<'PY'
import socket
import time

for name, port in (("SMTP", 18025), ("IMAP", 18143)):
    deadline = time.monotonic() + 20
    while True:
        try:
            with socket.create_connection(("127.0.0.1", port), timeout=2):
                break
        except OSError:
            if time.monotonic() >= deadline:
                raise SystemExit(f"{name} forwarder did not accept connections on {port}")
            time.sleep(1)
    print(f"{name} forwarder accepted connections on {port}")
PY

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

openssl req -x509 -newkey rsa:2048 -nodes -days 1 \
  -keyout "$TLS_CERT_DIR/ca.key" \
  -out "$TLS_CERT_DIR/ca.crt" \
  -subj "/CN=Proton Bridge Smoke Test CA" >/dev/null 2>&1
openssl req -newkey rsa:2048 -nodes \
  -keyout "$TLS_CERT_DIR/privkey.pem" \
  -out "$TLS_CERT_DIR/server.csr" \
  -subj "/CN=mail.example.test" \
  -addext "subjectAltName=DNS:mail.example.test" >/dev/null 2>&1
openssl x509 -req \
  -in "$TLS_CERT_DIR/server.csr" \
  -CA "$TLS_CERT_DIR/ca.crt" \
  -CAkey "$TLS_CERT_DIR/ca.key" \
  -CAcreateserial \
  -out "$TLS_CERT_DIR/cert.pem" \
  -days 1 \
  -sha256 \
  -copy_extensions copy >/dev/null 2>&1
cat "$TLS_CERT_DIR/cert.pem" "$TLS_CERT_DIR/ca.crt" >"$TLS_CERT_DIR/fullchain.pem"

docker run -d --name "$TLS_CONTAINER" \
  -p 19025:25 \
  -p 19143:143 \
  -p 19081:8081 \
  -e BRIDGE_TLS_CERT_FILE=/certs/fullchain.pem \
  -e BRIDGE_TLS_KEY_FILE=/certs/privkey.pem \
  -v "$TLS_CERT_DIR:/certs:ro" \
  "$IMAGE" >/dev/null

ready=false
for _ in $(seq 1 30); do
  if curl -fsS http://127.0.0.1:19081/api/status >/dev/null; then
    ready=true
    break
  fi
  sleep 1
done

if [ "$ready" != true ]; then
  docker logs "$TLS_CONTAINER" >&2 || true
  exit 1
fi

sleep 5

openssl s_client -starttls imap \
  -connect 127.0.0.1:19143 \
  -servername mail.example.test \
  -verify_hostname mail.example.test \
  -verify_return_error \
  -CAfile "$TLS_CERT_DIR/ca.crt" \
  -brief </dev/null >/dev/null

openssl s_client -starttls smtp \
  -connect 127.0.0.1:19025 \
  -servername mail.example.test \
  -verify_hostname mail.example.test \
  -verify_return_error \
  -CAfile "$TLS_CERT_DIR/ca.crt" \
  -brief </dev/null >/dev/null

echo "TLS smoke test passed for $IMAGE"
