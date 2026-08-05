---
status: accepted
date: 2026-08-03
---

# The application has no authentication; the network is the access control

There is no login, no session, no user table, and no per-user data anywhere in this app. The
homelab variant is reachable only over Tailscale, and membership of that tailnet is the entire
authorization model. The demo variant is deliberately open to anonymous visitors and holds
nothing but seed data, so it has nothing to protect.

This is a deliberate choice, not an oversight. The app has no concept of a user and never has:
there is one shared Shopping List, one shared Pantry, and one shared set of Selected Recipes,
which is the point — two people cooking together want to see the same list, not their own. Adding
authentication would mean first inventing a user, and per-user state is a domain change that
makes the app worse at the thing it exists to do.

## Considered options

**Public ingress with a single shared password.** Rejected. Lower friction for a second phone
than installing Tailscale, but it puts the instance on the public internet with one secret
between a stranger and personal data, and it needs its own rate limiting to be credible.

**Real per-user accounts.** Rejected as a domain change disguised as a security change. It only
pays for itself if you actually want separate lists per person, which is the opposite of the
requirement.

**LAN only.** Rejected. This is a grocery-shopping tool; it is least useful exactly when you are
not at home.

## Consequences

Anyone on the tailnet has full read and write access to everything, including delete. There is no
audit trail and no way to know who changed what. Accepted: the tailnet is two phones.

Access depends on Tailscale continuing to work on both devices. If it fails, the shopping list is
unreachable mid-aisle and there is no fallback path — no public URL, no cached write queue that
reaches the server.

A reader encountering the API will find endpoints that mutate data with no credential check
whatsoever, which looks like a critical vulnerability in isolation. It is safe only because of
where the service is deployed. Any change that gives the homelab variant public ingress
invalidates this ADR entirely and must replace it rather than amend it.

The demo variant runs the same auth-free code on the public internet. Everything protecting it is
therefore an input-validation and rate-limiting concern rather than an authentication one — see
[0001](./0001-app-level-demo-guardrails.md).
