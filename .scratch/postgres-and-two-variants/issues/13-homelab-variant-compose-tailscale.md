# 13 - Homelab Variant: one Compose command and Tailscale

Status: ready-for-agent

**What to build:** The Operator brings up the whole Homelab Variant with one Compose command, so
rebuilding after a host change is uneventful. API and Postgres, a named volume, and no host path
assumptions, so the file lifts into a virtual machine later unchanged.

A cook reaches it from the grocery store over Tailscale, with TLS terminated on a real certificate on
the `ts.net` name. There is no login. Tailnet membership is the entire authorization model, and that
is only safe because of where the service sits (ADR-0003). Any change giving this Variant public
ingress invalidates that ADR rather than amending it.

A Proxmox rebuild was considered and rejected: it replaces the host operating system, takes down an
unrelated service already running there, and does nothing for two containers.

Applying the Compose file to the real host is the Operator's step. This ticket delivers the file, the
image wiring and the runbook.

**Blocked by:** 09 (feature parity with what the spreadsheet did), 11 (guardrails, which the Homelab
Variant inherits unconditionally).

- [ ] One Compose command brings up API and Postgres from the published image
- [ ] Data survives recreating the containers
- [ ] No bind mount to a host path appears in the Compose file
- [ ] The app answers on the tailnet name with a valid certificate, and both phones reach it
- [ ] The app does not answer from outside the tailnet
- [ ] Migrations apply on start or through a documented one-line command
- [ ] A runbook covers bring-up, migration, and where the connection string lives, which is never the repository
