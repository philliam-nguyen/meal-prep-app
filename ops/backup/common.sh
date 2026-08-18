# Sourced by dump.sh and check-backup.sh before anything else. Logging and configuration loading
# only - nothing here talks to Postgres or Docker, so it carries no secrets of its own.

log() {
  local msg="$*"
  echo "$(date -Iseconds) $msg"
  # journald/syslog is what an unattended systemd timer's failures actually get read from later.
  # A host without `logger` (this is written for Ubuntu; nothing else is assumed) still gets the
  # line above on stdout, which systemd captures into the journal on its own.
  if command -v logger >/dev/null 2>&1; then
    logger -t "${LOG_TAG:-meal-prep-backup}" -- "$msg"
  fi
}

# Shared by dump.sh's own zero-byte check and check-backup.sh's - one place to get the
# GNU-vs-BSD stat fallback right rather than two copies that can drift.
file_size() {
  stat -c%s "$1" 2>/dev/null || stat -f%z "$1"
}

# Settings live in a config file: backup.env beside this script on the host, or wherever
# BACKUP_CONFIG_FILE points (the tests point it at a scratch file per case, the same way an
# Operator points it at backup.env). Missing entirely is not an error here - dump.sh and
# check-backup.sh apply their own defaults afterwards and fail loudly on the ones that matter.
load_backup_config() {
  local config_file="${BACKUP_CONFIG_FILE:-$SCRIPT_DIR/backup.env}"
  if [[ -f "$config_file" ]]; then
    # shellcheck disable=SC1090
    source "$config_file"
  fi
}
