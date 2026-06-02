# Proton Bridge Custom Image Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the stale community-image deployment with a public, self-built Proton Bridge image, a companion Next.js/shadcn Web UI, and a minimal Compose stack.

**Architecture:** Build a non-root Bridge container from Proton's pinned official `.deb`, verify the package with Proton's `debsig-verify` flow, and run a small internal control server that supervises Bridge and exposes only narrow status/terminal endpoints to the UI. Build a separate Next.js standalone UI container that talks to the Bridge control API over the private Compose network. Publish versioned public tags to GHCR and Docker Hub from GitHub Actions after local validation.

**Tech Stack:** Docker, Docker Buildx, Debian/Ubuntu package tooling, Proton Mail Bridge `.deb`, Python control server, Next.js, TypeScript, Tailwind CSS, shadcn/ui, GitHub Actions, GHCR, Docker Hub.

**Reference spec:** `docs/superpowers/specs/2026-06-02-proton-bridge-custom-image-design.md`

---

## File Structure

| File | Responsibility |
|---|---|
| `VERSION` | Single source of truth for the pinned Proton Bridge Debian package version, e.g. `3.23.1-1`. |
| `bridge/Dockerfile` | Builds the non-root Bridge image from Proton's verified `.deb`. |
| `bridge/entrypoint.sh` | Validates `/data`, sets `HOME`, and starts the Bridge control server. |
| `bridge/control_server.py` | Supervises the Bridge process and exposes status/version/terminal endpoints to the UI. |
| `bridge/requirements.txt` | Python dependencies for the control server. |
| `bridge/scripts/build-dev.sh` | Local `dev` image build helper. |
| `bridge/scripts/smoke-test.sh` | Local smoke test for image startup/version/ports. |
| `bridge-ui/*` | Next.js/shadcn companion UI application. |
| `bridge-ui/Dockerfile` | Builds the UI as a Next.js standalone runtime image. |
| `docker-compose.yml` | Minimal public stack tying Bridge and UI together. |
| `.github/workflows/images.yml` | Manual release workflow that pushes GHCR and Docker Hub tags. |
| `README.md` | Getting started, ports, login flow, releases, and GitHub/Docker Hub setup. |
| `CLAUDE.md` | Repo guidance for future agent sessions. |
| `.gitignore` | Ignore local state, env files, build output, and UI dependencies. |

## Important Constraints

- Do not push the GitHub repo yet. Eric explicitly wants to hold publishing until the project is built.
- Do not commit or echo Docker Hub tokens, Proton credentials, Bridge-generated credentials, or Bridge state.
- Do not publish `latest`.
- Use `dev` only for mutable local testing.
- Treat `<deb-version>` release tags as immutable once accepted; corrected rebuilds use `<deb-version>-r2`, `<deb-version>-r3`.
- Default Web UI port is `3000`.
- Default state storage is a named Docker volume.

---

### Task 1: Remove Old Community-Image Implementation

**Files:**
- Modify: `.gitignore`
- Delete: `scripts/login.sh`
- Replace later: `docker-compose.yml`

- [ ] **Step 1: Delete the old login helper**

Run:
```bash
rm scripts/login.sh
```

Expected: `scripts/login.sh` removed.

- [ ] **Step 2: Update `.gitignore`**

Replace `.gitignore` with:
```gitignore
# Proton Bridge state must not be committed.
data/
*.env
.env
*.log
*.tmp

# Local build and UI output.
node_modules/
.next/
out/
dist/
coverage/

# Python caches.
__pycache__/
*.py[cod]

# Docker/local override files.
docker-compose.override.yml
```

- [ ] **Step 3: Verify clean removal scope**

Run:
```bash
git status --short
```

Expected: shows deleted `scripts/login.sh` and modified `.gitignore`; no Bridge state or secret files.

- [ ] **Step 4: Commit**

Run:
```bash
git add .gitignore scripts/login.sh
git commit -m "chore: remove stale community image helper"
```

---

### Task 2: Add Version and Bridge Build Skeleton

