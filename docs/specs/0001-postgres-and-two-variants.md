---
id: 0001
title: Postgres migration and two deployment Variants
status: accepted
date: 2026-08-03
adrs: [0001, 0002, 0003, 0005]
---

# Postgres migration and two deployment Variants

Vocabulary in this document follows `CONTEXT.md`. Decisions marked with an ADR reference are
recorded permanently in `docs/adr/`.

The working issue-tracker copy of this spec lives at
`.scratch/postgres-and-two-variants/spec.md` and carries the triage status. This committed copy
is the authoritative content; if the two diverge, this one wins.

## Problem Statement

The app is slow, and the slowness has two independent causes that look like one.

Writes go through a Google Apps Script web app. Every toggle — marking an Ingredient as Got It,
selecting a Recipe, ticking something in the Pantry — is an HTTP round trip to a script whose cold
start dominates the latency. Reads are four separate Google Sheets API calls on load. Separately,
every cold start downloads roughly three megabytes of React and babel-standalone from a public CDN
and compiles the entire app in the browser before anything renders. Fixing only the database would
leave a large part of the perceived slowness in place.

Three further problems sit underneath that:

The recipe-matching logic lives in spreadsheet formulas in columns D, E and F of the
`Ingredients Match` tab. There is no copy of it in the repository, and the Apps Script that
performs writes was never committed either. Two pieces of the running system exist only inside
Google's products.

There is no way to show the app to anyone. It is wired to one specific spreadsheet holding real
personal data, so demonstrating it means either handing over access to that data or showing
screenshots. There is also a live exposure risk: the spreadsheet id is committed in the repository
and the setup instructions direct the user to share the sheet with anyone holding the link.

Finally, the app cannot be fixed from inside itself. There is no edit path and no delete path for
a Recipe; the only remedy for bad data is opening the spreadsheet directly, which the migration
would remove.

## Solution

Move the data to Postgres behind a small API, and ship that single codebase as two Variants.

The **Homelab Variant** is the one that gets used. It holds real data, runs on the homelab under
Docker Compose, and is reachable only over Tailscale. It gains the edit and delete capabilities
the spreadsheet used to provide by hand.

The **Demo Variant** is a public showcase for both the app and its Terraform. It holds nothing but
Seed data, is fully interactive for anonymous visitors, refuses to let anyone modify Protected
seeded content, and restores itself from the Seed on a schedule.

The two Variants share one container image, one frontend bundle, and one set of behaviours. Every
difference between them lives in the wrapper — a Compose file on one side, Terraform on the other
(ADR-0002).

Alongside the move, the match rule stops being a spreadsheet formula and becomes queryable SQL
defined in version control; the Shopping List stops being a second implementation of a derivation
the client already performs; and the frontend gains a build step so that a cold start is a small
precompiled bundle instead of a CDN download and an in-browser compile.

## User Stories

Story numbers are stable once assigned. A story added after the first review takes the next free
number and stays in the section it belongs to, rather than renumbering the list, because the ADRs
cite these numbers.

### Browsing and cooking

1. As a Cook, I want to browse all my Recipes, so that I can decide what to make this week.
2. As a Cook, I want to search Recipes by name, so that I can find one I half-remember.
3. As a Cook, I want to filter Recipes by Recipe Type, so that I can look only at dinners when it's dinner I need.
4. As a Cook, I want to see the Recipe Ingredients for a Recipe with quantities and units, so that I know what a Recipe demands before committing to it.
5. As a Cook, I want to open a Recipe Card in a new tab, so that I can follow the actual instructions while cooking.
6. As a Cook, I want the app to load in well under a second on my phone, so that checking one thing in the kitchen doesn't feel like waiting.

### Shopping

