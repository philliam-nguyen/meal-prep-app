# Sourced by dump.sh and check-backup.sh. Sends a push notification to the Operator so a broken
# backup cannot masquerade as a working one by simply staying quiet.
#
# Uses ntfy (https://ntfy.sh) - a single unauthenticated POST, no account, no paid service, and the
# same mechanism whether the Operator uses the public instance or a self-hosted one. NTFY_TOPIC is
# effectively a shared secret: anyone who knows it can publish to it and read its history, so it is
# generated per install and lives in backup.env, never in this repository.
#
# NTFY_TOPIC is required, checked once at the top of each script by require_alert_channel() below,
# for the same reason OFFSITE_DEST is required: "an alert reaches the Operator" is load-bearing in
# the ticket this exists for, not a nicety, so a script that would run its whole night with nowhere
# to send a failure refuses to start at all rather than quietly doing less than it promises.

require_alert_channel() {
  if [[ -z "${NTFY_TOPIC:-}" ]]; then
    log "ERROR: NTFY_TOPIC is not configured - a backup alert would have nowhere to go"
    exit 1
  fi
}

alert() {
  local subject="$1"
  local body="$2"
  local url="${NTFY_URL:-https://ntfy.sh}"
  local topic="${NTFY_TOPIC:-}"

  if [[ -z "$topic" ]]; then
    log "ALERT not delivered (NTFY_TOPIC unset): $subject: $body"
    return 0
  fi

  if ! curl -fsS -m 10 \
      -H "Title: $subject" \
      -H "Priority: high" \
      -H "Tags: warning" \
      -d "$body" \
      "${url%/}/$topic" >/dev/null; then
    log "ALERT DELIVERY FAILED for: $subject: $body"
  fi
}