**Files:**
- Create: `VERSION`
- Create: `bridge/requirements.txt`
- Create: `bridge/entrypoint.sh`
- Create: `bridge/control_server.py`

- [ ] **Step 1: Add `VERSION`**

Create `VERSION`:
```text
3.23.1-1
```

- [ ] **Step 2: Add `bridge/requirements.txt`**

Create `bridge/requirements.txt`:
```text
fastapi==0.115.6
uvicorn[standard]==0.32.1
```

- [ ] **Step 3: Add `bridge/entrypoint.sh`**

Create `bridge/entrypoint.sh`:
```bash
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
```

- [ ] **Step 4: Add first-pass `bridge/control_server.py`**

Create `bridge/control_server.py` with a minimal status/version server first:
```python
from __future__ import annotations

import asyncio
import os
import signal
import subprocess
from contextlib import asynccontextmanager
from typing import AsyncIterator

from fastapi import FastAPI
from pydantic import BaseModel


BRIDGE_BIN = os.environ.get("BRIDGE_BIN", "protonmail-bridge")
BRIDGE_ARGS = os.environ.get("BRIDGE_ARGS", "--no-window").split()
CONTROL_HOST = os.environ.get("BRIDGE_CONTROL_HOST", "0.0.0.0")
CONTROL_PORT = int(os.environ.get("BRIDGE_CONTROL_PORT", "8081"))

bridge_process: subprocess.Popen[bytes] | None = None


class Status(BaseModel):
    running: bool
    pid: int | None
    version: str


def bridge_version() -> str:
    try:
        result = subprocess.run(
            [BRIDGE_BIN, "--version"],
            check=False,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            timeout=10,
        )
    except Exception as exc:
        return f"unknown: {exc}"
    return result.stdout.strip() or "unknown"


def start_bridge() -> None:
    global bridge_process
    if bridge_process and bridge_process.poll() is None:
        return
    bridge_process = subprocess.Popen([BRIDGE_BIN, *BRIDGE_ARGS])


def stop_bridge() -> None:
    global bridge_process
    if not bridge_process or bridge_process.poll() is not None:
        return
    bridge_process.send_signal(signal.SIGTERM)
    try:
        bridge_process.wait(timeout=20)
    except subprocess.TimeoutExpired:
        bridge_process.kill()
        bridge_process.wait(timeout=10)


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    start_bridge()
    try:
        yield
    finally:
        stop_bridge()


app = FastAPI(lifespan=lifespan)


@app.get("/api/status", response_model=Status)
async def status() -> Status:
    running = bridge_process is not None and bridge_process.poll() is None
    return Status(
        running=running,
        pid=bridge_process.pid if running and bridge_process else None,
        version=bridge_version(),
    )


@app.post("/api/restart", response_model=Status)
async def restart() -> Status:
    stop_bridge()
    await asyncio.sleep(1)
    start_bridge()
    return await status()


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host=CONTROL_HOST, port=CONTROL_PORT)
```

- [ ] **Step 5: Make entrypoint executable and syntax-check**

Run:
```bash
chmod +x bridge/entrypoint.sh
bash -n bridge/entrypoint.sh
python3 -m py_compile bridge/control_server.py
```

Expected: no output, exit code `0`.

- [ ] **Step 6: Commit**

Run:
```bash
git add VERSION bridge/requirements.txt bridge/entrypoint.sh bridge/control_server.py
git commit -m "feat: add bridge image runtime skeleton"
```

---

### Task 3: Build Verified Proton Bridge Image

**Files:**
- Create: `bridge/Dockerfile`
- Create: `bridge/scripts/build-dev.sh`

- [ ] **Step 1: Create Bridge scripts directory**

Run:
```bash
mkdir -p bridge/scripts
```

- [ ] **Step 2: Create `bridge/Dockerfile`**

