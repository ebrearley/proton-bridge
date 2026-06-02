# Proton Mail Bridge — Headless Docker Service

**Date:** 2026-06-02
**Status:** Approved design
**Repo:** `proton-bridge` (standalone, private)

## Purpose

Run [Proton Mail Bridge](https://proton.me/mail/bridge) as an always-on, headless
service on the homelab host so that LAN clients (and host-local containers/scripts)
can access one or more Proton Mail accounts over standard IMAP and SMTP. Bridge
translates between Proton's end-to-end-encrypted API and a local IMAP/SMTP server.

## Requirements (decided during brainstorming)

- **Multiple Proton accounts** served by a single bridge instance.
- **LAN-accessible** to other physical machines, the host itself, and host-local
  containers — via host port publishing on the default Docker bridge network.
- **Hands-off auto-updates** — Bridge must stay current (Proton rejects outdated
  Bridge versions) with no manual intervention.
- **Standalone private git repo**, deployable on the existing single-host homelab
  (Portainer / `docker compose`), following local conventions where they apply.

## Approach (chosen: A)

Compose around the maintained community image
[`shenxn/protonmail-bridge`](https://github.com/shenxn/protonmail-bridge-docker),
which is itself **built upstream from Proton's official `.deb`** and republished on
new Proton releases. We add the deployment wiring (compose, ports, volume,
healthcheck, Watchtower label), one-time login + verification helper scripts, and
documentation. No custom Dockerfile.

Rejected alternatives:
- **B — own image from `.deb` + GHCR CI:** full supply-chain control, but
  reimplements what shenxn already does; higher maintenance. Not chosen.
- **C — `digrouz` image with in-container `AUTOUPGRADE`:** fewest parts but
  mutates the running container (non-reproducible). Not chosen.

## Architecture

Single long-running container:

- **Image:** `shenxn/protonmail-bridge:latest`
- **Process:** Bridge running headless (`--no-window`), serving IMAP and SMTP.
- **Keychain:** the image manages a GPG / `pass` keychain internally; no host
  keychain integration required.
- **No application code of our own** — the repo is YAML, shell helpers, and docs.

### Networking

- Default Docker `bridge` network (no macvlan).
- Publish container ports to the host, bound to `0.0.0.0`:
  - **IMAP:** host `1143` → container `143` (STARTTLS)
  - **SMTP:** host `1025` → container `25` (STARTTLS)
- Reachable at `192.168.3.250:1143` / `192.168.3.250:1025` from the LAN, from the
  host, and from host-local containers. Also reachable over Tailscale
  (`100.69.34.21`) since the ports bind to all host interfaces.
- Bridge presents a **self-signed TLS certificate** on both ports. Clients must
  either trust/import that cert or disable certificate validation. Bridge cannot
  serve fully plaintext.
- Per-account credentials are **Bridge-generated** (shown by the `info` command),
  not the Proton account password.

### State / persistence

- Bind mount `/var/app-data/proton-bridge` → container `/root` (matches homelab
  `/var/app-data/<service>` convention).
- Contents: GPG/`pass` keychain, Bridge configuration, encrypted account sessions.
- **Sensitive.** Never committed to git. The repo's `.gitignore` excludes any
  stray local data/env. Backups = back up this directory out of band.

## Components & data flow

```
LAN client / host / container
        │  IMAP 1143 (STARTTLS)   SMTP 1025 (STARTTLS)
        ▼
  host 192.168.3.250  ──published──▶  proton-bridge container
                                          │ (Bridge, --no-window)
                                          ▼
                                   Proton Mail API (TLS, E2EE)
```

- **Mail fetch:** client → IMAP 1143 → Bridge decrypts via Proton API → client.
- **Mail send:** client → SMTP 1025 → Bridge encrypts/relays via Proton API.

## Operations

### One-time login (`scripts/login.sh`)

```bash
docker run --rm -it -v /var/app-data/proton-bridge:/root shenxn/protonmail-bridge init
```

In the Bridge shell:
1. `login` → enter Proton email, password, 2FA/TOTP, and mailbox password if set.
2. Repeat `login` once per additional account.
3. `info` → record each account's IMAP/SMTP host, port, username, and
   Bridge-generated password.
4. `exit`.

Then `docker compose up -d` runs the bridge headless against the saved sessions.
Re-run `login.sh` later to add an account or re-authenticate an expired session.

### Updates

- `restart: unless-stopped`.
- Watchtower label `com.centurylinklabs.watchtower.enable=true` so the existing
  Watchtower stack pulls new `latest` builds and rolling-restarts. Because the
  upstream image tracks Proton releases, Bridge stays current automatically.

### Health & verification

- Compose `healthcheck`: TCP check that container port `143` is listening
  (`bash -c 'echo > /dev/tcp/127.0.0.1/143'` or equivalent available in the image).
- `scripts/verify.sh` (run from a LAN machine), proves real behavior:
  - `openssl s_client -starttls imap -connect <host>:1143` → inspect cert.
  - IMAP login with a Bridge-generated credential.
  - SMTP STARTTLS handshake / test on `1025`.

## Failure modes (documented in README)

| Symptom | Cause | Recovery |
|---|---|---|
| Clients fail to authenticate | Proton session expired/revoked | Re-run `scripts/login.sh`, `login` again |
| Client rejects connection | Self-signed cert not trusted | Import Bridge cert or disable cert validation in client |
| Mail stops, logs show version error | Proton forced a Bridge update | Watchtower auto-updates; if stuck, `docker compose pull && up -d` |
| Container won't start / keychain error | Wrong perms on `/var/app-data/proton-bridge` | Fix ownership/permissions on the bind mount |

## Repo layout

```
proton-bridge/
├── docker-compose.yml
├── scripts/
│   ├── login.sh        # one-time / add-account interactive login
│   └── verify.sh       # post-deploy LAN-side checks
├── .gitignore
├── README.md           # setup, client config, backup, troubleshooting
├── CLAUDE.md           # repo guidance in homelab style
└── docs/superpowers/specs/2026-06-02-proton-bridge-design.md
```

Deploy via `docker compose up -d` or import as a Portainer git-stack.
Publish: `gh repo create proton-bridge --private --source . --push`
(after `gh auth login`).

## Out of scope (YAGNI)

- Reverse proxy / external TLS termination (clients accept Bridge's self-signed cert).
- macvlan dedicated IP (abandoned in favor of host port publishing).
- Custom Dockerfile / own image build (that is Approach B).
- Secrets manager (credentials live only in the persisted volume, entered at login).
- Multi-host orchestration.

## Success criteria

1. `docker compose up -d` brings the container to a healthy state.
2. After `login.sh`, `info` lists every configured Proton account with credentials.
3. From another LAN machine, an IMAP client connects to `192.168.3.250:1143`,
   authenticates, and lists mail; SMTP send via `1025` succeeds.
4. Stopping/starting the host or container preserves sessions (no re-login needed).
5. Watchtower updates the image without manual steps and without losing sessions.