7. As a Cook, I want to mark a Recipe as a Selected Recipe, so that its Ingredients appear on my Shopping List.
8. As a Cook, I want to deselect a Recipe, so that changing my mind removes its Ingredients from the list.
9. As a Cook, I want the Shopping List to consolidate the same Ingredient across several Selected Recipes into one entry, so that I don't walk past the onions twice.
10. As a Cook, I want quantities summed per unit rather than blindly added together, so that two cups and three hundred grams don't become a meaningless number.
11. As a Cook, I want to mark a Shopping List entry as Got It, so that I can track what's already in the trolley.
12. As a Cook, I want Got It marks to survive closing the app, so that I don't lose my progress switching to a text message.
13. As a Cook, I want to clear all Got It marks in one action, so that starting a new list doesn't hand me a list that's already ticked.
14. As a Cook, I want to see the Aisle for an Ingredient, so that I can shop in the order the store is laid out.
15. As a Cook, I want to set or correct the Aisle for an Ingredient, so that it's right the next time too.
16. As a Cook shopping with someone else, I want their Got It marks to appear on my phone within a few seconds without me navigating anywhere, so that we don't both buy the milk.
17. As a Cook, I want my own toggles to register instantly rather than after a round trip, so that ticking twelve items down an aisle isn't twelve waits.
18. As a Cook, I want a failed write to visibly revert rather than silently appear to have worked, so that I never trust a tick that didn't save.

### The Pantry and matching

19. As a Cook, I want to mark which Ingredients are in my Pantry, so that the app can tell me what I can cook.
20. As a Cook, I want to see Best Matches ranked with the fewest Missing Ingredients first, so that the top of the list is the shortest trip to the store.
21. As a Cook, I want to see exactly which Missing Ingredients a Recipe needs, so that I can judge whether it's worth a trip.
22. As a Cook, I want Recipes with nothing Missing called out clearly, so that I can see immediately what's cookable right now.
23. As a Cook, I want Recipes I have no Ingredients for excluded from Best Matches, so that the list isn't padded with everything I own.
24. As a Cook, I want Staples excluded from the Pantry checklist, so that I'm not ticking salt and water every week.
25. As a Cook, I want Staples never counted as Missing, so that a Recipe I can genuinely make doesn't show up as missing water.
26. As a Cook, I want to mark an Ingredient as a Staple, so that I can curate that list as I notice things.

### Managing content

27. As a Cook, I want to add a Recipe with its Recipe Ingredients from my phone, so that I can capture something the day I cook it.
28. As a Cook, I want to edit a Recipe's name, Recipe Type and Recipe Card, so that a typo takes ten seconds to fix rather than a database session.
29. As a Cook, I want to edit the quantity or unit of a Recipe Ingredient, so that I can correct a Recipe after cooking it once.
30. As a Cook, I want to add or remove a Recipe Ingredient on an existing Recipe, so that Recipes can evolve.
31. As a Cook, I want to delete a Recipe, so that things I'll never cook again stop cluttering the list.
32. As a Cook, I want deleting a Recipe to remove it from my Shopping List too, so that I'm not buying for a Recipe that no longer exists.
33. As a Cook, I want two spellings of the same food treated as one Ingredient, so that Aisle and Pantry state don't fragment across near-duplicates.
67. As a Cook, I want to add a Recipe by uploading a CSV or text file of its ingredient lines, so that I can capture a Recipe I already hold as a file without retyping it.
68. As a Cook, I want an uploaded file to fill in the Add form for me to check and correct before I save, so that a parser's guess never reaches my Recipes unreviewed.

Stories 67 and 68 describe behaviour the app offered before the migration. They were absent from
the first draft of this list, which is a gap in the record rather than a decision, and the
mechanics beneath them change with the write path while the interaction does not.

### Access

34. As a Cook, I want to reach the app from the grocery store, so that the list is available where I use it.
35. As a Cook, I want no login, so that shopping doesn't start with a password (ADR-0003).
36. As a Cook, I want the instance to be unreachable from the public internet, so that no login is a safe position to hold (ADR-0003).
37. As a Cook, I want both phones to see one shared Shopping List and one shared Pantry, so that we're working from the same state rather than two private copies.