Create `bridge/Dockerfile`:
```dockerfile
# syntax=docker/dockerfile:1.7
ARG DEBIAN_VERSION=bookworm-slim
ARG BRIDGE_DEB_VERSION=3.23.1-1

FROM debian:${DEBIAN_VERSION} AS verifier
ARG BRIDGE_DEB_VERSION
ARG BRIDGE_DEB_URL=https://proton.me/download/bridge/protonmail-bridge_${BRIDGE_DEB_VERSION}_amd64.deb
ARG PROTON_BRIDGE_KEY_ID=E2C75D68E6234B07

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates curl debian-keyring debsig-verify gnupg \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /tmp/proton-bridge

# Proton package verification source:
# https://proton.me/support/verifying-bridge-package
RUN set -eux; \
  curl -fsSL "$BRIDGE_DEB_URL" -o protonmail-bridge.deb; \
  mkdir -p "/etc/debsig/policies/${PROTON_BRIDGE_KEY_ID}" "/usr/share/debsig/keyrings/${PROTON_BRIDGE_KEY_ID}"; \
  curl -fsSL https://proton.me/download/bridge/bridge.pol \
    -o "/etc/debsig/policies/${PROTON_BRIDGE_KEY_ID}/bridge.pol"; \
  curl -fsSL https://proton.me/download/bridge/bridge_pubkey.gpg \
    -o bridge_pubkey.gpg; \
  gpg --dearmor --output "/usr/share/debsig/keyrings/${PROTON_BRIDGE_KEY_ID}/debsig.gpg" bridge_pubkey.gpg; \
  debsig-verify protonmail-bridge.deb

FROM debian:${DEBIAN_VERSION} AS runtime
ARG BRIDGE_DEB_VERSION

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates curl gnupg pass python3 python3-pip tini \
  && rm -rf /var/lib/apt/lists/*

COPY --from=verifier /tmp/proton-bridge/protonmail-bridge.deb /tmp/protonmail-bridge.deb
RUN apt-get update \
  && apt-get install -y --no-install-recommends /tmp/protonmail-bridge.deb \
  && rm -f /tmp/protonmail-bridge.deb \
  && rm -rf /var/lib/apt/lists/*

RUN useradd --create-home --home-dir /data --shell /usr/sbin/nologin --uid 10001 bridge

WORKDIR /opt/proton-bridge
COPY bridge/requirements.txt /opt/proton-bridge/requirements.txt
RUN pip3 install --break-system-packages --no-cache-dir -r /opt/proton-bridge/requirements.txt
COPY bridge/control_server.py /opt/proton-bridge/control_server.py
COPY bridge/entrypoint.sh /opt/proton-bridge/entrypoint.sh

RUN chmod +x /opt/proton-bridge/entrypoint.sh \
  && mkdir -p /data \
  && chown -R bridge:bridge /data /opt/proton-bridge

ENV BRIDGE_DEB_VERSION=${BRIDGE_DEB_VERSION}
ENV BRIDGE_HOME=/data
ENV BRIDGE_CONTROL_HOST=0.0.0.0
ENV BRIDGE_CONTROL_PORT=8081

USER bridge
VOLUME ["/data"]
EXPOSE 143 25 8081
ENTRYPOINT ["/usr/bin/tini", "--", "/opt/proton-bridge/entrypoint.sh"]
```

- [ ] **Step 3: Create `bridge/scripts/build-dev.sh`**

Create `bridge/scripts/build-dev.sh`:
```bash
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
```

- [ ] **Step 4: Make script executable and validate Dockerfile parses**

Run:
```bash
chmod +x bridge/scripts/build-dev.sh
docker buildx build --help >/dev/null
```

Expected: no error.

- [ ] **Step 5: Build the dev image**

Run:
```bash
./bridge/scripts/build-dev.sh
```

Expected: build succeeds and loads `ericbrearley/proton-bridge:dev`.

- [ ] **Step 6: Commit**

Run:
```bash
git add bridge/Dockerfile bridge/scripts/build-dev.sh
git commit -m "feat: build verified proton bridge image"
```

---

### Task 4: Add Bridge Smoke Tests

**Files:**
- Create: `bridge/scripts/smoke-test.sh`

