# Proton Bridge Custom Image + Companion UI Design

**Date:** 2026-06-02
**Status:** Approved direction, pending implementation plan
**Repo:** `proton-bridge` public GitHub repo

## Purpose

Build and publish a maintained public Docker packaging of Proton Mail Bridge for
headless use, plus a minimal companion Web UI for setup and operations. The repo
must be usable by Eric's homelab with minimal configuration while also being safe
to publish publicly.

This replaces the earlier plan based on `shenxn/protonmail-bridge`. That image is
not current enough for a service where Proton can reject old Bridge versions.

## Decisions

| Area | Decision |
|---|---|
| Repository visibility | Public GitHub repo |
| Image visibility | Public GHCR and Docker Hub images |
| Bridge image source | Proton's official Linux `.deb`, not a community image |
| Versioning | Pinned full Debian package version, for example `3.23.1-1` |
| Release tags | Tag images with the full Debian package version |
| Rebuild tags | Treat release tags as immutable once accepted; use `-r2`, `-r3` for corrected rebuilds |
| Architecture | `linux/amd64` only |
| Package verification | Verify Proton's `.deb` with `debsig-verify` before installing |
| Runtime user | Dedicated non-root user |
| Bridge state | Named Docker volume by default, optional bind mount documented |
| Companion UI | Separate Next.js app using shadcn/ui components |
| Default UI port | Host `3000` to container `3000` |
| Default mail ports | IMAP `1143:143`, SMTP `1025:25` |
| Configuration style | Minimal defaults; advanced overrides documented but not required |

## Public Safety

The repository and images can be public because they contain only build code,
deployment wiring, docs, and application binaries downloaded from Proton during
the build.

The following must never be committed or copied into image layers:

- Proton account emails, passwords, 2FA material, or recovery details.
- Bridge-generated IMAP/SMTP credentials.
- Bridge session state.
- Logs that include account identifiers, tokens, or credentials.
- Docker Hub access tokens or GitHub credentials.

Docker Hub publishing uses a GitHub Actions secret named `DOCKERHUB_TOKEN`. Eric
will create a new Docker Hub access token and add it to GitHub when the workflow
is ready. The token is never written to files or pasted into docs.

## Images

### Bridge Image

Docker Hub:

```text
ericbrearley/proton-bridge:<deb-version>
```

GHCR:

```text
ghcr.io/<github-owner>/proton-bridge:<deb-version>
```

The Bridge image is built from a pinned Proton Mail Bridge `.deb` URL:

```text
https://proton.me/download/bridge/protonmail-bridge_<deb-version>_amd64.deb
```

The build also downloads Proton's Bridge public key and `bridge.pol` policy file,
installs `debsig-verify`, imports the policy/key material into the build stage,
and fails if the package signature does not verify.

The runtime image installs only what Bridge needs to run headless:

- Proton Mail Bridge.
- `pass` and GPG tooling for Bridge credential/session storage.
- runtime libraries required by the `.deb`.
- a small entrypoint for first-run initialization and process startup.

The container runs as a non-root `bridge` user. Its home and writable state path is
`/data`; Compose mounts persistent storage there. The entrypoint sets `HOME=/data`,
validates that `/data` is writable, and initializes the GPG/pass keychain on first
run if it is missing. Account login remains interactive.

### Companion UI Image

Docker Hub:

```text
ericbrearley/proton-bridge-ui:<version>
```

GHCR:

```text
ghcr.io/<github-owner>/proton-bridge-ui:<version>
```

The UI is a separate Next.js app using shadcn/ui components. It is an operator
surface, not a credential store.

The UI should provide:

- Bridge status: running state, health, and current Bridge version.
- Account/session summary without exposing secrets.
- Guided first-run and add-account flow.
- Display of Bridge-provided IMAP/SMTP settings after login, with clear warnings
  that generated passwords must be stored securely by the operator.
- Safe logs with redaction where possible.
- Restart/reload actions once a narrow control interface is available.

The UI must not require mounting the Docker socket by default. Docker socket
access gives broad host control and is not appropriate for a minimal public
deployment. The implementation plan should prefer a narrow control interface
between the UI and Bridge container.

## Compose Stack

The repo ships a minimal `docker-compose.yml` that ties both services together.
Default usage should not require editing the file.

Expected default shape:

```yaml
services:
  proton-bridge:
    image: ericbrearley/proton-bridge:<deb-version>
    ports:
      - "1143:143"
      - "1025:25"
    volumes:
      - proton_bridge_data:/data

  proton-bridge-ui:
    image: ericbrearley/proton-bridge-ui:<ui-version>
    ports:
      - "3000:3000"
    depends_on:
      - proton-bridge

volumes:
  proton_bridge_data:
```

