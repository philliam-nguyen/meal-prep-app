#!/usr/bin/env bash
# The Demo Variant's egress rules: the demo Compose network may reach the internet and its own
# containers, and nothing private beyond that
# (docs/adr/0008-demo-backend-on-the-homelab.md). This is the control that addresses lateral
# movement; everything else in the design addresses inbound.
#
# Two chains, because one is not enough and finding that out took a test. DOCKER-USER sits in
# FORWARD and covers traffic routed *through* the host: other LAN devices, other Docker networks.
# Traffic addressed to the host itself is delivered locally and goes through INPUT instead, so
# DOCKER-USER never sees it. Rules in DOCKER-USER alone leave a demo container able to reach
# anything the host listens on, which on this machine includes sshd.
#
# Run by meal-prep-demo-egress.service after docker.service, because DOCKER-USER is a chain Docker
# creates at start. Rules written into it before Docker exists are rules that vanish, which is the
# usual reason iptables-persistent does not work for this.
#
# Idempotent: every rule carries a comment marker, and the marked rules are removed from both
# chains before being re-added. Running this twice is the same as running it once.

set -euo pipefail

MARKER='meal-prep-demo-egress'
CHAINS=(DOCKER-USER INPUT)
EXPECTED_RULES=7

# Read from Docker rather than hardcoded: Compose allocates this, and a network recreated after a
# `down` can land on a different subnet. A stale subnet here is a rule that silently protects
# nothing.
DEMO_NET="${DEMO_NET:-meal-prep-demo_default}"

log() {
  local msg="$*"
  echo "$(date -Iseconds) $msg"
  if command -v logger >/dev/null 2>&1; then
    logger -t "${LOG_TAG:-meal-prep-demo-egress}" -- "$msg"
  fi
}

DEMO_SUBNET="$(docker network inspect "$DEMO_NET" --format '{{range .IPAM.Config}}{{.Subnet}}{{end}}' 2>/dev/null || true)"
if [[ -z "$DEMO_SUBNET" ]]; then
  # Loudly, not quietly. A missing network means the demo stack is down, and exiting 0 here would
  # report success for a control that was never installed.
  log "FATAL: no subnet found for docker network $DEMO_NET; is the demo stack up?"
  exit 1
fi
log "demo network $DEMO_NET is $DEMO_SUBNET"

# Matched unquoted on purpose: iptables-save only puts quotes around a comment containing spaces,
# and this marker has none. Matching the quoted form found nothing, reported zero rules while five
# sat in the chain, and left this loop unable to find its own previous generation.
for chain in "${CHAINS[@]}"; do
  while read -r rule; do
    [[ -z "$rule" ]] && continue
    # shellcheck disable=SC2086
    iptables -t filter -D "$chain" ${rule#-A $chain }
  done < <(iptables-save -t filter | grep -F -- "--comment $MARKER" | grep "^-A $chain " || true)
done

add() {
  local chain="$1"; shift
  iptables -I "$chain" "$@" -m comment --comment "$MARKER"
}

# Each -I puts its rule at the top, so the last add in a block ends up first in the chain. Read
# each block bottom-up to see evaluation order.

# FORWARD path: other LAN devices, other Docker networks, anything routed through this host.
add DOCKER-USER -s "$DEMO_SUBNET" -d 192.168.0.0/16 -j DROP
add DOCKER-USER -s "$DEMO_SUBNET" -d 172.16.0.0/12 -j DROP
add DOCKER-USER -s "$DEMO_SUBNET" -d 10.0.0.0/8 -j DROP
# Its own network, so the API still reaches its own Postgres. 172.19/16 sits inside the 172.16/12
# drop above, so without this exception the stack breaks itself.
add DOCKER-USER -s "$DEMO_SUBNET" -d "$DEMO_SUBNET" -j RETURN
# Replies on connections already accepted, so answering the AWS proxy is never mistaken for the
# demo reaching out.
add DOCKER-USER -s "$DEMO_SUBNET" -m conntrack --ctstate ESTABLISHED,RELATED -j RETURN

# INPUT path: the host itself, on every address it holds, including the docker bridge gateway.
# Nothing the demo stack needs is served by the host - Postgres is a container on its own network,
# the container resolver lives inside each container's own namespace, and Tailscale dials the
# internet - so this is a flat drop rather than a list of exceptions.
add INPUT -s "$DEMO_SUBNET" -j DROP
add INPUT -s "$DEMO_SUBNET" -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT

installed="$(iptables-save -t filter | grep -c -F -- "--comment $MARKER" || true)"
log "installed $installed rules across ${CHAINS[*]}"
if [[ "$installed" -ne "$EXPECTED_RULES" ]]; then
  log "FATAL: expected $EXPECTED_RULES rules, found $installed"
  exit 1
fi