### The Demo Variant

38. As a Demo Visitor, I want to land on an app already populated with Recipes, so that I can tell what it does without entering data.
39. As a Demo Visitor, I want the Seed to have enough Ingredient overlap between Recipes that Best Matches produces results, so that the feature demonstrates itself.
40. As a Demo Visitor, I want to tick Pantry items and immediately see Best Matches change, so that I understand the app's point in one interaction.
41. As a Demo Visitor, I want to add a Recipe and then delete it, so that I can see the full app rather than a read-only tour.
42. As a Demo Visitor, I want to be prevented from editing or deleting Protected seeded content, so that the demo still works for the next visitor.
43. As a Demo Visitor, I want to know I'm looking at a demo with fake data, so that I don't mistake it for someone's real kitchen.
44. As the Operator, I want the Demo Variant to be restored from the Seed on a schedule, so that accumulated visitor content clears itself without my involvement.
45. As the Operator, I want the Demo Variant to be structurally unable to reach personal data, so that data isolation is a property of the deployment rather than a promise.
46. As a Reviewer, I want to read the Terraform that produced the running demo, so that I can judge the infrastructure work and not just the app.
47. As a Reviewer, I want the demo link to work whenever I click it, so that evaluating the work doesn't depend on the author's availability.

### Guardrails

48. As the Operator, I want Recipe Card URLs restricted to `https:`, so that a stranger cannot store a `javascript:` URL that fires against the next visitor.
49. As the Operator, I want every user-supplied field length-capped and validated against an allowlist where one applies, so that free text cannot become arbitrary payload.
50. As the Operator, I want a hard ceiling on total Recipes and on Recipe Ingredients per Recipe, so that no visitor can grow my bill by scripting inserts (ADR-0001).
51. As the Operator, I want per-IP rate limiting on writes, so that scripted abuse is slowed without my intervention.
52. As the Operator, I want a request body size limit, so that a large payload cannot consume the service.
53. As the Operator, I want every query parameterized and the application's database role stripped of ownership and DDL rights, so that injection has no reachable consequence.
54. As the Operator, I want an AWS budget alarm, so that abuse or a misconfiguration reaches me before it reaches my statement (ADR-0001).
55. As the Operator, I want CORS restricted to the demo's own origin, so that the API isn't a free backend for other sites.
56. As the Operator, I want the same guardrails active on the Homelab Variant, so that there is one code path to reason about rather than two (ADR-0002).

### Operating it

57. As the Operator, I want to bring up the whole Homelab Variant with one Compose command, so that rebuilding after a host change is uneventful.
58. As the Operator, I want an unattended nightly database dump with dated retention, so that recovery does not depend on my remembering anything.
59. As the Operator, I want dumps copied off the homelab, so that a dead disk is not a total loss.
60. As the Operator, I want an alert when a dump is missing or zero bytes, so that a silently broken backup cannot masquerade as a working one.
61. As the Operator, I want roughly a month of retained dumps, so that corruption discovered late is still recoverable from before it.
62. As the Operator, I want to review a diff and approve before anything is exported back to the spreadsheet, so that the export stays a readable copy I trust rather than a mirror of whatever just happened.
63. As the Operator, I want the same container image running in both Variants, so that "works on the homelab" implies "works in the demo" (ADR-0002).
64. As the Operator, I want the Seed applied by the same image with a different command, so that there is no second artifact to keep in step.
65. As the Operator, I want to run the migration into the real database, inspect row counts and a sample of Recipes, and only then repoint the frontend, so that a bad extract costs a truncate rather than a weekend.
66. As the Operator, I want the spreadsheet left intact through cutover, so that truncate-and-rerun is always available.

## Implementation Decisions

Rationale is included deliberately: this spec doubles as the record for a design review.

### An API tier is forced, and it is hand-written

