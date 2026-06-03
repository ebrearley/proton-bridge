# Handover — proton-bridge

**Date:** 2026-06-03
**Repo:** `/home/eric/source/proton-bridge`

The original community-image plan using `shenxn/protonmail-bridge:latest` has
been superseded.

Use these documents instead:

- Spec: `docs/superpowers/specs/2026-06-02-proton-bridge-custom-image-design.md`
- Plan: `docs/superpowers/plans/2026-06-02-proton-bridge-custom-image.md`

The current implementation builds a verified custom Proton Bridge image from
Proton's Debian package and a separate Next.js UI image. The compose stack runs:

- `proton-bridge` from `ericbrearley/proton-bridge:dev`
- `proton-bridge-ui` from `ericbrearley/proton-bridge-ui:dev`

Do not return to the old community-image approach, do not publish `latest`, and
do not push this repository unless Eric asks.
