#!/usr/bin/env bash
set -euo pipefail

export HOME="${BRIDGE_HOME:-/data}"
export BRIDGE_CONTROL_HOST="${BRIDGE_CONTROL_HOST:-0.0.0.0}"
export BRIDGE_CONTROL_PORT="${BRIDGE_CONTROL_PORT:-8081}"

if [ "$(id -u)" = "0" ]; then
  echo "ERROR: proton-bridge must not run as root" >&2
  exit 1
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
