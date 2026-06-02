# Handover — proton-bridge

**Date:** 2026-06-02
**From:** Claude Code (brainstorming + planning complete)
**To:** Codex (implementation)
**Repo:** `/home/eric/source/proton-bridge` (git initialized, local-only — not yet on GitHub)

---

## TL;DR for the next agent

Design and implementation plan are **done and committed**. Nothing has been built
yet — no `docker-compose.yml`, scripts, README, or CLAUDE.md exist. Your job is to
**execute the plan** at `docs/superpowers/plans/2026-06-02-proton-bridge.md`,
task by task (Tasks 1–9), committing after each as the plan specifies.

Start with **Task 1** and go in order. Tasks 8 and the `gh auth login` part of
Task 9 require the human operator (interactive Proton 2FA / GitHub auth) — pause
and hand back to Eric there.

---

## What this project is

Run **Proton Mail Bridge** headless in Docker on Eric's homelab host, exposing
multiple Proton Mail accounts to the LAN over IMAP/SMTP, with hands-off auto-updates.

## Decisions already made (do not relitigate)

| Decision | Choice | Why |
|---|---|---|
| Build approach | **A** — community image `shenxn/protonmail-bridge:latest` | Built upstream from Proton's official `.deb`; Watchtower keeps it current. No custom Dockerfile. |
| Accounts | **Multiple** Proton accounts on one instance | `login` is run once per account. |
| Networking | **Host port publishing** (macvlan was considered and rejected) | IMAP `1143:143`, SMTP `1025:25`, bound to `0.0.0.0`. |
| Updates | **Hands-off** via existing Watchtower stack | Add label `com.centurylinklabs.watchtower.enable=true`. |
| Repo | **Standalone private** GitHub repo | Created in Task 9 via `gh repo create proton-bridge --private`. |

Explicitly **out of scope** (YAGNI — do not add): custom Dockerfile, reverse
proxy / external TLS, secrets manager, macvlan, multi-host orchestration.

## Host / environment facts

- Host LAN IP: **`192.168.3.250`** (also Tailscale `100.69.34.21`).
- State dir convention: **`/var/app-data/<service>`** → here `/var/app-data/proton-bridge` bind-mounted to container `/root`. **Sensitive — never commit.**
- TZ: **`Australia/Melbourne`**.
- Docker 29.x + Compose v2.40 present. Existing Watchtower stack auto-updates labeled containers.
- Bridge serves **STARTTLS with a self-signed cert**; clients trust/ignore it. Per-account creds are **Bridge-generated** (from the `info` command), not the Proton password.

## Current repo state

Committed so far (branch `main`):
- `b21b232 docs: add proton-bridge implementation plan`
- `0faa9b1 docs: add proton-bridge headless service design spec`

Files present: only `docs/superpowers/specs/2026-06-02-proton-bridge-design.md`,
`docs/superpowers/plans/2026-06-02-proton-bridge.md`, and this `HANDOVER.md`.

Git identity for this repo is set local-only:
**`Eric Brearley <eric.r.brearley@gmail.com>`** — keep using it.

## Key documents (read these first)

1. **Spec:** `docs/superpowers/specs/2026-06-02-proton-bridge-design.md` — the what/why.
2. **Plan:** `docs/superpowers/plans/2026-06-02-proton-bridge.md` — the step-by-step how, with full file contents and exact commands/expected output. **This is your work queue.**

## Files to create (per the plan)

- `docker-compose.yml` — Task 2 (full contents in plan)
- `scripts/login.sh` — Task 3 (full contents in plan)
- `scripts/verify.sh` — Task 4 (full contents in plan)
- `.gitignore` — Task 1
- `README.md` — Task 5
- `CLAUDE.md` — Task 6

## Execution notes

- Commit after each file task with the message given in the plan.
- **Task 7** brings the container up and does an automated red→green port check —
  runnable without any Proton account (the cert handshake works before login).
- **Task 8** is the interactive Proton login (2FA). **Human-only — pause here.**
- **Task 9** publishes to GitHub. `gh` is currently **not authenticated**
  (`gh auth status` failed for account `ebrearley`). Eric must run `gh auth login`
  before the push.

## Open question already answered (for context)

> How often is the 2FA flow needed? — **Once per account at setup, then only on
> specific events** (password change, session revoke, forced re-auth, or loss of
> `/var/app-data/proton-bridge`). No periodic re-login; sessions persist across
> restarts/reboots/updates. Backing up the state dir avoids ever redoing 2FA on a
> rebuild.

## Recommended execution method

The plan was written for task-by-task execution with commits per task. Codex can
just walk Tasks 1→9 in order. Verify each task's "Expected" output before moving on;
if a verification fails (e.g. container not healthy in Task 7), stop and debug
rather than proceeding.
