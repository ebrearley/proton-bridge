# proton-bridge

Headless Proton Mail Bridge for Docker, with a small browser UI for local status
and first-run Bridge login.

This repo builds two images:

- `ericbrearley/proton-bridge:<version>` / `ghcr.io/ericbrearley/proton-bridge:<version>`
- `ericbrearley/proton-bridge-ui:<version>` / `ghcr.io/ericbrearley/proton-bridge-ui:<version>`

Images are intentionally version-tagged. Do not publish or deploy `latest`.

## Getting Started

Build and start the stack:

```bash
docker compose up -d --build
```

Open the UI:

```text
http://localhost:3000
```

Published mail ports:

- IMAP: `localhost:1143`
- SMTP: `localhost:1025`

Bridge state is stored in the named Docker volume `proton_bridge_data`.

## First Login

Open the browser terminal:

```text
http://localhost:3000/terminal
```

In the terminal, run:

```text
login
info
exit
```

Paste Proton credentials only into the live terminal session. After `info`,
store the Bridge-generated IMAP/SMTP username and password in your password
manager. These generated mail credentials are not your Proton password, but they
are still secrets and must not be committed, logged, or shared.

## Optional Bind Mount

To store Bridge data at a host path instead of a named volume, replace the
Bridge service volume in `docker-compose.yml`:

```yaml
services:
  proton-bridge:
    volumes:
      - /var/app-data/proton-bridge:/data
```

Keep that directory private and back it up if you want to avoid repeating login
after a host rebuild.

## Publishing

The GitHub Actions workflow builds and pushes versioned tags only. To enable
Docker Hub publishing later, add the repository secret:

```bash
gh secret set DOCKERHUB_TOKEN
```