Advanced docs may show Eric's homelab bind mount convention:

```yaml
volumes:
  - /var/app-data/proton-bridge:/data
```

But the public default remains a named volume because it is easier for new users
and avoids host-specific paths.

## Release Workflow

The normal release path is GitHub Actions.

Inputs:

- Bridge Debian package version, for example `3.23.1-1`.
- Optional rebuild suffix, for example empty for first release or `r2` for a
  corrected rebuild.

Actions:

1. Build the Bridge image for `linux/amd64`.
2. Verify the Proton `.deb` signature during build.
3. Run a smoke test that starts Bridge headless enough to print or confirm the
   expected version.
4. Build the companion UI image.
5. Push public tags to GHCR and Docker Hub.

Tag policy:

- `dev` is mutable and only for local/manual testing.
- `<deb-version>` is a release tag and is treated as immutable once accepted.
- `<deb-version>-r2`, `<deb-version>-r3`, and so on are corrected rebuilds of the
  same Proton `.deb`.
- Do not publish `latest` unless explicitly added later.

Docker Hub:

- Username: `ericbrearley`.
- Secret: `DOCKERHUB_TOKEN`.
- Target repositories:
  - `ericbrearley/proton-bridge`
  - `ericbrearley/proton-bridge-ui`

GHCR:

- Use `GITHUB_TOKEN` for `ghcr.io`.
- Packages should be public.

## Data Flow

```text
Browser
  -> proton-bridge-ui:3000
      -> narrow Bridge control/status interface

Mail clients
  -> host:1143 IMAP STARTTLS
  -> host:1025 SMTP STARTTLS
      -> proton-bridge container
          -> Proton Mail API
```

Bridge account sessions and generated credentials live in the mounted `/data`
state. The UI can guide and display, but it must not persist secrets outside that
Bridge-managed state.

## Getting Started UX

The README should start with the shortest useful path:

1. Pick or accept the documented Bridge package version.
2. Start the stack:

   ```bash
   docker compose up -d
   ```

3. Open:

   ```text
   http://localhost:3000
   ```

4. Use the UI to initialize/login one or more Proton accounts.
5. Record the Bridge-generated IMAP/SMTP credentials securely.
6. Configure mail clients:

   - IMAP: host machine IP, port `1143`, STARTTLS.
   - SMTP: host machine IP, port `1025`, STARTTLS.

The README should keep advanced configuration below the first-run path:

- changing host ports,
- using a bind mount,
- publishing a new image version,
- adding Docker Hub/GHCR secrets,
- troubleshooting package verification or Bridge login.

## Error Handling

- Package verification failure: fail the build and do not publish images.
- Missing Docker Hub secret: GHCR build may proceed, Docker Hub push fails with a
  clear CI error.
- `/data` not writable: entrypoint exits with a clear message.
- Missing keychain: entrypoint initializes it automatically.
- Proton login/session failure: UI and docs direct the operator to re-run the
  interactive login/add-account flow.
- Client TLS warnings: docs explain that Bridge serves STARTTLS with a self-signed
  certificate and clients must trust or accept it.

## Testing

Bridge image:

- Dockerfile build succeeds for `linux/amd64`.
- `.deb` verification step fails closed if verification fails.
- Container starts as non-root.
- `/data` state survives restart.
- Bridge reports the expected version.
- IMAP/SMTP ports listen after startup.

Companion UI:

- Next.js build succeeds.
- Core dashboard renders.
- Status endpoint handles Bridge available/unavailable states.
- Secret values are not logged or rendered accidentally.

Compose:

- `docker compose config` succeeds.
- `docker compose up -d` starts both services.
- `http://localhost:3000` serves the UI.
- IMAP `1143` and SMTP `1025` are reachable on the host.

## Out Of Scope For Initial Implementation

- Multi-architecture images.
- Automatic discovery of latest Proton Bridge versions.
- Docker socket mounting as the default control path.
- External TLS/reverse proxy setup.
- Secrets manager integration.
- Kubernetes or multi-host orchestration.
- Publishing `latest` tags.

## Sources

- Proton package verification docs:
  `https://proton.me/support/verifying-bridge-package`
- Proton Bridge stable release notes:
  `https://protonmail.com/download/bridge/stable_releases.html`
- Docker Build/GitHub Actions docs fetched via Context7:
  `/docker/docs`
- shadcn/ui Next.js docs fetched via Context7:
  `/shadcn-ui/ui`
