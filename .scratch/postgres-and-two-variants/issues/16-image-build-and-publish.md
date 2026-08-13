# 16 - Image build and bundle publish pipeline

Status: ready-for-agent

**What to build:** A push produces the container image and publishes the frontend bundle, so the demo
tracks the branch without the Operator running commands by hand. One pipeline produces the single
image both Variants run, which is what makes "works on the homelab" imply "works in the demo"
(ADR-0002).

The spec left this an open item to settle during planning. It is settled here.

**Blocked by:** 15 (the registry and object storage the pipeline publishes to).

- [ ] A push builds the container image and publishes it where both Variants can pull it
- [ ] The same commit produces the bundle published to the demo's object storage
- [ ] The image carries a tag traceable back to its commit
- [ ] Migrations run against the demo database as part of a deploy, or through a documented step
- [ ] Tests run in the pipeline against a real Postgres, and a failure blocks publish
- [ ] No credential appears in the repository or in pipeline logs
