# 15 - Demo Variant Terraform

Status: ready-for-human

**What to build:** The AWS half of the Demo Variant, as Terraform a Reviewer can read to judge the
infrastructure work and not only the app. A Reviewer clicks the link at any hour and gets the app
populated with Seed data; a visitor ticks Pantry items, adds a Recipe and deletes it again, while
Protected seeded content stays intact for whoever arrives next.

The backend is not in AWS. [ADR-0008](../../../docs/adr/0008-demo-backend-on-the-homelab.md) puts the
API and its Postgres on the homelab, in a Compose project of their own, reached over Tailscale. This
ticket builds what sits in front of that.

**Where it lives.** `infra/stacks/recipe/` in the developer site repository, not here, per that
repo's ADR-0003 topology. It reads `zone_id`, `domain_name`, `certificate_arn` and
`oidc_provider_arn` from the platform stack through `terraform_remote_state` rather than declaring
copies. The hostname is `meal-prep.phillip-nguyen.dev`.

**What the stack contains:**

- An S3 bucket for the frontend bundle, with origin access control
- A CloudFront distribution: the default behaviour serves the bundle, an `/api/*` behaviour reaches
  the proxy instance. One origin from the browser's point of view, so the frontend keeps relative
  paths
- A `t4g.nano` instance in a public subnet, joined to the tailnet, reverse-proxying to the homelab
- A security group admitting CloudFront and nothing else, with no inbound SSH; the instance is
  managed over Tailscale SSH
- A Route 53 record in the existing zone
- A deploy role for the bundle, trusting the existing OIDC provider, scoped to one repository and
  one branch

**What it does not contain, and why.** No RDS and no Fargate: the backend is elsewhere. No ACM
certificate: the platform stack already issues one covering the apex and `*.phillip-nguyen.dev`, and
it is `ISSUED`. No Budgets alarm: `monthly-total` already exists account-wide, though its $5 limit
wants revisiting against the new figure. No ECR: the image goes to a public GitHub Container Registry
repository so the homelab needs no AWS credential (ticket 16). No NAT Gateway: the instance sits in a
public subnet, because NAT would cost more than the rest of the design combined.

**Cost.** $7.36 a month, verified against the AWS Price List on 2026-08-17 and recorded in
[research 0002](../../../docs/research/0002-cloudfront-ec2-tailscale-ingress.md). The public IPv4
address costs more than the instance. Confirm before applying; the figure is only as current as its
retrieval date.

**Two settings that are not optional.** CloudFront's `connection_attempts` and `connection_timeout`
come down from their defaults, and the reverse proxy's upstream timeouts go to two or three seconds.
At the defaults a dead origin costs a browser up to thirty seconds before a 502, which means the
degraded mode in ticket 22 never gets seen and a Reviewer reads the demo as broken. The defaults
actively defeat the feature.

**Watch the availability zone.** `us-east-1` excludes `use1-az3` from VPC origins.

**Human-only.** This is the infrastructure the Operator is doing this project to learn. Not to be
dispatched to an agent, matching the developer site's curriculum.

**Blocked by:** 20, resolved and cashed in; the stack is applied and the VPC origin works. The four
verification boxes that remain are blocked by 27 (the Demo Variant's Compose stack, which nothing
built) and by 16 (the bundle in the bucket).

- [ ] `terraform apply` from empty produces a reachable demo, and the Terraform reads well as a
      portfolio artifact
- [ ] One origin serves both the bundle and `/api/*`
- [ ] The stack consumes platform outputs rather than declaring its own zone, certificate or OIDC
      provider
- [ ] The instance reaches the homelab over the tailnet, and accepts inbound from CloudFront only
- [ ] No inbound SSH; the instance is managed over Tailscale SSH
- [x] CloudFront and the proxy carry the shortened timeouts, proven by timing a request with the
      homelab stack stopped (2026-08-18: three fresh-cache requests through the real distribution
      answered 504 in 2.20-2.28s, `Server: nginx`, against an unreachable upstream, which is the
      homelab-stopped state; the defaults would have cost ~30s)
