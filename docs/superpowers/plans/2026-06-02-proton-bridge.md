# Proton Mail Bridge Headless Service — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up Proton Mail Bridge as an always-on headless Docker service on the homelab host, serving multiple Proton accounts to the LAN over IMAP/SMTP, with hands-off auto-updates.

**Architecture:** A single container from the community image `shenxn/protonmail-bridge` (built upstream from Proton's official `.deb`). Deployment wiring (compose, host port publishing, persistent volume, healthcheck, Watchtower label) plus interactive-login and verification helper scripts and docs live in this standalone private repo. No custom image.

**Tech Stack:** Docker + Docker Compose, `shenxn/protonmail-bridge:latest`, Bash, Watchtower (existing), `gh` CLI for publishing.

**Reference spec:** `docs/superpowers/specs/2026-06-02-proton-bridge-design.md`

**Host facts:** host LAN IP `192.168.3.250` (also Tailscale `100.69.34.21`); state dir convention `/var/app-data/<service>`; TZ `Australia/Melbourne`; existing Watchtower stack auto-updates labeled containers.

---

## File structure

| File | Responsibility |
|---|---|
| `docker-compose.yml` | The service definition: image, published ports, volume, env, healthcheck, Watchtower label. |
| `scripts/login.sh` | One-time / add-account interactive Bridge login (runs the image with `init`). |
| `scripts/verify.sh` | Post-deploy LAN-side checks: IMAP cert + SMTP port reachability. |
| `.gitignore` | Defensive ignores so no local state/secrets are committed. |
| `README.md` | Operator docs: setup, client config, backups, troubleshooting. |
| `CLAUDE.md` | Repo guidance in homelab style for future Claude sessions. |
| `docs/superpowers/specs/2026-06-02-proton-bridge-design.md` | Design (already committed). |

---

### Task 1: `.gitignore`

**Files:**
- Create: `/home/eric/source/proton-bridge/.gitignore`

- [ ] **Step 1: Create the file**

```gitignore
# Proton Bridge state lives in /var/app-data/proton-bridge (outside this repo).
# These are defensive ignores in case anything sensitive lands here locally.
data/
*.env
.env
*.log
*.tmp
```

- [ ] **Step 2: Verify git ignores a sample secret-ish file**

Run:
```bash
cd /home/eric/source/proton-bridge && touch test.env && git check-ignore test.env && rm test.env
```
Expected: prints `test.env` (meaning it is ignored), then removes it.

- [ ] **Step 3: Commit**

```bash
cd /home/eric/source/proton-bridge
git add .gitignore
git commit -m "chore: add .gitignore for local state/secrets"
```

---

### Task 2: `docker-compose.yml`

**Files:**
- Create: `/home/eric/source/proton-bridge/docker-compose.yml`

- [ ] **Step 1: Create the compose file**

```yaml
services:
  protonmail-bridge:
    container_name: protonmail-bridge
    image: shenxn/protonmail-bridge:latest
    restart: unless-stopped
    ports:
      - "1143:143"   # IMAP (STARTTLS)
      - "1025:25"    # SMTP (STARTTLS)
    volumes:
      - /var/app-data/proton-bridge:/root
    environment:
      TZ: Australia/Melbourne
    labels:
      - "com.centurylinklabs.watchtower.enable=true"
    healthcheck:
      test: ["CMD", "bash", "-c", "echo > /dev/tcp/127.0.0.1/143"]
      interval: 1m
      timeout: 10s
      retries: 3
      start_period: 30s
```

- [ ] **Step 2: Validate the compose syntax (this is the "test")**

Run:
```bash
cd /home/eric/source/proton-bridge && docker compose config
```
Expected: prints the fully-resolved config with no error. Confirm `1143:143`, `1025:25`, the volume `/var/app-data/proton-bridge:/root`, and the healthcheck appear.

- [ ] **Step 3: Commit**

```bash
cd /home/eric/source/proton-bridge
git add docker-compose.yml
git commit -m "feat: add proton-bridge docker compose service"
```

---

### Task 3: `scripts/login.sh`

**Files:**
- Create: `/home/eric/source/proton-bridge/scripts/login.sh`

- [ ] **Step 1: Create the script**

```bash
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
```

- [ ] **Step 2: Make it executable**

Run:
```bash
chmod +x /home/eric/source/proton-bridge/scripts/login.sh
```

- [ ] **Step 3: Syntax-check the script (the "test")**

Run:
```bash
bash -n /home/eric/source/proton-bridge/scripts/login.sh && echo "SYNTAX OK"
```
Expected: prints `SYNTAX OK`. If `shellcheck` is installed, also run `shellcheck /home/eric/source/proton-bridge/scripts/login.sh` and expect no errors.

- [ ] **Step 4: Commit**

```bash
cd /home/eric/source/proton-bridge
git add scripts/login.sh
git commit -m "feat: add interactive bridge login helper"
```

---

### Task 4: `scripts/verify.sh`

**Files:**
- Create: `/home/eric/source/proton-bridge/scripts/verify.sh`

- [ ] **Step 1: Create the script**

```bash
#!/usr/bin/env bash
# Post-deploy checks for Proton Mail Bridge, run from any LAN machine.
# Usage: ./verify.sh [host] [imap_port] [smtp_port]
set -euo pipefail

HOST="${1:-192.168.3.250}"
IMAP_PORT="${2:-1143}"
SMTP_PORT="${3:-1025}"

echo "==> IMAP STARTTLS certificate on ${HOST}:${IMAP_PORT}"
if openssl s_client -starttls imap -connect "${HOST}:${IMAP_PORT}" </dev/null 2>/dev/null \
     | openssl x509 -noout -subject -issuer -dates; then
  echo "IMAP cert retrieved OK"
else
  echo "FAILED: could not retrieve IMAP cert from ${HOST}:${IMAP_PORT}"
  exit 1
fi

echo "==> SMTP port ${HOST}:${SMTP_PORT} reachable"
if command -v nc >/dev/null 2>&1; then
  if nc -z -w5 "${HOST}" "${SMTP_PORT}"; then echo "SMTP port open"; else echo "FAILED: SMTP port closed"; exit 1; fi
else
  if (echo > "/dev/tcp/${HOST}/${SMTP_PORT}") 2>/dev/null; then echo "SMTP port open"; else echo "FAILED: SMTP port closed"; exit 1; fi
fi

echo
echo "Port checks passed."
echo "To verify a real login (needs a bridge-generated credential from 'info'):"
echo "  openssl s_client -starttls imap -connect ${HOST}:${IMAP_PORT}"
echo "  then type:  a login <bridge-username> <bridge-password>"
echo "  expect:     a OK ... and the connection stays open"
```

- [ ] **Step 2: Make it executable**

Run:
```bash
chmod +x /home/eric/source/proton-bridge/scripts/verify.sh
```

- [ ] **Step 3: Syntax-check the script (the "test")**

Run:
```bash
bash -n /home/eric/source/proton-bridge/scripts/verify.sh && echo "SYNTAX OK"
```
Expected: prints `SYNTAX OK`. If `shellcheck` is installed, run it too and expect no errors.

- [ ] **Step 4: Commit**

```bash
cd /home/eric/source/proton-bridge
git add scripts/verify.sh
git commit -m "feat: add post-deploy verification script"
```

---

### Task 5: `README.md`

**Files:**
- Create: `/home/eric/source/proton-bridge/README.md`

- [ ] **Step 1: Create the README**

````markdown
# proton-bridge

Headless [Proton Mail Bridge](https://proton.me/mail/bridge) as an always-on Docker
service, exposing one or more Proton Mail accounts to the LAN over IMAP and SMTP.

Built on the community image
[`shenxn/protonmail-bridge`](https://github.com/shenxn/protonmail-bridge-docker),
which is packaged upstream from Proton's official `.deb` and republished on new
Proton releases — so [Watchtower](https://containrrr.dev/watchtower/) keeps it current.

## Endpoints

| Protocol | Address | Security |
|---|---|---|
| IMAP | `192.168.3.250:1143` | STARTTLS, self-signed cert |
| SMTP | `192.168.3.250:1025` | STARTTLS, self-signed cert |

Reachable from the LAN, the host, host-local containers, and over Tailscale
(`100.69.34.21`). Use the **Bridge-generated** username/password from `info`
(not your Proton password). Clients must trust the self-signed cert or disable
certificate validation.

## First-time setup

1. Log in to each Proton account (interactive, one-time):
   ```bash
   ./scripts/login.sh
   ```
   In the Bridge shell: run `login` once per account, then `info` (record the
   credentials), then `exit`.
2. Start the service headless:
   ```bash
   docker compose up -d
   ```
3. Verify from a LAN machine:
   ```bash
   ./scripts/verify.sh            # defaults to 192.168.3.250 1143 1025
   ```

## Adding / re-authenticating an account

Re-run `./scripts/login.sh`, `login` again, `exit`, then `docker compose up -d`.
Sessions can expire or be revoked by Proton; re-login is the fix.

## State & backups

All state (GPG/`pass` keychain, config, encrypted sessions) lives in
`/var/app-data/proton-bridge`. It is **never committed**. Back up that directory
out of band; restoring it avoids re-logging-in.

## Updates

`restart: unless-stopped` plus the Watchtower label
(`com.centurylinklabs.watchtower.enable=true`) mean the existing Watchtower stack
pulls new images and rolling-restarts automatically. Manual update if needed:
```bash
docker compose pull && docker compose up -d
```

## Deployment

Run `docker compose up -d` on the host, or import this repo as a Portainer
git-stack (the source of truth for the rest of the homelab is Portainer).

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| Client can't authenticate | Proton session expired/revoked | `./scripts/login.sh` → `login` again |
| Client refuses connection | Self-signed cert not trusted | Import the cert or disable cert validation in the client |
| Mail stops; logs show a version error | Proton forced a Bridge update | Watchtower auto-updates; else `docker compose pull && up -d` |
| Container won't start / keychain error | Bad perms on the state dir | Fix ownership/permissions on `/var/app-data/proton-bridge` |

Tail logs: `docker compose logs -f protonmail-bridge`
````

- [ ] **Step 2: Verify it renders / has no broken fences**

Run:
```bash
cd /home/eric/source/proton-bridge && grep -c '```' README.md
```
Expected: an even number (all code fences closed).

- [ ] **Step 3: Commit**

```bash
cd /home/eric/source/proton-bridge
git add README.md
git commit -m "docs: add operator README"
```

---

### Task 6: `CLAUDE.md`

**Files:**
- Create: `/home/eric/source/proton-bridge/CLAUDE.md`

- [ ] **Step 1: Create the file**

```markdown
# CLAUDE.md

Guidance for Claude Code working in this repository.

## Repository purpose

A standalone, private repo defining a single self-hosted Docker service:
**Proton Mail Bridge**, running headless to expose Proton Mail accounts to the LAN
over IMAP/SMTP. It complements the homelab `service-docker-compose` repo but is
kept separate. There is no application code — only `docker-compose.yml`, helper
shell scripts, and docs.

## Common commands

```bash
docker compose up -d                         # start / apply changes
docker compose pull && docker compose up -d  # update image
docker compose logs -f protonmail-bridge     # tail logs
./scripts/login.sh                           # interactive (re-)login, per account
./scripts/verify.sh                          # LAN-side IMAP/SMTP checks
```

## Architecture

- Image: `shenxn/protonmail-bridge:latest` (built upstream from Proton's official
  `.deb`; tracks Proton releases). No custom Dockerfile by design.
- Networking: default bridge network, host port publishing — IMAP `1143:143`,
  SMTP `1025:25`, bound to all host interfaces. Host LAN IP `192.168.3.250`.
- State: bind mount `/var/app-data/proton-bridge:/root` (homelab convention).
  Holds the GPG/`pass` keychain and encrypted sessions. Sensitive; never committed.
- Updates: `restart: unless-stopped` + Watchtower label; the existing Watchtower
  stack handles updates.
- TLS: Bridge serves STARTTLS with a self-signed cert; clients trust or ignore it.
  Per-account credentials are Bridge-generated (via `info`), not the Proton password.

## Conventions

- TZ is `Australia/Melbourne`, matching the other homelab stacks.
- Don't introduce a custom Dockerfile, reverse proxy, or secrets manager unless
  asked — those were explicitly out of scope (see the design spec).
- Initial account login is interactive (2FA) and cannot be fully automated.

## Design docs

- Spec: `docs/superpowers/specs/2026-06-02-proton-bridge-design.md`
- Plan: `docs/superpowers/plans/2026-06-02-proton-bridge.md`
```

- [ ] **Step 2: Commit**

```bash
cd /home/eric/source/proton-bridge
git add CLAUDE.md
git commit -m "docs: add CLAUDE.md repo guidance"
```

---

### Task 7: Bring the service up (automated verification, no credentials)

This proves the deployment wiring works even before any Proton account is logged in.
The container starts regardless of login state; the IMAP/SMTP ports listen once
Bridge is running.

**Files:** none (operational task)

- [ ] **Step 1: Red — confirm the port is closed before starting**

Run:
```bash
cd /home/eric/source/proton-bridge && ./scripts/verify.sh 127.0.0.1 1143 1025; echo "exit=$?"
```
Expected: FAILS (cannot retrieve IMAP cert / port closed), `exit=1`. This is the
intended red state — nothing is running yet.

- [ ] **Step 2: Pull the image**

Run:
```bash
cd /home/eric/source/proton-bridge && docker compose pull
```
Expected: pulls `shenxn/protonmail-bridge:latest` successfully.

- [ ] **Step 3: Start the container**

Run:
```bash
cd /home/eric/source/proton-bridge && docker compose up -d
```
Expected: container `protonmail-bridge` created and started.

- [ ] **Step 4: Wait for health, then check status**

Run:
```bash
sleep 40 && docker compose ps
```
Expected: `protonmail-bridge` shows state `running` and health `healthy` (the
`/dev/tcp/127.0.0.1/143` healthcheck passes once Bridge is listening).

- [ ] **Step 5: Green — confirm ports now reachable**

Run:
```bash
cd /home/eric/source/proton-bridge && ./scripts/verify.sh 127.0.0.1 1143 1025; echo "exit=$?"
```
Expected: PASSES — prints the self-signed cert subject/issuer/dates and "SMTP port
open", `exit=0`. (No account is logged in yet, so the cert handshake succeeds but
mail login is not yet possible — that's Task 8.)

- [ ] **Step 6: Inspect logs for errors**

Run:
```bash
docker compose logs --tail=50 protonmail-bridge
```
Expected: Bridge startup messages, no fatal/keychain errors.

> No commit — this task changes no files. If `docker compose ps` is not healthy,
> STOP and debug (use superpowers:systematic-debugging) before proceeding.

---

### Task 8: Log in accounts and verify mail end-to-end (manual — requires your Proton credentials)

This task **cannot be automated**: Proton login is interactive and 2FA-gated. The
operator runs it.

**Files:** none (operational task)

- [ ] **Step 1: Run the login helper**

Run:
```bash
cd /home/eric/source/proton-bridge && ./scripts/login.sh
```

- [ ] **Step 2: In the Bridge shell, log in each account**

Type `login`, then enter: Proton email, password, 2FA/TOTP code, and mailbox
password if you use two-password mode. Repeat `login` for each additional account.
Expected: each ends with a success message and the account appears in the list.

- [ ] **Step 3: Capture credentials**

Type `info`.
Expected: for each account, prints IMAP host/port, SMTP host/port, the
Bridge username, and the Bridge-generated password. Record these securely.
Then type `exit`.

- [ ] **Step 4: (Re)start headless**

Run:
```bash
cd /home/eric/source/proton-bridge && docker compose up -d
```
Expected: container running and healthy (`docker compose ps`).

- [ ] **Step 5: Verify a real IMAP login**

Run (substitute the bridge username/password from Step 3):
```bash
openssl s_client -starttls imap -connect 192.168.3.250:1143
```
Then in the session type:
```
a login <bridge-username> <bridge-password>
a list "" "*"
a logout
```
Expected: `a OK ...` after `login`, a mailbox list after `list`. This confirms a
client on the LAN can authenticate and read mail.

- [ ] **Step 6: Confirm persistence across restart**

Run:
```bash
cd /home/eric/source/proton-bridge && docker compose restart && sleep 40 && docker compose ps
```
Expected: healthy again with **no re-login required** (sessions persisted in
`/var/app-data/proton-bridge`).

> No commit — operational task.

---

### Task 9: Publish to GitHub as a private repo

**Files:** none (publishing task)

- [ ] **Step 1: Ensure `gh` is authenticated**

Run:
```bash
gh auth status
```
Expected: logged in. If not, the operator runs `gh auth login` interactively
(in Claude Code, type `! gh auth login`) and retries.

- [ ] **Step 2: Confirm clean tree and correct author**

Run:
```bash
cd /home/eric/source/proton-bridge && git status && git log --format='%an <%ae>' -1
```
Expected: working tree clean; author `Eric Brearley <eric.r.brearley@gmail.com>`.

- [ ] **Step 3: Create the private repo and push**

Run:
```bash
cd /home/eric/source/proton-bridge && gh repo create proton-bridge --private --source . --remote origin --push
```
Expected: repo created under your GitHub account and `main` pushed.

- [ ] **Step 4: Confirm the remote**

Run:
```bash
cd /home/eric/source/proton-bridge && gh repo view --json visibility,nameWithOwner -q '"\(.nameWithOwner) (\(.visibility))"'
```
Expected: prints `<you>/proton-bridge (PRIVATE)`.

---

## Self-review (completed by author)

**Spec coverage:**
- Multiple accounts → Task 8 (`login` repeated per account). ✓
- Host port publishing 1143/1025 → Task 2. ✓
- Persistent volume `/var/app-data/proton-bridge` → Task 2; persistence verified Task 8 Step 6. ✓
- Hands-off auto-update (Watchtower label) → Task 2; documented Task 5/6. ✓
- Healthcheck → Task 2; exercised Task 7. ✓
- One-time interactive login helper → Task 3; used Task 8. ✓
- Verification (cert + ports + real login) → Task 4; run in Tasks 7 & 8. ✓
- Self-signed cert handling, failure modes → README (Task 5) & CLAUDE.md (Task 6). ✓
- Standalone private repo + correct git identity → Task 9. ✓

**Placeholder scan:** No TBD/TODO; every file step contains full content; every command has expected output. ✓

**Consistency:** Container name `protonmail-bridge`, image `shenxn/protonmail-bridge:latest`, ports `1143:143`/`1025:25`, volume `/var/app-data/proton-bridge:/root`, host IP `192.168.3.250` — used identically across compose, scripts, README, CLAUDE.md, and tasks. ✓
