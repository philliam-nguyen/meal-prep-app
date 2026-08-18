#!/usr/bin/env bash
# Nightly pg_dump of the Homelab Variant's Postgres container. Run unattended by
# meal-prep-backup.timer on the homelab host - see docs/runbooks/homelab.md for install steps.
#
# Never dumps the Demo Variant: the container is named explicitly below and nothing here discovers
# "whatever Postgres is running". Backing up seeded data would waste the offsite copy, and the Demo
# Variant's recovery story is the Seed restore on its own timer, not a backup
# (docs/adr/0008-demo-backend-on-the-homelab.md).
#
# Idempotent: reruns on the same day overwrite that day's dump rather than failing or duplicating,
# and retention pruning is a pure function of what dump files exist, so running this twice in one
# day leaves the same state as running it once. Every failure path logs and alerts before it exits
# non-zero - a missing container, a pg_dump that exits non-zero, a zero-byte dump, and a failed
# offsite copy all count as failure, never as a quiet success.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

# shellcheck source=./common.sh
source "$SCRIPT_DIR/common.sh"
# shellcheck source=./alert.sh
source "$SCRIPT_DIR/alert.sh"

load_backup_config

STACK_NAME="${BACKUP_STACK_NAME:-homelab-variant}"
CONTAINER="${HOMELAB_DB_CONTAINER:-meal-prep-db-1}"
COMPOSE_ENV_FILE="${COMPOSE_ENV_FILE:-$REPO_ROOT/.env}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/meal-prep}"
RETENTION_COUNT="${RETENTION_COUNT:-30}"
OFFSITE_DEST="${OFFSITE_DEST:-}"

fail() {
  log "ERROR: $*"
  alert "meal-prep backup failed" "$*"
  exit 1
}

[[ -f "$COMPOSE_ENV_FILE" ]] || fail "compose env file not found at $COMPOSE_ENV_FILE"

# Read only the three values pg_dump needs, rather than sourcing the whole compose .env - that
# file also carries the app role's password and other settings this script has no business holding.
read_env_value() {
  local key="$1"
  grep -E "^${key}=" "$COMPOSE_ENV_FILE" | tail -n1 | cut -d= -f2-
}

POSTGRES_OWNER_ROLE="$(read_env_value POSTGRES_OWNER_ROLE)"
POSTGRES_OWNER_PASSWORD="$(read_env_value POSTGRES_OWNER_PASSWORD)"
POSTGRES_DB="$(read_env_value POSTGRES_DB)"
POSTGRES_OWNER_ROLE="${POSTGRES_OWNER_ROLE:-meal_prep_owner}"
POSTGRES_DB="${POSTGRES_DB:-meal_prep}"

[[ -n "$POSTGRES_OWNER_PASSWORD" ]] || fail "POSTGRES_OWNER_PASSWORD is not set in $COMPOSE_ENV_FILE"

# Name the container explicitly. A missing container fails loudly here rather than this script
# falling back to whatever Postgres happens to be running - which, on this host, could be the Demo
# Variant's.
RUNNING="$(docker inspect --format '{{.State.Running}}' "$CONTAINER" 2>/dev/null || true)"
[[ "$RUNNING" == "true" ]] \
  || fail "container '$CONTAINER' is not running - the Homelab Variant's database was not found by that name"

mkdir -p "$BACKUP_DIR"

DATE="$(date +%F)"
DUMP_NAME="${STACK_NAME}_${DATE}.sql"
DUMP_PATH="$BACKUP_DIR/$DUMP_NAME"
TMP_PATH="$DUMP_PATH.tmp"

log "starting dump of $CONTAINER ($STACK_NAME) to $DUMP_PATH"

if ! docker exec -e PGPASSWORD="$POSTGRES_OWNER_PASSWORD" "$CONTAINER" \
    pg_dump -U "$POSTGRES_OWNER_ROLE" -d "$POSTGRES_DB" > "$TMP_PATH"; then
  rm -f "$TMP_PATH"
  fail "pg_dump exited non-zero against $CONTAINER"
fi

SIZE="$(stat -c%s "$TMP_PATH" 2>/dev/null || stat -f%z "$TMP_PATH")"
if [[ "$SIZE" -eq 0 ]]; then
  rm -f "$TMP_PATH"
  fail "dump for $DATE is zero bytes - refusing to count it as a backup"
fi

mv "$TMP_PATH" "$DUMP_PATH"
log "dump written: $DUMP_PATH ($SIZE bytes)"

# Retention: keep the newest RETENTION_COUNT dumps for this stack. Filenames sort lexically in
# date order (STACK_YYYY-MM-DD.sql), so a plain reverse sort is a chronological one - no reliance
# on file modification times, which a restore or a copy can change.
mapfile -t OLD_DUMPS < <(
  find "$BACKUP_DIR" -maxdepth 1 -name "${STACK_NAME}_*.sql" -printf '%f\n' 2>/dev/null \
    | sort -r \
    | tail -n "+$((RETENTION_COUNT + 1))"
)
for old in "${OLD_DUMPS[@]:-}"; do
  [[ -n "$old" ]] || continue
  log "pruning old dump: $old"
  rm -f -- "$BACKUP_DIR/$old"
done

# Offsite copy. user@host:path (the rsync remote-shell shape, user always spelled out rather than
# left to default) means an rsync-over-ssh target reached over the tailnet; anything else is a
# local path, which on the homelab is where a mounted network share (a NAS, another machine's
# export) lives. Either way this is required, not best-effort - a dump that never leaves the
# homelab is not what "a copy lands off the homelab" means.
[[ -n "$OFFSITE_DEST" ]] || fail "OFFSITE_DEST is not configured - the dump stayed local only"

if [[ "$OFFSITE_DEST" == *@*:* ]]; then
  rsync -a --timeout=60 -e "ssh -o BatchMode=yes -o ConnectTimeout=10" \
      "$DUMP_PATH" "${OFFSITE_DEST%/}/" \
    || fail "offsite copy of $DUMP_NAME to $OFFSITE_DEST failed"
else
  mkdir -p "$OFFSITE_DEST" || fail "could not create offsite destination directory $OFFSITE_DEST"
  cp -p "$DUMP_PATH" "${OFFSITE_DEST%/}/" || fail "offsite copy of $DUMP_NAME to $OFFSITE_DEST failed"
fi
log "copied $DUMP_NAME offsite to $OFFSITE_DEST"

log "backup complete for $DATE"
