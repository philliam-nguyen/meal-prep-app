# 10 - Freshness without a held-open connection

Status: done

**What to build:** Two people shopping together work from one list. A Got It mark made on one phone
shows up on the other within a few seconds, with nobody navigating anywhere or reaching for a refresh
button, so they do not both buy the milk.

The API exposes a cheap version endpoint returning the maximum update timestamp across mutable state.
The client polls it on a short interval, only while the document is visible and only on the views
where staleness matters, and refetches real data when the value moves. An unchanged poll costs a few
bytes, and a backgrounded phone costs nothing.

No server-sent events and no websockets. Beyond being more than boolean toggles require, a long-lived
connection per visitor is server-side state an anonymous visitor can hold open on the public
instance, which is the shape of thing the guardrails exist to avoid (ADR-0001).

There are no write conflicts to resolve. Every write targets an independent field, so last-write-wins
is correct here rather than a compromise. Stale reads are the whole problem.

**Blocked by:** 06 (the Shopping List toggles, which are what two phones actually race on). Writes
exist from ticket 05, so this could be pulled earlier at the cost of having nothing worth polling
for.

- [x] The version endpoint advances after a write and holds steady otherwise, proven by a test
- [ ] A change made in one browser appears in a second within a few seconds with no navigation
- [x] Polling stops while the document is hidden and resumes when it becomes visible
- [x] An unchanged version triggers no data refetch
- [x] The endpoint costs one cheap query and returns a small body
- [x] Views where staleness does not matter do not poll

## Comments

**The one unticked box.** Nobody has watched a Got It mark cross between two browsers, because no
browser driver is installed here and the Compose stack still wants the image build that ticket 13
unblocks. Everything under that box is proven a layer down: the endpoint moves on every write shape
through Fastify's `inject` against real Postgres, and the poll's rules are proven against an injected
clock. What is unproven is React calling them, which is a five-minute check for whoever has the stack
up.

**The version is a timestamp and three row counts, not a timestamp.** `max(updated_at)` across
Recipes and Ingredients cannot see a delete: removing a row that is not the most recently touched one
leaves the maximum exactly where it was. Ticket 09 brings deletes, so a version built on the
timestamp alone would have sat still while a Recipe vanished from under the other phone. The counts
of `recipes`, `ingredients` and `recipe_ingredients` close that, because every delete takes a row
from one of the three. `advances when a Recipe is deleted, even one that is not the newest` was red
against the timestamp-only version, which is what earned them.

A trigger-maintained single-row version table was the alternative, and it is the more complete
answer: it would catch every write shape including the gap below, and cost one row read instead of
three scans. It was rejected for needing a migration and putting a row lock on the single row every
write in the app would contend for. Worth revisiting if the gap below ever bites.

**The gap the counts do not close.** An edit that changes only a Recipe Ingredient's quantity or unit
moves no timestamp and no count, so the version holds still while the Shopping List changes.
`recipe_ingredients` carries no `updated_at`, and the `recipes` trigger is guarded by
`when (old.* is distinct from new.*)`, so touching the child rows alone leaves the parent's timestamp
where it was. Ticket 09 owns the edit path and can close it in its own statement: any `update recipes`
that sets a value changes the row, so the trigger fires and the version moves. It should either write
the parent row on every edit or say why it does not.

**The version travels in `/api/state` as well, which the ticket did not ask for.** The poll needs
something to compare against, and the only alternatives were worse. If the client takes its baseline
from its own first poll, a write landing between the state response and that poll gets adopted as the
baseline, and a change adopted as the baseline is a change that never arrives: the client sits stale
until something else happens to move the version. Carrying it in the payload closes that window
completely and costs one field.

`readState` reads the version first and alone, before the payload's own queries, and the ordering is
load-bearing rather than incidental. Read afterwards or in parallel, it could describe a write the
payload missed, which is the same permanent staleness in a smaller window. Read first, the worst case
is a version slightly older than the payload, which costs one refetch nobody needed.
`is never newer than the payload it arrives with` pins it by landing a write between the two.

**Microseconds, not milliseconds.** Both reviews caught this. Rounding the timestamp to milliseconds
would let a toggle landing in the same millisecond as the read that gave a client its baseline
produce an identical token, and that change would never reach that client. Postgres keeps
microseconds; the token now does too.

**The frontend has tests now, and two documents say it should not.** ADR-0005 records that "the
frontend keeps having no tests, and nothing here changes that", and the spec's testing section says
"Explicitly not tested: the frontend". Three of this ticket's six boxes are client-side behaviour,
and none of them can be seen from the API. `packages/web/src/freshness.js` holds no JSX and renders
nothing: it is the polling rules with the browser injected, so the tests need no DOM, no renderer and
no new dependency, and `packages/web` now runs `node --test` like `packages/shared` already does.
That is still a contradiction of a recorded decision rather than a reading of it, and
`docs/agents/domain.md` says to surface those rather than override them quietly. **ADR-0005 wants
amending, or a new ADR wants writing.** Left for the operator, since amending an ADR is not a
ticket's call to make.

**Two tests in `version.test.js` reach past the HTTP seam, both on purpose, both recorded in the
file's header.** `recordQueries` wraps `pool.query` to count statements, because "one cheap query" is
a promise to a client that asks every four seconds and a response body cannot show whether six
answered it. It observes and passes through; nothing is stubbed and the database stays real. The
delete test runs the one raw statement in the file, because ticket 09 has not shipped a delete
endpoint yet and the alternative was shipping the claim untested. That one goes when ticket 09 lands.
The interleaved write started as raw SQL too and now goes through `POST /api/recipes`, which also
removed a `'bread'` that the shared Recipe Type allowlist would have refused. Good catch from both
reviews.

**A real bug the spec review found.** The in-flight guard covered the version poll but not the
refetch it triggers, so a `/api/state` reload slower than the four-second interval had a second one
started on top of it, then a third, stacking requests on exactly the connection least able to carry
them. One flag now covers both, and `onStale` is awaited. The test written for it passed against the
broken code on the first attempt, because the second interval was arriving while the first poll was
still parked on its own request; it needed a settle step to reach the case at all. Verified red, then
green.

**Vocabulary.** `CONTEXT.md` lists "version" under the words to avoid, though it lists it as a
synonym for **Variant** rather than as a banned word, and the spec calls this the "version endpoint"
throughout. The endpoint keeps the spec's name. The glossary has no entry for this concept at all,
which is the real gap: worth a `Freshness` or `Version` entry so that "version" reads as one thing in
`version.js` and another in `compose.yaml` on purpose rather than by accident. Noted for
`/domain-modeling` rather than edited here.

**Cost, measured honestly.** The endpoint is one round trip and one statement, and that statement is
three sequential scans plus two aggregates. At a few hundred Recipes that is microseconds and the
body is 34 bytes. It is not free, and it is what the single-row table above would have made free.

**One judgement call argued down.** The standards review called `VIEWS_THAT_GO_STALE` a third
parallel list of tab ids beside `NAV_ITEMS` and `PAGE_TITLES`, and suggested a flag on `NAV_ITEMS`.
Moving it there would put the rule in `App.jsx`, which has no tests, and the box "views where
staleness does not matter do not poll" would stop being provable. Which views can go stale is
freshness knowledge, so it stays with the poll.

**Verified before commit.** 173 tests green: 140 API against real Postgres, 23 shared, 10 web. Clean
frontend build.
