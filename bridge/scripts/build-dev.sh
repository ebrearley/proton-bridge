#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
VERSION="$(tr -d '[:space:]' < "$ROOT/VERSION")"

docker buildx build \
  --load \
  --platform linux/amd64 \
  --build-arg "BRIDGE_DEB_VERSION=${VERSION}" \
  -t "ericbrearley/proton-bridge:dev" \
  -f "$ROOT/bridge/Dockerfile" \
  "$ROOT"