Postgres has no public read API and no browser-safe credential model. Sheets worked only because
it had both. The shape therefore becomes static bundle plus API plus Postgres. That tier is where
the match rule, the guardrails and the Variant boundary all end up living.

The API is hand-written on Node with Fastify. There are roughly ten endpoints; this is a small
service, not a platform.

- **PostgREST was rejected** because it makes the schema the public API contract and pushes access
  control into row-level security, which is a larger concept than this app needs.
- **Self-hosted Supabase was rejected** because it is a nine-container stack whose reproduction in
  Terraform would dominate the demo rather than showcase it.
- **Next.js was rejected** because replacing the frontend is a rewrite, not a migration.
- **Python and Go were rejected** because the frontend build already puts Node in this repo. One
  toolchain, and the validation schema can be a single module imported by both the API and the
  client forms, so server guardrails and form validation cannot drift apart.

Fastify over Express specifically for built-in schema validation and a maintained rate-limit
plugin, both of which are now requirements rather than conveniences.

### The frontend and API share an origin in both Variants

On the Homelab Variant the API process also serves the static bundle, behind `tailscale serve`,
which terminates TLS with a real certificate on a `ts.net` name. On the Demo Variant CloudFront is
the single origin and routes by path: the bundle from object storage, `/api/*` to the service.

This is not a preference. GitHub Pages serves over HTTPS, and an HTTPS page cannot call a
plain-HTTP API on a private address — mixed content is blocked before CORS is consulted. Publishing
a private hostname in a public page would also be required. Same-origin removes the problem
entirely and has a second benefit: the frontend calls relative paths, so it needs no per-Variant
configuration at all. **GitHub Pages hosting ends for the personal instance.**

### The frontend gets a build step

JSX is compiled ahead of time and React is bundled locally, producing a static bundle consumed by
both Variants. Today a cold start fetches roughly three megabytes from a public CDN and compiles
the app in the browser.

Beyond latency, the CDN dependency is incoherent with the rest of the design: a VPN-only app that
cannot start without reaching the public internet. Vendoring the libraries without a bundler was
considered and rejected as half the benefit — it fixes the third-party dependency but leaves the
in-browser compile in place.

### The Variant seam (ADR-0002)

No `MODE` variable, no `isDemo` check, no build-time variant flag. The application reads
configuration values and behaves identically everywhere. Consequences that follow:

- Validation, sanitization and rate limiting are unconditional. They cost the Homelab Variant
  nothing, since there is no value in storing a `javascript:` URL there either.
- Anything genuinely one-sided is a separate service or a configuration value, never a branch. The
  Seed restore is a scheduled task, not an endpoint. A banner is configured text, not a mode check.
- Protected is a column the Homelab Variant never sets, so it is inert there rather than
  conditional.

### Schema

Entities, with the derived/stored split made explicit. Two of the four spreadsheet tabs were never
storage.

| Entity | Nature | Notes |
| --- | --- | --- |
| Recipe | stored | name, Recipe Type, Recipe Card URL, Selected Recipe flag, Protected flag, timestamps |
| Ingredient | stored | canonical name, Staple flag, Aisle, Got It flag, Pantry membership, timestamps |
| Recipe Ingredient | stored | Recipe reference, Ingredient reference, quantity, unit |
| Shopping List | **derived** | per-Ingredient rollup over Selected Recipes, joined to the Ingredient's Got It and Aisle |
| Best Match | **derived** | per-Recipe count and list of Missing Ingredients, ranked |

**Ingredient becomes first-class, with an identity.** Today it is a free-text string compared by
lowercasing and trimming, which means two spellings of one food are two Ingredients, and Aisle and
Pantry state fragment across them. Making it a row is what allows matching to be a set operation
and the Pantry checklist to be a straightforward selection rather than a formula-generated column.
The cost is real and lands on the migration: existing names must be deduplicated, and that will
surface genuine mess.

