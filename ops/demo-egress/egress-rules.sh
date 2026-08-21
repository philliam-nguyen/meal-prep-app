#!/usr/bin/env bash
# The Demo Variant's egress rules: the demo Compose network may reach the internet and its own
# containers, and no private address range beyond that
# (docs/adr/0008-demo-backend-on-the-homelab.md). This is the control that addresses lateral
# movement; everything else in the design addresses inbound.
#
# Run by meal-prep-demo-egress.service after docker.service, because DOCKER-USER is a chain Docker
# creates at start. Rules written into it before Docker exists are rules that vanish, which is the
# usual reason iptables-persistent does not work for this.
#
# Idempotent: every rule carries a comment marker, and the marked rules are removed before being
# re-added. Running this twice is the same as running it once, which matters because it runs on
# every boot and an Operator will also run it by hand after changing something.

set -euo pipefail

MARKER='meal-prep-demo-egress'
# Both read from Docker rather than hardcoded: Compose allocates these, and a network recreated
# after a `down` can land on a different subnet. A stale subnet here is a rule that silently
# protects nothing.
DEMO_NET="${DEMO_NET:-meal-prep-demo_default}"

log() {
  local msg="$*"
  echo "$(date -Iseconds) $msg"
  if command -v logger >/dev/null 2>&1; then
    logger -t "${LOG_TAG:-meal-prep-demo-egress}" -- "$msg"
  fi
}

subnet_of() {
  docker network inspect "$1" --format '{{range .IPAM.Config}}{{.Subnet}}{{end}}' 2>/dev/null
}

DEMO_SUBNET="$(subnet_of "$DEMO_NET")"
if [[ -z "$DEMO_SUBNET" ]]; then
  # Loudly, not quietly. A missing network means the demo stack is down, and exiting 0 here would
  # report success for a control that was never installed.
  log "FATAL: no subnet found for docker network $DEMO_NET; is the demo stack up?"
  exit 1
fi
log "demo network $DEMO_NET is $DEMO_SUBNET"

# Remove any previous generation of these rules, however many there are. Matching on the comment
# rather than on the rule text means a changed subnet still gets cleaned up.
while read -r rule; do
  [[ -z "$rule" ]] && continue
  # shellcheck disable=SC2086
  iptables -t filter -D DOCKER-USER ${rule#-A DOCKER-USER }
done < <(iptables-save -t filter | grep -F -- "--comment $MARKER" | grep '^-A DOCKER-USER' || true)

add() {
  iptables -I DOCKER-USER "$@" -m comment --comment "$MARKER"
}

# Inserted in reverse, because -I puts each at the top: the last `add` below ends up first in the
# chain. Read the block bottom-up to see evaluation order.

# Everything else private is refused. The demo can still reach the internet, which is what it needs
# for nothing in particular today and for a package pull tomorrow.
add -s "$DEMO_SUBNET" -d 192.168.0.0/16 -j DROP
add -s "$DEMO_SUBNET" -d 172.16.0.0/12 -j DROP
add -s "$DEMO_SUBNET" -d 10.0.0.0/8 -j DROP

# Its own network first, so the API still reaches its own Postgres. 172.19/16 sits inside the
# 172.16/12 drop above, so without this exception the stack would break itself.
add -s "$DEMO_SUBNET" -d "$DEMO_SUBNET" -j RETURN

# And before all of it, return traffic on connections already accepted, so a reply to the AWS proxy
# is never mistaken for the demo reaching out.
add -s "$DEMO_SUBNET" -m conntrack --ctstate ESTABLISHED,RELATED -j RETURN

# Counted unquoted on purpose: iptables-save only puts quotes around a comment that contains
# spaces, and this marker has none. Matching the quoted form found nothing, which reported zero
# rules installed while five sat in the chain, and left the cleanup above unable to find its own
# previous generation - so a second run duplicated every rule instead of replacing it.
installed="$(iptables-save -t filter | grep -c -F -- "--comment $MARKER" || true)"
log "installed $installed rules in DOCKER-USER"
if [[ "$installed" -ne 5 ]]; then
  log "FATAL: expected 5 rules, found $installed"
  exit 1
fi