- [ ] The reverse proxy appends to `X-Forwarded-For` rather than replacing it, proven by one request
      through the real chain showing the app saw the caller's address and not CloudFront's. Ticket 23
      set `TRUST_PROXY=2` on that assumption and could not test it: the header its suite sees is the
      header its suite wrote, so no in-process test can observe a proxy nobody has built. Get this
      wrong and every visitor on earth shares one rate-limit bucket while the limiter reports success
- [ ] Nothing in the demo's configuration can reach the homelab database
- [ ] Pricing verified in the calculator and recorded before apply
- [x] The $5 account budget is revisited against the real figure ($15 applied to `monthly-total`
      2026-08-17, per ADR-0003's amendment; verified in Budgets before the recipe stack)

## Comments

**The domain is settled and the zone already exists.** `phillip-nguyen.dev` is registered and hosted
in Route 53. The Terraform writes records into that zone rather than creating it, so the zone is a
data source and not a managed resource, and destroying this stack must not take the zone with it. The
CloudFront certificate has to be issued in `us-east-1` whatever region the rest of the stack lands
in.

**The runtime decision is held, not made.** The Operator is pricing the two options first. Three
things the pricing work should carry with it, none of them cost figures:

ADR-0002 puts the seam between the Variants in infrastructure and keeps it out of application code. A
Fastify handler adapter exists for one Variant only, which is the shape that ADR rejects. This
ticket also asks for the same container image as the Homelab Variant, and a Lambda container image
starts at the Runtime Interface Client rather than `node packages/api/src/server.js`, so the image
either forks or grows a second entrypoint. A container task runs `server.js` untouched, the way
ticket 03 assumed.

A container task needs something in front of it that CloudFront can name. An ALB carries a standing
monthly charge; an API Gateway HTTP API with a VPC Link is cheaper at the traffic a demo sees. Price
the pair, because the fronting cost is most of the gap between the two options.

Lambda against RDS opens a connection per concurrent execution, which is what RDS Proxy exists to
fix, at roughly what Lambda saved. Price Lambda and the Proxy together or the comparison flatters
Lambda.

Whichever option wins, it wants an ADR: it fixes what ticket 16 publishes and what ticket 17 cuts
over into. Once it lands, this ticket becomes `ready-for-human`; the Operator may write the Terraform
rather than hand it to an agent.

**The banner does not exist yet, and it is not Terraform.** Nothing in `packages/` mentions one.
ADR-0002 makes it configured text rather than a mode check, so it is an API config value plus a
frontend that renders the value when it is set, and only then a Terraform variable supplying the
text. Whoever takes this ticket builds both halves, or splits the app half into its own ticket.

**Nothing was applied and no credentials were present.** `aws sts get-caller-identity` returned
`NoCredentials` on the machine that opened this ticket. Terraform 1.15.8 and aws-cli 2.36.17 are
installed there.

**2026-08-17: the design changed and most of the above is superseded.** The container-versus-
serverless question is void: neither runs. Research priced the cheapest AWS shape at $28.49 a month
against a $5 account budget, and the decision was to run the backend on the homelab instead, at
$7.36 for the AWS half. See [ADR-0008](../../../docs/adr/0008-demo-backend-on-the-homelab.md), and
[ADR-0010](../../../docs/adr/0010-demo-guardrails-on-shared-hardware.md) for what that does to the
threat model.

Specifically superseded above: the runtime comment in full, including its ALB and VPC Link pricing
advice; the assumption that this ticket creates a certificate, a Budgets alarm or an ECR repository,
all of which either already exist or are no longer used; and the ticket's original claim that the
Demo Variant would be *structurally* unable to reach personal data. That claim is withdrawn. Both
Variants now share a kernel, a Docker daemon and a filesystem, so the honest statement is that the
Demo Variant is unable to reach personal data as configured. ADR-0010 records the containment and
what is being accepted.

The banner comment still stands, and the app half is now ticket 24.

**2026-08-17: three build decisions, settled before the stack was written.**

*The reverse proxy is nginx.* It is in the AL2023 repositories, so the same `dnf update` that
patches the OS patches the proxy; Caddy would need its own patching story. Its append idiom,
`proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;`, is the canonical one and reads
instantly to a Reviewer. Caddy was rejected because its automatic TLS is dead weight on an
`http-only` origin, and because it strips `X-Forwarded-For` by default unless `trusted_proxies`
is set, which is precisely the shared-rate-limit-bucket failure this ticket warns about.

*The Tailscale auth key lives in SSM Parameter Store as a SecureString*, created by hand so it
never touches Terraform state; the stack references the parameter by name and grants the
instance profile `ssm:GetParameter` on that one ARN. Research 0002 section 8.5 already directed
this. Secrets Manager was rejected as the same posture at $0.40 a month; a sensitive tfvar was
rejected because it lands in both state and user data. The key is minted reusable and tagged
`tag:proxy` at first authentication (that is what disables node key expiry), and its own expiry
date, at most 90 days out, goes in a comment because a rebuild after that date fails to enrol
with an error that does not say why.

*The stack creates its own small VPC* rather than reading the default one: a VPC, one public
subnet pinned to `use1-az6` by AZ ID, an internet gateway and a route table, all $0. The
Terraform is the portfolio artifact, apply-from-empty should not lean on account substrate a
hardened account deletes, and destroy then takes the whole network with it. The default VPC
remains the documented cheaper-to-read alternative; ticket 20 used it correctly for a
twenty-minute experiment.

**2026-08-17: what gets a comment in the Terraform, and what does not.** The stack is a
portfolio artifact, so the commenting rule is worth stating once: a comment records only what
the code cannot say about itself, and everything else stays bare. In `frontend.tf` that came to
exactly two. The bucket carries a pointer to `cdn.tf` because the policy admitting CloudFront
conditions on the distribution's ARN and so lives with the distribution; without the pointer, a
reader of this file alone sees a bucket nobody can reach and concludes broken or forgotten.
`force_destroy = true` carries its precondition: the bundle is a CI-rebuilt artifact and nothing
in the bucket is the only copy of anything. The flag authorises data loss on destroy, and the
comment is the tripwire for whoever later points generated data at the bucket. Nothing else in
the file gets one; `block_public_acls = true` explains itself.

**2026-08-17: the network, and the three values in it that are load-bearing.** `network.tf` is a
VPC, one public subnet, an internet gateway and a route table, and most of it is boilerplate.
Three values are not:

*The VPC sets `enable_dns_hostnames = true` explicitly.* The VPC origin addresses the instance
by its private DNS name, and that name only exists when the VPC has DNS hostnames on. Custom
VPCs default it to off; the default VPC has it on, which is why ticket 20's test never met this.
Left at the default, the failure would arrive at VPC-origin creation time looking like a
CloudFront problem.

*The subnet pins `availability_zone_id = "use1-az6"`, an ID and not a name.* AZ names are
shuffled per account, so `us-east-1a` is `use1-az6` in this account and could be the forbidden
`use1-az3` in another. The ID states the actual constraint; ticket 20 verified this exact zone.

*The public address comes from `map_public_ip_on_launch`, not an Elastic IP.* Same $3.65 a
month either way, but nothing anywhere refers to the public address: CloudFront arrives through
the VPC origin's private ENI and Tailscale dials out. An EIP's one benefit, an address that
survives rebuild, buys nothing, so it would be two extra resources of pure ceremony.

Also deliberate: no NACL resources. The default NACL allows everything, and research 0002
section 8.6 notes VPC-origin return traffic needs outbound ephemeral ports; hardening the NACL
would add a failure mode, not remove one. The security boundary is the instance's security
group, which admits CloudFront's service-managed group and nothing else.

**2026-08-17: review notes for `instance.tf` and `user_data.sh.tftpl`.** Material for a future
architecture review session; the Operator should be able to answer each *why* below without
looking at this note.

*The security group has no inbound rules in this file.* The CloudFront rule references the
service-managed group that only exists after the VPC origin deploys, so it lives in `cdn.tf`.
Egress is four rules (TCP 443, UDP 3478, UDP 41641, TCP 80), from research 0002 section 6.1.
Why it is dishonest to call this "locked down to Tailscale": security groups filter by CIDR,
Tailscale warns against pinning its IPs, so all four go to `0.0.0.0/0`. What is actually
restricted is ports. Why that still matters: a compromised proxy cannot exfiltrate over
arbitrary ports or reach anything's Postgres or SMTP.

*The auth key path is SSM at boot, one IAM action on one ARN.* The key transits memory during
`tailscale up` and lands nowhere on disk, in state, or in the AMI. Why there is no KMS
statement: the AWS-managed `aws/ssm` key already permits account principals decrypting through
SSM. Why `--ssh` on `tailscale up` is not optional: with no inbound 22 anywhere, Tailscale SSH
is the only management path the instance has.

*Boot order is tailscaled before nginx.* The upstream is a tailnet address; nginx resolves and
connects toward it once traffic arrives, and the ordering guarantee is only needed once, at
first boot. Related: `demo_upstream` is a tfvar holding a tailnet IP rather than a MagicDNS
name, because nginx resolves hostnames once at startup and MagicDNS is only guaranteed after
`tailscale up`. Until the demo Compose stack exists the value is a placeholder IP, which is
deliberately the "homelab stopped" state: it makes the fast-502 timeout checkbox testable
immediately.

*The nginx config is a full `nginx.conf` overwrite, not a conf.d drop-in.* The distro config
owns `listen 80 default_server`; a drop-in never matches (CloudFront sends the private DNS name
as Host) and the welcome page gets cached. Three lines inside it carry the ticket's own
checkboxes: `proxy_pass` with no URI so the path reaches the API unchanged, the way `tailscale
serve` delivers it in the Homelab Variant; 2-3s upstream timeouts so a dead homelab answers
502 in ~2s and the degraded mode gets seen; `$proxy_add_x_forwarded_for` because TRUST_PROXY=2
counts on CloudFront's entry surviving an append, and a replace puts every visitor on earth in
one rate-limit bucket.

*Two invisible-behaviour flags travel as a pair.* `user_data_replace_on_change = true` because
cloud-init runs user data once per instance, so without it a script edit stop/starts the same
instance and the change silently never lands; `ignore_changes = [ami]` because the AMI data
source tracks monthly releases and a routine plan must not read as a surprise instance
replacement. Patching is `dnf` on the box, not AMI churn. `http_tokens = "required"` closes the
IMDSv1 SSRF-steals-credentials path; it is the one line a security reviewer greps for.

Review-session prompts: what breaks if the SG egress becomes allow-all (nothing visibly, which
is the point); what happens on day 91 if the instance is rebuilt (enrolment fails on the
expired auth key with an unhelpful error; the expiry date lives in the SSM parameter
description); why the welcome-page failure would have been cached by CloudFront rather than
transient; and which two checkboxes on this ticket cannot be proven by any in-process test and
therefore wait for the real chain (the timeout timing and the X-Forwarded-For append).

**2026-08-17: review notes for `cdn.tf`.** Same purpose as the `instance.tf` note: the Operator
should be able to answer each *why* below cold.

*The chicken-and-egg rule, and how one apply resolves it.* The proxy's only inbound rule
references `CloudFront-VPCOrigins-Service-SG`, a group AWS creates only after the first VPC
origin deploys. The stack reads it with a data source carrying `depends_on` the VPC origin,
which defers the read from plan time to apply time: create origin, wait ~9 minutes, read group,
write rule, one apply. Ticket 20 chose this group over the CloudFront managed prefix list
because it is the restrictive option: the prefix list admits all CloudFront-adjacent traffic,
the service group admits only VPC-origin traffic.

*The VPC origin is ticket 20 cashed in.* `http-only` to the instance's private DNS name, so no
certificate, ACME client, renewal timer or Route 53 IAM policy exists anywhere in the stack.
The `https_port` and `origin_ssl_protocols` arguments are required by the API and unused by the
config; that is an API shape, not a decision.

*Two origins, one hostname.* Default behaviour to the bucket, `/api/*` to the proxy. This is
what lets the frontend keep relative paths per ADR-0002; the browser cannot tell the app is
split across a bucket and a homelab.

*`connection_attempts = 1`, `connection_timeout = 2` on the API origin only.* Defaults are 3
and 10: a dead instance costs a browser thirty seconds before its 502, and ticket 22's degraded
mode is never seen. These two lines are one of the ticket's two named non-optional settings;
nginx's 2-3s upstream timeouts are the other, and they cover the *other* failure (instance
alive, homelab dead).