A free-text column with a normalized key was considered as a middle path and rejected — renaming
still splits state unless handled explicitly, which is the defect being fixed.

**Got It and Pantry membership are properties of an Ingredient**, not of a Shopping List row. This
is what makes the Shopping List derivable without losing user state.

**Quantity becomes numeric and nullable.** Null means unquantified — "to taste". The current code
already coerces with `parseFloat(...) || 0`, so free text like "a pinch" already sums as zero;
nullable numeric makes that explicit and lets the migration flag unparseable values for review
rather than silently zeroing them.

### The Shopping List derivation, and a defect it fixes

One entry per Ingredient, with quantities summed **within each unit** and presented as a set of
amount-and-unit pairs. Got It and Aisle stay per Ingredient, so the entry stays one row in the UI.

This corrects an existing bug. The current implementation groups by Ingredient name alone and keeps
the first unit it encounters, so two cups plus three hundred grams renders as a single number with
one of the two units attached. Keying the sum by unit while keeping the entry keyed by Ingredient
fixes the arithmetic without complicating Got It.

The derivation is computed on read. It is currently implemented twice — once in a spreadsheet
formula and once client-side — which means the two can disagree. After this change there is one
implementation, in SQL, and the client-side one is deleted.

### The match rule

Defined fresh rather than recovered. The spreadsheet formulas were never in the repository and are
no longer needed.

Rank candidate Recipes by the absolute count of Missing Ingredients, ascending. Quantity-blind:
the Pantry is membership only, so an Ingredient is present or absent, never "enough". Exclude
Staples from the Missing calculation entirely. Exclude Recipes with zero Pantry overlap. Cap the
returned list.

Absolute count rather than percentage complete, because the question the feature answers is "how
short is the trip to the store", and one missing item is one stop whether the Recipe has four
Ingredients or fourteen.

Missing Ingredients is returned as a list of names. The current magic string sentinel
`"Nothing Missing"` is replaced by an empty list.

### Got It has a lifecycle

A single action clears every Got It mark. Today they never reset: the client deliberately carries
the previous mark forward for any Ingredient whose name matches, and the spreadsheet persists it
indefinitely, so overlapping Ingredients arrive pre-ticked on subsequent trips and get walked past.

A Shopping Trip entity was considered — it would give purchase history for free — and rejected as a
new entity and lifecycle for a feature nobody asked for. Auto-clearing on any change to Selected
Recipes was rejected because adding a forgotten Recipe mid-trip would wipe ticks accumulated in the
store, which is worse than the bug.

### Freshness

The API exposes a cheap version endpoint returning the maximum update timestamp across mutable
state. The client polls it on a short interval, but only while the document is visible and only on
the views where staleness matters, and refetches real data only when the value changes. Unchanged
polls cost a few bytes and a backgrounded phone costs nothing.

There are no write conflicts to resolve. Every write targets an independent field, so last-write-wins
is correct here rather than a compromise. The problem is purely stale reads.

Server-sent events and websockets were both rejected. Beyond being more than boolean toggles
require, a long-lived connection per visitor is server-side state that an anonymous visitor can
hold open on the public instance, which is precisely the shape of thing the guardrails exist to
avoid.

### API contract

Reads collapse to a single request that returns everything needed for first paint, replacing four
parallel spreadsheet calls. Writes are narrow, field-level endpoints: create, update and delete a
Recipe; toggle Selected Recipe; set Got It and Aisle on an Ingredient; toggle Pantry membership;
toggle Staple; clear all Got It marks. Plus the version endpoint.

There are no Demo-only endpoints. The Seed restore is a scheduled task running the same image with
a different command.

### Guardrails (ADR-0001)

