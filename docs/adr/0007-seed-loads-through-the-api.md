---
status: accepted
date: 2026-08-15
---

# The Seed loads through the API's own HTTP surface, not through SQL

The restore command empties the database and then sends the fixture back in as HTTP requests
against the API it ships with, through Fastify's `inject` rather than a socket. Every seeded Recipe
arrives by `POST /api/recipes`, every Staple by `PUT /api/ingredients/:id/staple`, every Pantry tick
by `PUT /api/ingredients/:id/pantry`, every Aisle and every Selected Recipe by the route a visitor's
own click uses. One statement in the loader is not a request: `update recipes set protected = true`,
because no endpoint sets that flag and none should.

The spec asks the Seed to validate through the same module the API uses, so that the fixture doubles
as proof that the guardrails accept legitimate data. Writing the rows any other way would have made
that a resemblance rather than a fact. The rules a Recipe meets are not only the shared JSON Schema:
the write path also refuses a Recipe that names one food twice, resolves two spellings of a food to
one Ingredient, and enforces the Recipe cap and the Ingredient ceiling. A loader that called past
those would either re-implement them or skip them, and both are the drift
[0005](./0005-http-tests-against-real-postgres.md) exists to prevent.

## Considered options

**Export a write function from `recipes.js` and call it directly.** The loader would compile the
shared schema with ajv and hand the normalized Recipe to a function the route handler also calls.
Rejected because the seam lands in the wrong place: the duplicate-food check and the Ingredient
upsert would have to move into the exported function, the row caps sit further out in the handler
and would move or be skipped, and every later rule added to the request path is a decision about
whether the Seed is held to it. It also adds `ajv` as a direct dependency, which today arrives
through Fastify.

**Insert the rows with SQL and validate the fixture with ajv.** Rejected harder, for the same reason
with none of the mitigation. It is a second write path with a second set of rules.

**Load over a real socket against a running API.** Rejected because the restore cannot be done
entirely through the public surface. Emptying the database needs `TRUNCATE`, which the API's role
deliberately does not hold, and Protected has no endpoint by design.

## Consequences

The restore process needs a guardrails object, which it reads from the same environment variables
the API reads, so a fixture holding more Recipes than the deployment's `RECIPES_MAX` fails the
restore rather than the first visitor's write.

One guardrail is overridden rather than read: the write rate limit. It bounds how fast one address
may write, which says nothing about whether the Seed is legitimate data, and a fixture with more
Recipes than a visitor may write in a window would otherwise refuse its own restore.

`CORS_ORIGIN` has no default and the restore supplies its own placeholder. Its requests are injected
and carry no `Origin`, which is the header the origin hook and the CORS plugin both decide on, so
the value is never consulted and asking an operator for one would be asking for a fiction.

Anything the Seed sets needs an endpoint, or it needs a deliberate direct statement with a reason
written down. Protected is the only one today.

A fixture the API refuses fails partway, after the truncate, leaving a partly loaded database that
the next scheduled run repairs. This is tolerable because the fixture ships in the image and the
suite loads it: a fixture the API would refuse fails the tests long before it reaches a deployment.

The restore connects as the owner role, since it truncates. That makes it the second command after
the migration step to hold owner credentials, and the only one that writes domain rows with them.