*The `/api/*` behaviour: CachingDisabled, all seven methods, AllViewer.* No caching because the
API is stateful; all methods because the app writes; AllViewer because nginx and the API need
the real headers. The X-Forwarded-For chain assembles here: CloudFront appends the viewer's
address, nginx appends CloudFront's, and `TRUST_PROXY=2` counts two hops in from the right to
find the viewer. Any forged entries a caller sent sit further left and are never reached.

*Managed policies are read by name, not pasted as IDs.* `Managed-CachingOptimized` tells the
reader what it does; `658327ea-...` tells the reader nothing.

*The 403-to-index.html rule is an SPA accommodation with a stated assumption.* S3 through OAC
answers 403 (not 404) for a key that does not exist, and the app router owns those paths in
the browser. The comment says to drop the block if the frontend stops being a single-page app.

*The bucket policy is the one deferred from `frontend.tf`.* CloudFront's service principal may
GetObject, conditioned on `AWS:SourceArn` equalling this one distribution's ARN. Nothing else
can read the bucket; the four public-access flags block everything a policy might later loosen.

Review-session prompts: trace a request for `/api/recipes` from browser to Postgres and name
every hop and every timeout it can hit; explain why the ingress rule cannot be written in
`instance.tf` even though it protects that file's instance; state which failure each of the two
timeout settings covers and why one cannot substitute for the other; and explain why
`AllViewer` on the S3 behaviour instead of the API behaviour would be wrong (it would forward
Host to S3 and break OAC signing, and cache-key headers belong to the cache policy anyway).