- [ ] **Step 1: Create smoke test script**

Create `bridge/scripts/smoke-test.sh`:
```bash
#!/usr/bin/env bash
set -euo pipefail

IMAGE="${1:-ericbrearley/proton-bridge:dev}"
EXPECTED_VERSION="$(tr -d '[:space:]' < VERSION)"
CONTAINER="proton-bridge-smoke"

cleanup() {
  docker rm -f "$CONTAINER" >/dev/null 2>&1 || true
}
trap cleanup EXIT

cleanup
docker run -d --name "$CONTAINER" -p 18081:8081 "$IMAGE" >/dev/null

for _ in $(seq 1 30); do
  if curl -fsS http://127.0.0.1:18081/api/status >/tmp/proton-bridge-status.json; then
    break
  fi
  sleep 1
done

cat /tmp/proton-bridge-status.json
grep -q "$EXPECTED_VERSION" /tmp/proton-bridge-status.json
echo "Smoke test passed for $IMAGE"
```

- [ ] **Step 2: Run smoke test**

Run:
```bash
chmod +x bridge/scripts/smoke-test.sh
./bridge/scripts/smoke-test.sh
```

Expected: prints JSON containing the expected version and `Smoke test passed`.

- [ ] **Step 3: Commit**

Run:
```bash
git add bridge/scripts/smoke-test.sh
git commit -m "test: add bridge image smoke test"
```

---

### Task 5: Scaffold Companion UI

**Files:**
- Create directory: `bridge-ui/`

- [ ] **Step 1: Scaffold Next.js app**

Run:
```bash
npx create-next-app@latest bridge-ui --typescript --tailwind --eslint --app --src-dir --import-alias "@/*"
```

Expected: creates `bridge-ui` Next.js app.

- [ ] **Step 2: Initialize shadcn/ui**

Run:
```bash
cd bridge-ui && npx shadcn@latest init
```

Choose defaults compatible with Tailwind and the `src` directory.

- [ ] **Step 3: Add required shadcn components**

Run:
```bash
cd bridge-ui && npx shadcn@latest add button card badge alert tabs table input scroll-area
```

Expected: components added under `bridge-ui/src/components/ui`.

- [ ] **Step 4: Enable standalone output**

Modify `bridge-ui/next.config.ts`:
```ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
};

export default nextConfig;
```

- [ ] **Step 5: Build baseline UI**

Run:
```bash
cd bridge-ui && npm run build
```

Expected: Next.js build succeeds.

- [ ] **Step 6: Commit**

Run:
```bash
git add bridge-ui
git commit -m "feat: scaffold bridge companion ui"
```

---

### Task 6: Implement UI Status Dashboard

**Files:**
- Create: `bridge-ui/src/lib/bridge.ts`
- Replace: `bridge-ui/src/app/page.tsx`
- Modify as needed: `bridge-ui/src/app/globals.css`

- [ ] **Step 1: Add Bridge API client**

