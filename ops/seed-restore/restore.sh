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

log() {
  local msg="$*"
  echo "$(date -Iseconds) $msg"
  if command -v logger >/dev/null 2>&1; then
    logger -t "$LOG_TAG" -- "$msg"
  fi
}

# Named separately from the compose failure below, because a missing env file is an install
# mistake and a failing restore is an operational one, and the two want different responses.
# Ticket 14 learned this the hard way: a missing key killed the dump script mute.
for required in "$COMPOSE_FILE" "$ENV_FILE"; do
  if [[ ! -f "$required" ]]; then
    log "FATAL: $required not found; the restore cannot run"
    exit 1
  fi
done

log "restoring the Seed into the Demo Variant"

# --rm because this runs every six hours forever and stopped containers are not a log.
if docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" run --rm seed; then
  log "restore finished"
else
  status=$?
  # Non-zero exit is what systemd holds the unit to, and OnFailure on the unit is what turns this
  # into something anyone hears about. Silent failure here means the demo quietly stops being a
  # fixture and starts being whatever a visitor left in it.
  log "FATAL: restore failed with status $status"
  exit "$status"
fi
