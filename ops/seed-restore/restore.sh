#!/usr/bin/env bash
# The Demo Variant's scheduled Seed restore. Truncates the demo database and loads the Seed back
# into it, every six hours.
#
# This is a security control and not housekeeping
# (docs/adr/0010-demo-guardrails-on-shared-hardware.md). The restore clears whatever an attacker
# stored as well as whatever a visitor accumulated, so its interval and RECIPES_MAX together decide
# the worst state a Reviewer can walk into. Lengthening the interval is a security change.
#
# The work itself is packages/api/src/seed.js, the API's own image with a different command, which
# means no second artifact to keep in step and no database client on the host. Everything here is
# scheduling and noticing.

set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="${REPO_DIR:-$(cd -- "$SCRIPT_DIR/../.." && pwd)}"
COMPOSE_FILE="${COMPOSE_FILE:-$REPO_DIR/compose.demo.yaml}"
ENV_FILE="${ENV_FILE:-$REPO_DIR/.env.demo}"
LOG_TAG='meal-prep-seed-restore'

# Ticket 14's alert channel, reused rather than reimplemented. The files live under ops/backup/
# because a backup is what first needed them, which reads oddly from here; what they actually are
# is this host's one way of reaching the Operator, and a second copy would be a second topic to
# configure and a second thing to drift. Worth moving to ops/common/ the next time either is
# touched. BACKUP_CONFIG_FILE is set explicitly because load_backup_config otherwise looks beside
# the calling script, which is this directory and not the one holding backup.env.
# shellcheck source=../backup/common.sh
source "$REPO_DIR/ops/backup/common.sh"
# shellcheck source=../backup/alert.sh
source "$REPO_DIR/ops/backup/alert.sh"
BACKUP_CONFIG_FILE="${BACKUP_CONFIG_FILE:-$REPO_DIR/ops/backup/backup.env}"
load_backup_config

# Deliberately not require_alert_channel(), which is what ticket 14's scripts call. That refuses to
# start when no alert channel is configured, on the grounds that a backup nobody hears about is
# worse than none. The reasoning inverts here: ADR-0010 makes this restore the control bounding how
# long anything an attacker stored survives in the Demo Variant, so a restore that declines to run
# because ntfy is unset would trade a real control for a reporting one. It runs either way, and
# alert() already logs loudly when it has nowhere to send.

# Named separately from the compose failure below, because a missing env file is an install
# mistake and a failing restore is an operational one, and the two want different responses.
# Ticket 14 learned this the hard way: a missing key killed the dump script mute.
for required in "$COMPOSE_FILE" "$ENV_FILE"; do
  if [[ ! -f "$required" ]]; then
    log "FATAL: $required not found; the restore cannot run"
    # Alerts too. An install mistake stops the restore just as completely as a failing one, and it
    # is the quieter of the two: the timer keeps firing, every run exits 1, and the Demo Variant
    # keeps whatever is in it.
    alert "meal-prep demo Seed restore cannot run"       "$required is missing on $(hostname), so the six-hourly restore exits immediately. The Demo Variant is not being reset."
    exit 1
  fi
done

log "restoring the Seed into the Demo Variant"

# --rm because this runs every six hours forever and stopped containers are not a log.
if docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" run --rm seed; then
  log "restore finished"
else
  status=$?
  # Silent failure here means the demo quietly stops being a fixture and starts being whatever a
  # visitor left in it, which is the state ADR-0010 bounds by having this run at all.
  log "FATAL: restore failed with status $status"
  alert "meal-prep demo Seed restore failed"     "The six-hourly restore exited $status on $(hostname). The Demo Variant is holding whatever accumulated since the last good run. Check: journalctl -u meal-prep-seed-restore -n 50"
  exit "$status"
fi
