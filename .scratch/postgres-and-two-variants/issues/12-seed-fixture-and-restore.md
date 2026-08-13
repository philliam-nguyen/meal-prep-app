# 12 - Seed fixture and the restore command

Status: ready-for-agent

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

- [ ] Loading the Seed into an empty database produces a browsable app with Recipes across the Recipe Type range
- [ ] Ticking a handful of Pantry Ingredients yields a non-trivial ranked Best Match list
- [ ] Every seeded Recipe validates through the API's own module; a fixture that HTTP would refuse fails the load
- [ ] Seeded Recipes are Protected and refuse edit and delete
- [ ] A restore over a dirty database leaves exactly the Seed, proven by a test
- [ ] The restore is the same image invoked with a different command
