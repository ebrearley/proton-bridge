#!/usr/bin/env bash
# One-time / add-account interactive login for Proton Mail Bridge.
# Drops you into the Bridge shell so you can run `login` (once per account),
# `info` (to print credentials), and `exit`.
set -euo pipefail

DATA_DIR="${PROTON_BRIDGE_DATA:-/var/app-data/proton-bridge}"
IMAGE="shenxn/protonmail-bridge:latest"

mkdir -p "$DATA_DIR"

cat <<'EOF'
Proton Mail Bridge - interactive login
=======================================
You'll be dropped into the Bridge shell. Then run:
  login    # enter Proton email, password, 2FA code, mailbox password if set
           # repeat 'login' once per additional account
  info     # prints IMAP/SMTP host, port, username, and bridge password
  exit     # leave the shell when done

After exiting, start the service headless with:
  docker compose up -d
EOF

exec docker run --rm -it -v "${DATA_DIR}:/root" "${IMAGE}" init
