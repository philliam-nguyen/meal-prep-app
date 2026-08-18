# 12 - Seed fixture and the restore command

Status: done

**What to build:** A visitor lands on a populated app, ticks a few Pantry Ingredients, and sees Best
Matches produce something worth looking at on the first interaction. That is the whole point of the
app demonstrated in one gesture.

The Seed is a hand-written fixture: enough Recipes to cover the Recipe Type range, with heavy
Ingredient overlap between them so ranking has something to rank. Loaded by a script that validates
through the same module the API uses, so the Seed doubles as proof that the guardrails accept
legitimate data.

Content is written by hand rather than generated, because generated names read as nonsense and
undercut showing off an app built for someone. An anonymized export of real data is not an option: it
puts the one hard isolation requirement in the hands of a scrubbing script.

Seeded Recipes carry Protected, which ticket 09 already enforces.

The scheduled restore runs the same container image with a different command. No second artifact and
no separate database client to keep in step.

**Blocked by:** 05 (the validation module the loader goes through), 09 (Protected enforcement, which
is what makes the flag mean anything).

- [x] Loading the Seed into an empty database produces a browsable app with Recipes across the Recipe Type range
- [x] Ticking a handful of Pantry Ingredients yields a non-trivial ranked Best Match list
- [x] Every seeded Recipe validates through the API's own module; a fixture that HTTP would refuse fails the load
- [x] Seeded Recipes are Protected and refuse edit and delete
- [x] A restore over a dirty database leaves exactly the Seed, proven by a test
- [x] The restore is the same image invoked with a different command

## Comments

**The loader is a client of its own API.** `restoreSeed` builds the app in-process and sends the
fixture in through Fastify's `inject`: every Recipe by `POST /api/recipes`, every Staple, Aisle and
Selected Recipe by the route a visitor's own click uses. That was the operator's call between this
and extracting a write function from `recipes.js`, and `docs/adr/0007-seed-loads-through-the-api.md`
records why. The short version: the rules a Recipe meets are not only the shared schema. The write
path also refuses a Recipe naming one food twice, resolves two spellings to one Ingredient, and
enforces the Recipe cap and the Ingredient ceiling. A loader calling past those would re-implement
them or skip them, and "a fixture that HTTP would refuse fails the load" would be a resemblance
rather than a fact.

One write is not a request: `update recipes set protected = true`. Protected has no endpoint by
design, and it runs last so the loader is not relying on which routes happen not to consult the flag.

**Guardrails come from the environment, with one exception.** `readSeedConfig` reads the same
variables the server reads, so a fixture holding more Recipes than the deployment's `RECIPES_MAX`
fails the restore instead of the first visitor's write. The write rate limit is overridden: it bounds
how fast one address may write, which says nothing about whether the Seed is legitimate data, and a
fixture larger than a minute's worth of writes would otherwise refuse its own restore. `CORS_ORIGIN`
gets a placeholder, since injected requests carry no `Origin` and nothing consults it.

**The fixture.** 19 Recipes covering all 8 Recipe Types, 43 Ingredients, 7 of them Staples, every one
shelved into an Aisle. Overlap is the point: butter in 8 Recipes, onion, double cream, plain flour
and olive oil in 6 each. Ticking onion, garlic, carrot, potato and chicken stock ranks 9 Recipes
across three depths of Missing, which is what the Best Match test holds. Recipe Card URLs point at
`recipes.example.com`, reserved for exactly this, because a plausible URL to a site that never held
these Recipes is a broken link in a demo.

**Three things the checklist did not ask for, on the operator's call.** The fixture also carries
Staples, Aisles and two Selected Recipes, so a visitor lands on a Shopping List with entries in it,
sorted into store sections, and on a Best Match list that does not tell them they are short of salt.
The Pantry starts empty, because ticking it is the visitor's first gesture. The two Selected Recipes
share leek, so the list shows 700g in one entry rather than 300g and 400g in two.

**The loader refuses an Ingredient with no Aisle.** An Aisle is only visible once something puts the
Ingredient on a Shopping List, so a food the fixture forgot to shelve would go unnoticed until a
visitor selected the one Recipe calling for it. Water was exactly that case and is now shelved.