Parameterized queries only, never string-built SQL. A least-privileged database role with no
ownership and no DDL rights. An `https:`-only scheme allowlist on Recipe Card URLs. Length caps and
allowlist validation on every user-supplied field, with the Recipe Type allowlist drawn from the
known set. Numeric range validation on quantity. A request body size limit. Per-IP write rate
limiting. Absolute row caps on total Recipes and on Recipe Ingredients per Recipe. CORS pinned to
the demo origin. An AWS budget alarm plus hard ceilings on task count and database storage.

No web application firewall — rejected on recurring cost rather than merit, and recorded in ADR-0001
as worth revisiting.

The stored-XSS vector is specific and currently live: the Recipe Card URL is free text, stored
without validation, and rendered directly into an anchor's `href`. React escapes text content by
default, which is why the name and type fields are safe; `href` is the exception it does not cover.

### Authentication (ADR-0003)

None. The Homelab Variant is reachable only over Tailscale and network membership is the entire
authorization model. The Demo Variant is deliberately open and holds only Seed data.

### Backups

An unattended dump on a nightly schedule, dated retention of roughly a month, a copy held off the
homelab, and an alert when a dump is missing or zero bytes. No human in the loop.

Retention rather than review is what protects against corruption: a bad write does not destroy
anything if a copy from before it is still held. This matters because Google Sheets has been
providing offsite versioned history for free, and a single container volume is a strict regression
against that.

Separately, an approval-gated export back to the spreadsheet is retained as a phone-readable copy.
It is explicitly **not** the backup — recovery point would equal the last approval, and the target
is lossy now that the schema has identities and foreign keys.

### Deployment

**Homelab Variant.** Docker Compose on the existing host — API and Postgres, a named volume, no
host path assumptions so the file lifts into a virtual machine later unchanged. Reachable through
the existing Tailscale setup. A Proxmox rebuild was considered and rejected: it replaces the host
operating system, takes down an unrelated service already running there, and does nothing for two
containers.

**Demo Variant.** Always-on. CloudFront in front of object storage for the bundle, a serverless or
container-based API service, and a small single-availability-zone RDS Postgres instance, all in
Terraform, plus a scheduled task that restores the Seed. Always-on rather than applied on demand,
because a reviewer clicks the link without warning and a dead link reads worse than no link. The
database is the entire recurring cost. **All figures discussed were estimates and must be verified
in the AWS pricing calculator before committing.**

### Seed

A hand-written fixture of fake Recipes, loaded by a script that validates through the same module
the API uses, so the Seed proves the guardrails accept legitimate data. The scheduled restore runs
the same image with a different command — no second artifact, no separate database client.

Content is written deliberately rather than generated: enough Recipes to cover the Recipe Type
range, and heavy Ingredient overlap so Best Matches produces interesting results on a visitor's
first interaction. Generated names read as nonsense, which undercuts showing off an app built for
someone. An anonymized export of real data was rejected outright — it puts the one hard requirement
in the hands of a scrubbing script.

Seeded Recipes are marked Protected.

### Cutover

Hard cut, no separate rehearsal database. This is safe because the extract reads the spreadsheet
and writes an empty target, so a bad run is a truncate and a rerun rather than data loss, giving
effectively unlimited rehearsals in place.

Two conditions make it safe and are not optional: the spreadsheet is left intact, and the frontend
is not repointed until row counts and a sample of Recipes have been inspected.

## Testing Decisions

**One seam: HTTP requests against the running API, backed by a real Postgres.**

Nothing is mocked. Tests exercise the service the way a client does — send a request, assert on the
response and on what subsequent requests report. No test reaches into query builders, validation
modules or internal functions directly, so internals can be restructured freely without touching
tests.

A real database is not negotiable here. Both derivations become SQL, so a mocked or in-memory
substitute would test nothing that matters. Provision it as a throwaway container per run, or as a
service in the CI job.

**There is no prior art.** This repository has no tests and no test tooling today, so this seam is
also the convention being established. The tooling that implements it is settled in
[ADR-0005](../adr/0005-http-tests-against-real-postgres.md): `node:test`, Fastify's `inject`, and a
throwaway Postgres container per run whose fixture applies migrations as the owner role and connects
the application as the restricted one.

