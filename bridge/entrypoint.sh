#!/usr/bin/env bash
set -euo pipefail

export HOME="${BRIDGE_HOME:-/data}"
export BRIDGE_CONTROL_HOST="${BRIDGE_CONTROL_HOST:-0.0.0.0}"
export BRIDGE_CONTROL_PORT="${BRIDGE_CONTROL_PORT:-8081}"

if [ "$(id -u)" = "0" ]; then
  mkdir -p "$HOME"
  chown -R bridge:bridge "$HOME"

  if [ -z "${BRIDGE_TLS_CERT_FILE:-}" ] && [ -z "${BRIDGE_TLS_KEY_FILE:-}" ] && [ -n "${PROTON_BRIDGE_TLS_DOMAIN:-}" ]; then
    export BRIDGE_TLS_CERT_FILE="/certs/certificates/${PROTON_BRIDGE_TLS_DOMAIN}.crt"
    export BRIDGE_TLS_KEY_FILE="/certs/certificates/${PROTON_BRIDGE_TLS_DOMAIN}.key"
  fi

  if [ -n "${BRIDGE_TLS_CERT_FILE:-}" ] || [ -n "${BRIDGE_TLS_KEY_FILE:-}" ]; then
    if [ -z "${BRIDGE_TLS_CERT_FILE:-}" ] || [ -z "${BRIDGE_TLS_KEY_FILE:-}" ]; then
      echo "ERROR: BRIDGE_TLS_CERT_FILE and BRIDGE_TLS_KEY_FILE must both be set for TLS" >&2
      exit 1
    fi
    mkdir -p /run/proton-bridge/tls
    cp "$BRIDGE_TLS_CERT_FILE" /run/proton-bridge/tls/cert.pem
    cp "$BRIDGE_TLS_KEY_FILE" /run/proton-bridge/tls/key.pem
    chown -R bridge:bridge /run/proton-bridge
    chmod 700 /run/proton-bridge /run/proton-bridge/tls
    chmod 600 /run/proton-bridge/tls/cert.pem /run/proton-bridge/tls/key.pem
    export BRIDGE_TLS_CERT_FILE=/run/proton-bridge/tls/cert.pem
    export BRIDGE_TLS_KEY_FILE=/run/proton-bridge/tls/key.pem
  fi

  exec gosu bridge "$0"
fi

mkdir -p "$HOME"
if [ ! -w "$HOME" ]; then
  echo "ERROR: $HOME is not writable by uid $(id -u)" >&2
  exit 1
fi

export GNUPGHOME="${GNUPGHOME:-$HOME/.gnupg}"
export PASSWORD_STORE_DIR="${PASSWORD_STORE_DIR:-$HOME/.password-store}"

mkdir -p "$GNUPGHOME" "$PASSWORD_STORE_DIR"
chmod 700 "$GNUPGHOME"

if ! gpg --batch --list-secret-keys --with-colons | grep -q '^sec:'; then
  gpg --batch --pinentry-mode loopback --passphrase '' \
    --quick-generate-key "Proton Bridge <bridge@localhost>" default default never
fi

pass_key_id="$(gpg --batch --list-secret-keys --with-colons | awk -F: '$1 == "sec" { print $5; exit }')"
if [ -z "$pass_key_id" ]; then
  echo "ERROR: unable to find or create a GPG key for pass" >&2
  exit 1
fi

if [ ! -s "$PASSWORD_STORE_DIR/.gpg-id" ]; then
  pass init "$pass_key_id" >/dev/null
fi

exec python3 /opt/proton-bridge/control_server.py
