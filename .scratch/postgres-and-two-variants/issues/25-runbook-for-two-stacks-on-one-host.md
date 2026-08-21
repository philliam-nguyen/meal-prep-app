# 25 - The runbook covers two stacks on one host

Status: ready-for-human

**What to build:** An Operator at the host can tell the two stacks apart at the prompt, knows which
controls keep them separate, and knows where each one's recovery story lives. The Homelab Variant's
runbook gains a section for the fact that the Demo Variant's API and Postgres run on the same
machine, in a Compose project of their own
([ADR-0008](../../../docs/adr/0008-demo-backend-on-the-homelab.md)).

Split out of ticket 13, whose 2026-08-17 comment recorded the requirement. Ticket 13 delivered the
Homelab Variant, its Compose file and its runbook, and closes once the Operator runs its four
boundary checks. The second stack it now shares a host with is ticket 15's, so the section
describing it could not be written truthfully yet. This is the split.

**Nothing about the Homelab Variant changes.** Its API stays bound to `127.0.0.1`, `tailscale serve`
still reaches it, `TRUST_PROXY` stays `true` there for the `Header.Set` reason ticket 13 recorded,
and `compose.yaml` is untouched. This ticket adds documentation, not configuration.

**What the section covers:**

- The two stacks as separate Compose projects, with separate Postgres containers, separate volumes
  and separate networks, and no shared password between them. Sharing one turns the separation into
  decoration.
- The `DOCKER-USER` egress rules that stop the demo network reaching private address ranges other
  than its own database. This is the control that addresses lateral movement; the rest is inbound.
- The local model runtime on this host, bound away from the network, recorded as a control rather
  than left as an accident.
- The demo's Seed restore timer, its owner credentials, and that it is a security control rather
  than housekeeping.

**It points at ADR-0010 rather than restating it.** The isolation is real and it is not structural:
both stacks share a kernel, a Docker daemon, a filesystem and a root user.
[ADR-0010](../../../docs/adr/0010-demo-guardrails-on-shared-hardware.md) states what is accepted and
on what grounds, and a runbook that re-argues it will drift from it.

**The backup paragraph is not this ticket's.** Ticket 14 already carries "the schedule and the alert
path are documented in the runbook from ticket 13" as a box, and already says which container it
dumps and which it must not. Two tickets writing one paragraph is two paragraphs that eventually
disagree. This section may point at 14's; it does not duplicate it.

**Human-only.** Every control here is documented as installed rather than as intended: the egress
rules as they actually sit in the chain, the model runtime's actual binding, the timer as it
actually runs. That is host state only the Operator can see, so the section is written from the host
rather than from the repository.

**Blocked by:** 27 (the Demo Variant's stack really running on this host). This said 15 until
2026-08-20, which was wrong: 15 builds the AWS half and says so, and the stack this section describes
had no ticket at all. See 27.

- [ ] The runbook says which Compose project is which, and how to tell the two Postgres containers,
      volumes and networks apart at the prompt
- [ ] It states that the two stacks share no password, and where each one's `.env` lives
- [ ] The `DOCKER-USER` rules are written down as installed, saying what they drop and what they
      permit, and how they are made to survive a reboot
- [ ] The local model runtime's binding is recorded, with the command that checks it is still bound
      that way
- [ ] The Seed restore timer's schedule and owner credentials are documented, and it is described as
      a security control rather than as housekeeping
- [ ] The section links ADR-0010 for what is being accepted instead of restating the argument
- [ ] Nothing in the section duplicates ticket 14's backup paragraph