Create `bridge-ui/src/lib/bridge.ts`:
```ts
export type BridgeStatus = {
  running: boolean;
  pid: number | null;
  version: string;
};

const bridgeBaseUrl = process.env.BRIDGE_CONTROL_URL ?? "http://proton-bridge:8081";

export async function getBridgeStatus(): Promise<BridgeStatus> {
  const response = await fetch(`${bridgeBaseUrl}/api/status`, {
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Bridge status failed: ${response.status}`);
  }

  return response.json() as Promise<BridgeStatus>;
}
```

- [ ] **Step 2: Replace dashboard page**

Replace `bridge-ui/src/app/page.tsx` with a server-rendered dashboard that calls
`getBridgeStatus()`, shows running/stopped, version, PID, connection settings, and
a first-run panel instructing the user to use the browser terminal once Task 7 is
implemented.

- [ ] **Step 3: Build UI**

Run:
```bash
cd bridge-ui && npm run build
```

Expected: build succeeds.

- [ ] **Step 4: Commit**

Run:
```bash
git add bridge-ui/src/lib/bridge.ts bridge-ui/src/app/page.tsx bridge-ui/src/app/globals.css
git commit -m "feat: add bridge status dashboard"
```

---

### Task 7: Add Browser Terminal for Interactive Login

**Files:**
- Modify: `bridge/control_server.py`
- Create: `bridge-ui/src/app/terminal/page.tsx`
- Create: `bridge-ui/src/components/terminal.tsx`

- [ ] **Step 1: Add PTY terminal endpoint to control server**

Extend `bridge/control_server.py` with a WebSocket endpoint at `/api/terminal`.
The endpoint must:
- stop the supervised Bridge process before opening the CLI,
- spawn the official Linux Bridge CLI command `protonmail-bridge -c` in a PTY,
- proxy browser input/output over WebSocket,
- restart the supervised Bridge process when the terminal exits,
- never log terminal input or output.

- [ ] **Step 2: Add terminal client component**

Create `bridge-ui/src/components/terminal.tsx` as a client component that opens a
WebSocket to `/api/terminal`, renders output in a fixed-height scroll area, and
sends typed commands only when the user presses Enter.

- [ ] **Step 3: Add terminal page**

Create `bridge-ui/src/app/terminal/page.tsx` with instructions for:
```text
login
info
exit
```

Warn users to store generated Bridge passwords securely and not paste Proton
credentials anywhere except the live terminal session.

- [ ] **Step 4: Test terminal flow locally**

Run:
```bash
./bridge/scripts/build-dev.sh
docker compose up -d --build
```

Open `http://localhost:3000/terminal`.

Expected: terminal opens Bridge CLI. Do not enter real credentials during this test
unless Eric is present and intentionally performing account setup.

- [ ] **Step 5: Commit**

Run:
```bash
git add bridge/control_server.py bridge-ui/src/app/terminal/page.tsx bridge-ui/src/components/terminal.tsx
git commit -m "feat: add bridge login terminal"
```

---

### Task 8: Add UI Dockerfile and Compose Stack

**Files:**
- Create: `bridge-ui/Dockerfile`
- Replace: `docker-compose.yml`

- [ ] **Step 1: Create `bridge-ui/Dockerfile`**

Create `bridge-ui/Dockerfile` using the official Next.js standalone multi-stage
pattern:
```dockerfile
# syntax=docker/dockerfile:1.7
ARG NODE_VERSION=24.13.0-slim

FROM node:${NODE_VERSION} AS deps
WORKDIR /app
COPY bridge-ui/package.json bridge-ui/package-lock.json* ./
RUN --mount=type=cache,target=/root/.npm npm ci --no-audit --no-fund

FROM node:${NODE_VERSION} AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY bridge-ui/ ./
ENV NODE_ENV=production
RUN npm run build

FROM node:${NODE_VERSION} AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
ENV BRIDGE_CONTROL_URL=http://proton-bridge:8081
COPY --from=builder --chown=node:node /app/public ./public
RUN mkdir .next && chown node:node .next
COPY --from=builder --chown=node:node /app/.next/standalone ./
COPY --from=builder --chown=node:node /app/.next/static ./.next/static
USER node
EXPOSE 3000
CMD ["node", "server.js"]
```

- [ ] **Step 2: Replace `docker-compose.yml`**

Replace `docker-compose.yml`:
```yaml
services:
  proton-bridge:
    container_name: proton-bridge
    image: ericbrearley/proton-bridge:dev
    restart: unless-stopped
    ports:
      - "1143:143"
      - "1025:25"
    volumes:
      - proton_bridge_data:/data
    healthcheck:
      test: ["CMD", "curl", "-fsS", "http://127.0.0.1:8081/api/status"]
      interval: 1m
      timeout: 10s
      retries: 3
      start_period: 30s

  proton-bridge-ui:
    container_name: proton-bridge-ui
    image: ericbrearley/proton-bridge-ui:dev
    build:
      context: .
      dockerfile: bridge-ui/Dockerfile
    restart: unless-stopped
    ports:
      - "3000:3000"
    environment:
      BRIDGE_CONTROL_URL: http://proton-bridge:8081
    depends_on:
      proton-bridge:
        condition: service_healthy

volumes:
  proton_bridge_data:
```