What a good test looks like in this codebase: it describes externally observable behaviour in the
vocabulary of `CONTEXT.md`, arranges state through the API rather than by writing rows directly, and
would still pass after an internal refactor that preserved behaviour. A test that breaks when a
function is renamed is testing the wrong thing.

Covered through this seam:

- Shopping List derivation: consolidation across Selected Recipes, summing within units, the
  amount-and-unit pairs, Got It and Aisle surviving recomputation, deselecting a Recipe removing its
  contribution, deleting a Recipe removing it from the list.
- Best Match ranking: ordering by ascending Missing count, Staples never counted Missing, zero-overlap
  Recipes excluded, the empty Missing list for a fully satisfied Recipe, the cap.
- Clear-all-Got-It: every mark cleared, nothing else disturbed.
- Ingredient identity: two Recipes referencing the same Ingredient share Pantry and Aisle state.
- Guardrails, each asserted at the boundary: non-`https` Recipe Card URLs rejected, over-length
  fields rejected, unknown Recipe Type rejected, out-of-range quantity rejected, oversized bodies
  rejected, row caps enforced at the limit, rate limiting engaging, CORS headers.
- Protected rows refusing edit and delete while unprotected rows accept both.
- The version endpoint advancing on write and holding steady otherwise.
- Seed script and restore: a restored database contains exactly the Seed with Protected set.

Explicitly not tested: the frontend, which becomes presentational once the derivation moves to SQL
and has no tests today; and the Terraform, beyond whatever validation runs in CI.

## Out of Scope

- **The extract-and-load script.** The Operator writes this. This spec defines the target schema and
  the shape of what lands; it does not define the extract.
- **Offline support.** The build step removes the CDN dependency that currently makes offline
  impossible, but a pending-mutation queue and a service worker are separate work. Nothing here
  depends on them.
- **Web application firewall.** Rejected on cost, recorded in ADR-0001.
- **Per-user accounts and per-user state.** Rejected as a domain change, recorded in ADR-0003.
- **A Shopping Trip entity and purchase history.**
- **A database administration container.** In-app edit and delete were chosen instead. Adding one
  later is a small change to the Compose file.
- **A Proxmox migration.** Separate work if wanted at all.
- **A security review of the finished implementation.** The guardrails above are requirements, not a
  substitute for reviewing the code that implements them.
- **Retiring the spreadsheet.** It survives cutover as an approval-gated export target and a cold
  copy.

## Further Notes

**Open items, none blocking.** Whether the API runs as a serverless function or a container task;
the demo's domain name and DNS; the pipeline that builds the image and publishes the bundle. All
can be settled during planning.

**One judgement call made without asking**, flagged here for the review: unit stays free text with a
length cap and validation against a permissive allowlist rather than becoming a strict enumeration.
Recipes in the wild use inconsistent units and a strict enumeration would fail the migration on real
data. If the review prefers a strict set, the Shopping List summing is unaffected — it groups by
whatever unit strings exist.

**Live issue independent of this work.** The spreadsheet id is committed in the repository, and the
setup instructions direct the user to share the spreadsheet with anyone holding the link. If the
repository is public, the personal data is readable by anyone who finds it — not only through the
API but through the spreadsheet's own CSV export endpoint, which requires no key. Repository
visibility was not confirmed; the GitHub CLI is not installed on this machine. Worth checking
independently of the migration, though the migration resolves it as a side effect provided the new
connection string is never committed.

**A note for the review session on process.** The two-Variant and hosting decisions did not land
while they were being discussed in prose. They landed after an interactive architecture diagram
made the mixed-content failure and the CDN-inside-the-tailnet problem visible at once. That
explorer was written to a scratch directory rather than the repository; regenerating it is cheap if
the review would benefit from walking the same path.