**The restore is `node packages/api/src/seed.js`.** One variable, `SEED_DATABASE_URL`, and it must be
the owner role because the restore truncates and the API's role deliberately cannot. `compose.yaml`
is untouched on purpose: a `seed` service behind a profile would put a command that empties the real
collection into the Homelab Variant's own file, with the profile as the only thing between it and a
typo. Ticket 15 schedules the task. A test runs the command as a child process from the repository
root, which is what the image's WORKDIR holds.

Nothing here runs the command inside a built image, so checklist item 6 is verified by proxy: image
builds wait on ticket 13. What the suite can catch is the way the command stops being in the image at
all, so one test holds the entrypoint inside the directory the runtime stage copies and checks
`.dockerignore` does not drop it on the way in. Running it for real belongs to 13.

**ADR-0005's bounded exception is closed.** `test/helpers/flags.js` is gone. The Protected
assertions left `edit-delete-recipe.test.js` and now live in `seed.test.js` against seeded Recipes,
because a Protected Recipe is something the Seed produces rather than something an edit test can
arrange. `browse-recipes.test.js` keeps the other half: a Recipe a cook added reports itself
unprotected. The ADR's Consequences section records both.

**Known gap: a refused fixture leaves a partly loaded database.** The truncate happens first and each
POST commits on its own, so a fixture the API argues with fails partway. Tolerable because the
fixture ships in the image and the suite loads it, so it fails in CI long before it reaches a
deployment, and the next scheduled run repairs it. Making the whole load one transaction would mean
handing the app a single client and defeating the `begin` the write path already issues.

**Left alone, for ticket 09's owner.** ADR-0005 says `test/version.test.js` holds "the last raw
statement in the suite, a `delete from recipes`, because ticket 09 has not shipped a delete endpoint
to send instead; it goes when 09 lands". Ticket 09 has landed and the statement is still there at
`version.test.js:69`.

**No frontend work.** `RecipeDetail.jsx` already hides the edit and delete controls for a Protected
Recipe, which ticket 09 built. Nothing else in the frontend needs to know the Seed exists.

**2026-08-17: the restore is scheduled on the homelab, not by ticket 15.** The comment above says
"Ticket 15 schedules the task", which assumed an EventBridge rule against a Fargate task. The Demo
Variant's backend now runs on the homelab
([ADR-0008](../../../docs/adr/0008-demo-backend-on-the-homelab.md)), so the schedule is a systemd
timer on that host calling `node packages/api/src/seed.js` every six hours, with
`SEED_DATABASE_URL` pointing at the *demo* stack's Postgres and holding its owner role. The timer
needs owner credentials, which the API container deliberately does not carry, so it runs as its own
unit rather than inside the API service.

Two things carry forward unchanged and matter more now. The restore builds the app in-process
through `inject`, so it needs Postgres up but not an API server; a timer firing while the demo is
otherwise unreachable still works. And the known gap above, that a refused fixture leaves a partly
loaded database repaired by the next run, now has a six-hour repair window rather than whatever
ticket 15 would have chosen.

[ADR-0010](../../../docs/adr/0010-demo-guardrails-on-shared-hardware.md) lists this timer among
security controls rather than housekeeping, because the truncate clears what an attacker stored as
well as what a visitor did. Its interval is a security parameter.

This ticket stays `done`. Nothing built here changed; only who schedules it.

**What the review changed.** The fixture's header comment claimed overlap counts that were wrong
(onion in seven Recipes, double cream in five; both are six), written from the design sketch and
never checked against the fixture that got built. `createPool` took the API's `application_name` as a
constant, so the restore's owner-role connections were showing up in `pg_stat_activity` as
`meal-prep-api`; it takes a name now and the restore calls itself `meal-prep-seed`, the way
`migrate.js` already named itself. `emptyDatabase` was a verbatim copy of the test fixture's
`truncateAllTables`, which is two definitions of "domain table" that agree until they do not, so the
production function is exported and the fixture calls it. The rest was naming and repetition in the
new tests.