**2026-08-17: review notes for `dns.tf`, `deploy.tf` and `outputs.tf`.** The last three files;
same rule, the Operator answers each *why* cold.

*The record is an alias A record, not a CNAME.* An alias may sit at any name including an
apex, is free per query, and targets the distribution through the distribution's own hosted
zone ID rather than an IP. `evaluate_target_health = false` because CloudFront alias targets do
not support health evaluation. A record only: the distribution keeps IPv6 off by default, and
an AAAA record without `is_ipv6_enabled = true` would resolve to nothing. If IPv6 is ever
enabled the two must change together.

*The zone is consumed, never owned.* `zone_id` arrives from platform remote state, so the
recipe stack writes one record into a zone it cannot create or destroy. `terraform destroy`
here removes the record and can never touch the zone or its NS records, which is the property
the ticket's first comment demanded.

*The deploy role's security story is the `sub` condition, not the permission policy.* The OIDC
provider trusts all of GitHub Actions; what narrows it to something safe is
`repo:philliam-nguyen/meal-prep-app:ref:refs/heads/main`, one repository, one branch. Without
that line any repository on GitHub could assume the role. The `aud = sts.amazonaws.com`
condition is its standard pair. There are no long-lived credentials anywhere in the deploy
path: the workflow trades a GitHub-signed token for temporary AWS credentials per run.

