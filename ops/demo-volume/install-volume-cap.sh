#!/usr/bin/env bash
# The cap on the demo Postgres volume's size, which ADR-0010 lists among the replacements for the
# AWS storage ceiling (docs/adr/0010-demo-guardrails-on-shared-hardware.md). Compose's local volume
# driver cannot express a size, so the cap is host state: a fixed-size loopback ext4 image, mounted
# by /etc/fstab before docker.service, with the demo's `database` volume bind-backed by a directory
# inside it. Writes stop at the image's edge instead of at the end of the host's disk.
#
# Loopback rather than an XFS project quota because the root filesystem here is ext4.
#
# 2G against a Seed measured in kilobytes: a fresh Postgres 17 cluster is ~40M and the default
# max_wal_size lets WAL alone approach 1G, so anything smaller risks capping normal operation
# rather than a runaway. The cap exists to bound a bug or an unbounded log, not a visitor - a
# visitor is already bounded by RECIPES_MAX and the six-hour restore.
#
# Run with sudo from the repository root. Idempotent: every step checks before it acts, and the
# volume swap is skipped when the volume is already bind-backed. The swap discards the demo
# database, which costs exactly one Seed restore, run at the end.
#
# Failure mode if the mount is ever absent at boot: the bind source disappears, the db container
# refuses to start, and the six-hourly restore fails and alerts through ops/backup/alert.sh. The
# mountpoint is made immutable while unmounted so nothing can quietly write to the unbacked
# directory underneath.

set -euo pipefail

SIZE="${SIZE:-2G}"
BASE=/var/lib/meal-prep-demo
IMG="$BASE/pgdata.img"
MNT="$BASE/pgdata"
DATA="$MNT/data"
# Loop mounts get fsck pass 0: systemd-fsck would otherwise run before the loop device exists.
# x-systemd.before makes the boot ordering explicit instead of coincidental; nofail keeps a broken
# image from holding the whole boot (the demo failing loudly is the designed response, per above).
FSTAB_LINE="$IMG $MNT ext4 loop,nofail,x-systemd.before=docker.service 0 0"

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="${REPO_DIR:-$(cd -- "$SCRIPT_DIR/../.." && pwd)}"
COMPOSE_FILE="$REPO_DIR/compose.demo.yaml"
ENV_FILE="$REPO_DIR/.env.demo"

log() { echo "$(date -Iseconds) $*"; }

[[ $EUID -eq 0 ]] || { log "FATAL: run with sudo"; exit 1; }

# --- the image ---
mkdir -p "$BASE"
if [[ ! -f "$IMG" ]]; then
  log "creating $SIZE image at $IMG"
  truncate -s "$SIZE" "$IMG"
  chmod 600 "$IMG"
  mkfs.ext4 -q -L meal-prep-demo-pg "$IMG"
else
  log "$IMG already exists, leaving it alone"
fi

# --- the mount ---
if ! grep -qF "$IMG $MNT " /etc/fstab; then
  log "adding fstab entry"
  echo "$FSTAB_LINE" >> /etc/fstab
  systemctl daemon-reload
else
  log "fstab entry already present"
fi

mkdir -p "$MNT"
if ! findmnt -rn "$MNT" >/dev/null; then
  # Immutable while unmounted, so a missing mount means loud container failure rather than silent
  # uncapped writes to the directory underneath. Mounting over an immutable directory is allowed.
  chattr +i "$MNT"
  log "mounting $MNT"
  mount "$MNT"
else
  log "$MNT already mounted"
fi
mkdir -p "$DATA"

findmnt "$MNT"
df -h "$MNT"

# --- the volume swap ---
current_device="$(docker volume inspect meal-prep-demo_database --format '{{index .Options "device"}}' 2>/dev/null || true)"
if [[ "$current_device" == "$DATA" ]]; then
  log "volume already bind-backed by $DATA, nothing to swap"
else
  log "swapping meal-prep-demo_database onto the capped filesystem (the data is the Seed; this costs one restore)"
  docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" down
  docker volume rm -f meal-prep-demo_database
  docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" up -d
  systemctl start meal-prep-seed-restore.service
fi

# --- verification, loud ---
actual_device="$(docker volume inspect meal-prep-demo_database --format '{{index .Options "device"}}')"
if [[ "$actual_device" != "$DATA" ]]; then
  log "FATAL: volume device is '$actual_device', expected $DATA"
  exit 1
fi

for _ in $(seq 30); do
  state="$(docker inspect meal-prep-demo-api-1 --format '{{.State.Health.Status}}' 2>/dev/null || echo absent)"
  [[ "$state" == healthy ]] && break
  sleep 2
done
if [[ "${state:-}" != healthy ]]; then
  log "FATAL: demo API is '$state', not healthy, after the swap"
  exit 1
fi

log "PASS: demo Postgres writes into $DATA, capped at $SIZE, API healthy, Seed restored"