- [ ] **Step 3: Validate Compose**

Run:
```bash
docker compose config
```

Expected: no errors; output includes ports `3000:3000`, `1143:143`, `1025:25`.

- [ ] **Step 4: Build and start stack**

Run:
```bash
./bridge/scripts/build-dev.sh
docker compose build proton-bridge-ui
docker compose up -d
docker compose ps
```

Expected: both containers running; Bridge healthcheck healthy after startup.

- [ ] **Step 5: Verify UI responds**

Run:
```bash
curl -fsS http://127.0.0.1:3000 >/tmp/proton-bridge-ui.html
```

Expected: command exits `0`.

- [ ] **Step 6: Commit**

Run:
```bash
git add bridge-ui/Dockerfile docker-compose.yml
git commit -m "feat: add minimal compose stack"
```

---

### Task 9: Add GitHub Actions Image Workflow

**Files:**
- Create: `.github/workflows/images.yml`

- [ ] **Step 1: Create workflow**

Create `.github/workflows/images.yml`:
```yaml
name: Images

on:
  workflow_dispatch:
    inputs:
      bridge_version:
        description: Full Proton Bridge Debian package version, for example 3.23.1-1
        required: true
        type: string
      rebuild_suffix:
        description: Optional rebuild suffix, for example r2
        required: false
        type: string

permissions:
  contents: read
  packages: write

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: docker/setup-buildx-action@v3

      - uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}

      - uses: docker/login-action@v3
        with:
          username: ericbrearley
          password: ${{ secrets.DOCKERHUB_TOKEN }}

      - name: Compute tags
        id: tags
        shell: bash
        run: |
          set -euo pipefail
          version="${{ inputs.bridge_version }}"
          suffix="${{ inputs.rebuild_suffix }}"
          if [ -n "$suffix" ]; then
            tag="${version}-${suffix}"
          else
            tag="$version"
          fi
          echo "tag=$tag" >> "$GITHUB_OUTPUT"

      - name: Build and push Bridge image
        uses: docker/build-push-action@v6
        with:
          context: .
          file: bridge/Dockerfile
          platforms: linux/amd64
          push: true
          build-args: |
            BRIDGE_DEB_VERSION=${{ inputs.bridge_version }}
          tags: |
            ghcr.io/${{ github.repository_owner }}/proton-bridge:${{ steps.tags.outputs.tag }}
            ericbrearley/proton-bridge:${{ steps.tags.outputs.tag }}

      - name: Build and push UI image
        uses: docker/build-push-action@v6
        with:
          context: .
          file: bridge-ui/Dockerfile
          platforms: linux/amd64
          push: true
          tags: |
            ghcr.io/${{ github.repository_owner }}/proton-bridge-ui:${{ steps.tags.outputs.tag }}
            ericbrearley/proton-bridge-ui:${{ steps.tags.outputs.tag }}
```

- [ ] **Step 2: Validate workflow syntax enough for YAML**

Run:
```bash
python3 - <<'PY'
from pathlib import Path
import yaml
yaml.safe_load(Path(".github/workflows/images.yml").read_text())
print("YAML OK")
PY
```

Expected: `YAML OK`. If PyYAML is unavailable, run `ruby -e 'require "yaml"; YAML.load_file(".github/workflows/images.yml"); puts "YAML OK"'`.

- [ ] **Step 3: Commit**

Run:
```bash
git add .github/workflows/images.yml
git commit -m "ci: add image publishing workflow"
```

---

### Task 10: Rewrite README and Agent Guidance

**Files:**
- Create/replace: `README.md`
- Create/replace: `CLAUDE.md`
- Modify: `HANDOVER.md`

- [ ] **Step 1: Write README**

