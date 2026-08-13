# 11 - Boundary guardrails

Status: done

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

- [x] Writes past the per-IP rate limit are refused, proven by a test
- [x] A body over the size limit is refused before it is parsed
- [x] A request from an origin other than the configured one is refused, and the configured origin succeeds
- [x] Creating a Recipe at the total cap is refused, and the cap is exact rather than approximate
- [x] A Recipe carrying more Recipe Ingredients than the per-Recipe cap is refused
- [x] Every limit reads from configuration, so moving one needs no code change
- [x] No guardrail is conditional on which Variant is running

## Comments

The per-Recipe Ingredient cap arrived with ticket 05, as `RECIPE_INGREDIENTS_MAX` in the shared
schema module, and `create-recipe.test.js` already asserted both sides of it. Nothing to build for
that item; it is ticked on the strength of the test that was already there.

**One tick carries an exception, stated rather than papered over.** "Every limit reads from
configuration" is true of everything this ticket added, and false of that per-Recipe Ingredient cap:
`RECIPE_INGREDIENTS_MAX` is a constant, and moving it is a code change. That is not an oversight to
fix later. The Add form compiles the same schema object the API enforces, which is what ADR-0005
buys, so a runtime-configurable value there would have to be shipped to the browser and the two
sides could then disagree about it. Trading that away to make one number an environment variable is
a worse deal than leaving it in code. Anyone reading the checklist should read this paragraph with
it.

Three calls made while building this, each worth a look in review:

**A mismatched Origin is refused with a 403, not just left without a CORS header.** @fastify/cors on
its own omits `access-control-allow-origin` and serves the request anyway, which leaves the browser
blocking a response whose write has already landed. The plugin still does the header and preflight
mechanics; a hook in front of it refuses the request outright. A request carrying no Origin is not
cross-origin and passes untouched, or the health check and every curl would fail.

This makes `CORS_ORIGIN` load-bearing and it has no default: browsers attach an Origin to
same-origin writes too, so a wrong value refuses the app's own saves. The Homelab Variant has to set
it to its tailnet URL in ticket 13.

**`TRUST_PROXY` was added, off by default.** Not in the ticket text, but `request.ip` is the last hop
unless it is on, so behind the Demo Variant's CloudFront every visitor would share one rate-limit
bucket and "per-IP" would not be true. It is a configuration value, not a Variant check.

**The total cap takes a transaction-scoped advisory lock before it counts.** Counting and then
inserting is approximate: two creates arriving together both read a count below the ceiling and both
insert. `guardrails.test.js` races two creates for the last place and asserts one 201 and one 409.

One change with a blast radius past this ticket: `buildApp` is now `async` and requires a
`guardrails` argument. @fastify/rate-limit attaches through an `onRoute` hook, so it has to finish
loading before the first route is registered or it silently covers nothing. Every caller awaits it
and `startApp` supplies test limits, so a route added by a later ticket is covered without opting
in.

Left alone deliberately: `port()` in `config.js` reads an empty `PORT` as port 0, which asks the
kernel for a random port. Not reachable today because compose.yaml hardcodes `PORT: 8080`, and out
of scope here. The new `positiveInteger()` and `flag()` readers do treat an empty string as unset,
because Compose renders every variable nobody set that way.

### From code review

Fixed: the advisory lock interpolated its key into the SQL string, which contradicted this file's
own "every statement is parameterized" header even though the key is a constant. `buildApp` checked
that a guardrails object was present rather than that it was complete, so a partial one would have
handed Fastify an undefined `bodyLimit` and got its silent 1 MB default. Several comments described
a version endpoint ticket 10 has not built yet. `count()` was reading bytes and milliseconds, so it
is `positiveInteger()` now. The cap tests hardcoded three Recipe names against `CAP = 3`.

Added, both gaps the review found: `TRUST_PROXY` had no test either way, and the rate-limit window
governed nothing any test observed.

Declined, with reasons: extracting the test file's raw `post()` into `test/helpers/recipes.js`,
because the two helpers already there assert fixed status codes and this one has to see refusals,
and because another agent held that file. The `ORIGIN` constant restating a test default, because
every CORS test passes it explicitly and nothing has to stay in sync. And the worry that
`CORS_ORIGIN: ${CORS_ORIGIN:?...}` gates unrelated compose commands: true, but compose.yaml already
does exactly this for both passwords, so `docker compose down` required a `.env` before this ticket.
