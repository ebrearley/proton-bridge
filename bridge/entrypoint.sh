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

exec python3 /opt/proton-bridge/control_server.py
