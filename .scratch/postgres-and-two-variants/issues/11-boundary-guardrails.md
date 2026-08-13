# 11 - Boundary guardrails

Status: ready-for-agent

**What to build:** Scripted abuse gets slowed and bounded with no Operator intervention. Per-IP rate
limiting on writes, a request body size limit, CORS pinned to a configured origin, and absolute
ceilings on total Recipes and on Recipe Ingredients per Recipe.

The row caps, not an edge filter, are what bound the damage (ADR-0001). The realistic threat to a
portfolio demo is cost amplification and junk content, and refusing the write caps both. No web
application firewall: rejected on recurring cost rather than on merit, and worth revisiting if the
demo ever carries real traffic.

Every guardrail is unconditional, so the Homelab Variant inherits all of it and there is one code
path to reason about instead of two (ADR-0002). Limits and the allowed origin are configuration
values, never a mode check.

**Blocked by:** 05 (write endpoints for the limits and caps to apply to).

- [ ] Writes past the per-IP rate limit are refused, proven by a test
- [ ] A body over the size limit is refused before it is parsed
- [ ] A request from an origin other than the configured one is refused, and the configured origin succeeds
- [ ] Creating a Recipe at the total cap is refused, and the cap is exact rather than approximate
- [ ] A Recipe carrying more Recipe Ingredients than the per-Recipe cap is refused
- [ ] Every limit reads from configuration, so moving one needs no code change
- [ ] No guardrail is conditional on which Variant is running
