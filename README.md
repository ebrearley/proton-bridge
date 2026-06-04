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

## Optional Trusted TLS

Proton Bridge uses a self-signed local STARTTLS certificate by default. That is
fine for local-only use, but strict mail clients can reject it when connecting
from another device.

Trusted TLS is optional. Leave `PROTON_BRIDGE_TLS_DOMAIN`,
`BRIDGE_TLS_CERT_FILE`, and `BRIDGE_TLS_KEY_FILE` blank to keep the default
behavior.

To use trusted TLS, clients must connect with a real public DNS name covered by
the certificate, for example:

```text
mail.example.com
```

One DNS name is enough for both IMAP and SMTP. Configure the mail client with
that same host name for IMAP `1143` and SMTP `1025`, both using STARTTLS. Raw
LAN IPs and `.local` hostnames cannot be registered with Let's Encrypt.

### Bring Your Own Certificate

If you already manage certificates with something like Caddy, Nginx Proxy
Manager, Certbot, or a reverse proxy host, mount the certificate directory and
point Bridge at the files. Explicit `BRIDGE_TLS_CERT_FILE` and
`BRIDGE_TLS_KEY_FILE` values override the inferred Let's Encrypt paths.

```env
PROTON_BRIDGE_TLS_DOMAIN=mail.example.com
PROTON_BRIDGE_TLS_CERTS_PATH=./certs
BRIDGE_TLS_CERT_FILE=/certs/fullchain.pem
BRIDGE_TLS_KEY_FILE=/certs/privkey.pem
```

Then place the files at:

```text
./certs/fullchain.pem
./certs/privkey.pem
```

Recreate the Bridge container after changing certificates:

```bash
docker compose up -d --build --force-recreate proton-bridge
```

### Obtain a Let's Encrypt Certificate

This compose file includes optional `lego` ACME helpers. They do not run during
normal startup.

DNS-01 is recommended for LAN deployments because it only requires DNS API
access. It does not require opening port `80` to the internet.

Configure `.env`:

```env
PROTON_BRIDGE_TLS_DOMAIN=mail.example.com
LETSENCRYPT_EMAIL=you@example.com
PROTON_BRIDGE_ACME_DNS_PROVIDER=cloudflare
```

With `PROTON_BRIDGE_TLS_DOMAIN` set and `BRIDGE_TLS_CERT_FILE` /
`BRIDGE_TLS_KEY_FILE` blank, the Bridge container automatically uses lego's
standard output files:

```text
/certs/certificates/mail.example.com.crt
/certs/certificates/mail.example.com.key
```

Put DNS provider credentials in `.env.acme`. For Cloudflare:

```env
CLOUDFLARE_DNS_API_TOKEN=your-token
```

Request or renew the certificate:

```bash
docker compose --profile acme-dns run --rm proton-bridge-acme-dns
docker compose up -d --build --force-recreate proton-bridge
```

HTTP-01 is also available, but `mail.example.com` must resolve publicly to this
host and port `80` must be reachable from the internet:

```bash
docker compose --profile acme-http run --rm proton-bridge-acme-http
docker compose up -d --build --force-recreate proton-bridge
```

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