README must include:
- project purpose,
- public image names,
- no `latest` policy,
- minimal getting started with `docker compose up -d`,
- UI at `http://localhost:3000`,
- IMAP `1143` and SMTP `1025`,
- how to run browser terminal login,
- how to safely store Bridge-generated credentials,
- optional bind mount example,
- how to add `DOCKERHUB_TOKEN` later:

```bash
gh secret set DOCKERHUB_TOKEN
```

- [ ] **Step 2: Write CLAUDE.md**

CLAUDE.md must tell future agents:
- use Context7 for current Docker/Next/shadcn docs,
- do not use `shenxn/protonmail-bridge`,
- do not publish `latest`,
- never handle or commit tokens/credentials,
- repo should not be pushed until Eric asks again.

- [ ] **Step 3: Update HANDOVER.md**

Update the handover to say the old community-image plan has been superseded by:
`docs/superpowers/specs/2026-06-02-proton-bridge-custom-image-design.md`
and this implementation plan.

- [ ] **Step 4: Verify markdown fences**

Run:
```bash
python3 - <<'PY'
from pathlib import Path
for name in ("README.md", "CLAUDE.md", "HANDOVER.md"):
    count = sum(1 for line in Path(name).read_text().splitlines() if line.startswith("```"))
    print(f"{name}: {count}")
    if count % 2:
        raise SystemExit(f"{name} has unbalanced Markdown fences")
PY
```

Expected: each count is even.

- [ ] **Step 5: Commit**

Run:
```bash
git add README.md CLAUDE.md HANDOVER.md
git commit -m "docs: add getting started guide"
```

---

### Task 11: Final Local Verification

**Files:** none

- [ ] **Step 1: Verify clean build from scratch**

Run:
```bash
docker compose down
./bridge/scripts/build-dev.sh
docker compose build proton-bridge-ui
docker compose up -d
```

Expected: commands exit `0`.

- [ ] **Step 2: Verify services**

Run:
```bash
docker compose ps
curl -fsS http://127.0.0.1:3000 >/tmp/proton-bridge-ui.html
docker compose exec -T proton-bridge curl -fsS http://127.0.0.1:8081/api/status
```

Expected:
- `docker compose ps` shows `proton-bridge` and `proton-bridge-ui` running.
- UI curl exits `0`.
- Status is reachable from inside Compose; host reachability depends on whether the control port is published. It should not be published in the final Compose file.

- [ ] **Step 3: Confirm no secrets**

Run:
```bash
rg -n "dckr_pat|DOCKERHUB_TOKEN=|BEGIN PRIVATE KEY|Proton password|bridge password" .
```

Expected: no secret values; references to secret names in docs/workflow are fine.

- [ ] **Step 4: Confirm git state**

Run:
```bash
git status --short --branch
```

Expected: clean tree on `main`.

> Do not publish the GitHub repo in this task. Eric asked to hold off until the project is built.

---

## Self-Review

**Spec coverage:**
- Public repo/public images: workflow and README tasks. Covered.
- Own image from official `.deb`: Task 3. Covered.
- Pinned full Debian package version: Task 2 `VERSION`, Task 9 workflow input. Covered.
- GHCR + Docker Hub: Task 9. Covered.
- Signature verification: Task 3. Covered, with Proton verification doc as source.
- Non-root runtime and `/data`: Tasks 2-3 and Compose Task 8. Covered.
- Companion Next.js/shadcn UI: Tasks 5-7. Covered.
- Minimal Compose and getting started: Tasks 8 and 10. Covered.
- UI port `3000`: Task 8. Covered.
- No Docker socket by default: Task 7 uses Bridge control API; Task 8 does not mount Docker socket. Covered.
- Hold publishing until built: constraints and Task 11. Covered.

**External-doc values captured:**
- Proton's DEB verification docs use public key URL `https://proton.me/download/bridge/bridge_pubkey.gpg`, policy URL `https://proton.me/download/bridge/bridge.pol`, and key/policy directory `E2C75D68E6234B07`.
- Proton's CLI guide says the Linux command to launch the Bridge CLI is `protonmail-bridge -c`.

**Placeholder scan:** No placeholder markers or intentionally incomplete implementation steps.