*The permission policy is three statements at three scopes.* `ListBucket` on the bucket ARN,
`PutObject`/`DeleteObject` on the objects, `CreateInvalidation` on the one distribution. No
wildcards. `DeleteObject` is deliberate: a synced deploy prunes stale hashed chunks, and
without it the bucket accumulates every bundle ever shipped.

*Outputs exist because CI and the runbook consume them.* Bucket name, distribution ID for the
post-deploy invalidation, role ARN for the workflow, hostname for humans. Reading
`terraform output` beats fishing in the console and keeps the values in the dependency graph.

Review-session prompts: explain what an attacker gains if the `sub` condition read only
`repo:philliam-nguyen/meal-prep-app:*` (any branch and any pull request in the repo could
deploy to production); why the alias record needs the distribution's hosted zone ID and not
the platform zone's; and why the deploy role deliberately cannot invalidate other
distributions or read the bucket it writes.

**2026-08-17: first full apply started.** Plan settled at 24 to add across seven files. Budget
wall clock, not minutes: ticket 20 measured ~9 minutes for the VPC origin alone and the
distribution takes longer.

**2026-08-18: first apply post-mortem, three findings.** The apply succeeded after one retry
(an apostrophe in a security group description; AWS's allowed set has no `'`). Then `/api/*`
answered 504 in 0.13s, which was the wrong error arriving suspiciously fast, and the diagnosis
is worth keeping:

*The 0.13s was the tell.* A security-group drop burns the full 2s connection timeout; an
instant failure is an active TCP refusal, meaning the packet reached the instance and nothing
was listening on 80. That pointed at nginx before any log was read. Cause: a paste error had
duplicated two directives in the nginx.conf heredoc, nginx refuses to start on a duplicate
`pid`, and nginx starts last in user data, so the instance enrolled in the tailnet perfectly
and served nothing.

*Tailscale SSH was dead on arrival, and it is a policy fact worth remembering.* The default
tailnet policy's `ssh` section permits members into `autogroup:self` only, and a tagged device
is not "self". The instance even warned at enrolment ("access controls don't allow anyone to
access this device"). Fixed with an `ssh` rule for `autogroup:member` into `tag:proxy`, users
`ec2-user` and `root`, action `accept` (swap to `check` for browser re-auth every 12h if the
friction is ever acceptable). Until that rule existed, the "managed over Tailscale SSH"
checkbox was false in a way nothing in AWS could reveal.

*The auth key leaked into the boot log.* `set -euxo pipefail` traces expanded values, so
`AUTH_KEY=tskey-auth-...` landed in plaintext in `/var/log/cloud-init-output.log`. Key revoked
and rotated (revocation does not disconnect the enrolled node), SSM parameter overwritten, and
the script now wraps the fetch in `set +x` / `set -x` with a comment explaining why the toggle
must survive refactoring. Lesson stated plainly: xtrace and secrets cannot coexist on the same
lines, and this failure mode is invisible until someone reads the log.

Review prompts from the incident: why did refused-vs-dropped identify the failing layer before
any SSH was possible; why does the instance replacing (not restarting) on a user-data edit
matter for both fixes; and what would the blast radius have been if the leaked key had been
non-reusable or untagged.

**2026-08-18: the VPC origin cannot be updated while a distribution holds it, and what that
does to instance replacement.** The rebuild after the nginx/key fixes hit a 409:
`CannotUpdateEntityWhileInUse`. The VPC origin references the instance by ARN, an instance
replacement changes the ARN, and the provider's in-place update of the origin is a thing
CloudFront flatly refuses while any distribution is associated. Left as written, *every* future
instance replacement would wedge the same way.

The cure is to replace the origin rather than update it, in the right order. Three lines in
`cdn.tf` carry it: `replace_triggered_by = [aws_instance.proxy.id]` makes any instance
replacement replace the VPC origin with it; `create_before_destroy = true` sequences
new-origin, repoint-distribution, destroy-old, so the old origin is unassociated by the time
its delete runs; and the origin's name embeds the instance id because the old and new origins
coexist during the overlap. Recovery from the wedged state was a one-off
`terraform apply -replace="aws_cloudfront_vpc_origin.api"`, since `replace_triggered_by` only
fires when the instance changes within the same plan. Total recovery wall clock ~15 minutes,
CloudFront deployments dominating as usual.

**Verified after the rebuild, all on 2026-08-18:** `/api/*` through the real distribution
answers 504 from nginx in 2.20-2.28s across three fresh-cache requests (12s apart, stepping
over CloudFront's 10s error-cache), which is `proxy_connect_timeout 2s` against an unreachable
upstream, the homelab-stopped state; timeout checkbox ticked with this evidence. nginx and
tailscaled both active from a single unattended boot. The new boot log contains zero
occurrences of `tskey`, confirming the `set +x` fix. Tailscale SSH works through the new
policy rule. Housekeeping that remains: the terminated instance's node still holds the name
`meal-prep-proxy`, so the live node enrolled as `meal-prep-proxy-1`; delete the stale node in
the Machines page and rename the live one if the suffix offends. Nothing references the node
name, so this is cosmetic.

One operational note the next rebuild should remember: instance replacement now costs two
CloudFront deployment waits (new origin, then distribution repoint). That is the price of the
VPC-origin design and it is fine for a demo, but a config-only nginx change is cheaper applied
by hand over Tailscale SSH than through a rebuild, at the cost of drift until the next apply.

**2026-08-20: housekeeping done and the upstream is real.** The stale `meal-prep-proxy` node is
deleted from the tailnet. `demo_upstream` now carries the demo stack's tailnet address,
100.78.72.5, replacing the placeholder. Ticket 27 is finished, so the homelab-stopped state is
no longer the permanent condition; of the two blockers on the remaining checkboxes only 16 (the
bundle in the bucket) still stands.
