#!/usr/bin/env bash
# Daily watchdog for the nightly dump. Run by meal-prep-backup-check.timer, well after
# meal-prep-backup.timer's window, so it catches what dump.sh's own alerting cannot: the run that
# never happened at all (the host was off, the timer was disabled, dump.sh crashed before it could
# even source alert.sh). dump.sh's own zero-byte check catches a bad dump the moment it is made;
# this catches both that and a dump that simply is not there, from outside the process that would
# have produced it.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# shellcheck source=./common.sh
source "$SCRIPT_DIR/common.sh"
# shellcheck source=./alert.sh
source "$SCRIPT_DIR/alert.sh"

LOG_TAG="meal-prep-backup-check"

load_backup_config

STACK_NAME="${BACKUP_STACK_NAME:-homelab-variant}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/meal-prep}"

DATE="$(date +%F)"
DUMP_PATH="$BACKUP_DIR/${STACK_NAME}_${DATE}.sql"

if [[ ! -f "$DUMP_PATH" ]]; then
  log "ERROR: no dump found for $DATE at $DUMP_PATH"
  alert "meal-prep backup missing" "No dump found for $DATE at $DUMP_PATH. Check meal-prep-backup.service's last run."
  exit 1
fi

SIZE="$(stat -c%s "$DUMP_PATH" 2>/dev/null || stat -f%z "$DUMP_PATH")"
if [[ "$SIZE" -eq 0 ]]; then
  log "ERROR: dump for $DATE is zero bytes"
  alert "meal-prep backup empty" "Dump for $DATE at $DUMP_PATH is zero bytes, not a working backup."
  exit 1
fi

log "dump for $DATE present and non-empty ($SIZE bytes)"
