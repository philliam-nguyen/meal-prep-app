# 20 - Verify a VPC origin serves an instance in a public subnet

Status: done

**What to build:** An answer, established by applying it rather than by reading about it, to whether
CloudFront VPC origins will serve an EC2 instance that sits in a public subnet and holds a public
IPv4 address.

The Demo Variant's ingress puts a small instance in the VPC, joins it to the tailnet, and has it
proxy onward to the homelab. Tailscale needs outbound internet from that instance, and a NAT Gateway
costs more than everything else in the design combined, so the instance has to keep a public address
for egress. Whether CloudFront can still reach it privately, as a VPC origin, decides how much of the
ingress exists at all:

- **If it works**, the CloudFront-to-origin hop is private, `http-only` is a supported origin protocol
  policy, and viewer TLS terminates on the existing platform certificate. No certificate goes on the
  instance. No ACME client, no renewal timer, no Route 53 IAM policy.
- **If it does not**, the hop crosses the public internet and a certificate on the instance becomes
  mandatory, along with whatever obtains and renews it.

That is a different Terraform stack either way, which is why this is settled before the stack is
written rather than during.

**What the research found.**
[research 0002](../../../docs/research/0002-cloudfront-ec2-tailscale-ingress.md) section 2 could find no
first-party sentence permitting or forbidding it. The evidence is positive but circumstantial: the
CloudFront developer guide's own migration runbook ends by telling the reader to "Remove public
access to your VPC origin by making the subnet private", a step that only makes sense if the origin
was already serving while the subnet was public; `CreateVpcOrigin` takes an instance ARN and no
subnet parameter; and the origin domain is the instance's private DNS name, which a public-subnet
instance also has. Strong, and not proof. Section 11 lists it as the research's most consequential
unverified claim.

**The procedure is in section 9** of that file: roughly twenty minutes and about five cents, most of
it CloudFront's own deployment wait. Nothing needs to be kept afterwards.

**Watch the availability zone.** `us-east-1` excludes `use1-az3` from VPC origins, the same zone the
earlier cost research found excluded from RDS Proxy. A subnet placed there fails for a reason that
looks nothing like the thing being tested.

**Record the answer here**, in the comments, with the date and what was actually observed. A later
reader needs to know this was applied rather than reasoned about, because the whole point of the
ticket is that reasoning was available and insufficient.

**Blocked by:** None. Blocks the ingress Terraform, since the resource list depends on the answer.

- [x] A VPC origin is created against an instance in a public subnet that holds a public IPv4 address
- [x] A request through the distribution reaches the instance, or fails in a way that is recorded
- [x] The instance's outbound internet access is confirmed to still work while it serves as an origin
- [x] The answer, the date and the observed behaviour are written into the comments below
- [x] Every resource created for the test is destroyed

## Comments

**The answer is yes, established by applying it on 2026-08-18.** CloudFront VPC origins serve an EC2
instance that sits in a public subnet and holds a public IPv4 address. The instance keeps its
outbound internet access while it does so. The ingress therefore takes the first branch: the
CloudFront-to-origin hop is private, `http-only` stands as the origin protocol policy, viewer TLS
terminates on the platform certificate, and no certificate, ACME client, renewal timer or Route 53
IAM policy goes anywhere near the instance.

What was actually observed, in account `<account>`, region `us-east-1`:

| | |
|---|---|
| Instance | `i-0cc9ee95a30f39655`, t4g.nano, `ami-0cded71ff6ab7f608` (Amazon Linux 2023 arm64) |
| Subnet | `subnet-0810cbb2c88841775` in the default VPC, `us-east-1a` = `use1-az6` |
| Public IPv4 | `3.81.174.238`, auto-assigned, held for the whole test |
| Private DNS | `ip-172-31-43-81.ec2.internal`, used as the origin domain |
| Security group | created with no inbound rules at all |
| VPC origin | `vo_Ljs9sXYdScICM4cP49HKG5`, `http-only`, port 80 |
| Distribution | `E2X18J1D0J8PWK` at `d19l9l6tpt1a68.cloudfront.net` |

`create-vpc-origin` accepted the instance ARN without complaint. There was no subnet-type
validation, no warning, and no mention of the subnet in the response. The origin sat in `Deploying`
for roughly nine minutes and then reached `Deployed`. The service-managed group
`CloudFront-VPCOrigins-Service-SG` appeared in the VPC as `sg-06e52edd4b3cf614e` once the origin
deployed, and was added as the sole inbound source on port 80, which is the restrictive option
rather than the CloudFront managed prefix list.

A request through the distribution returned **HTTP 200** with `x-cache: Miss from cloudfront`, and
the body was the page served by the instance. The origin was reachable privately while the subnet
was public and the instance held a routable address the whole time.

Outbound access was confirmed in the same request rather than over a shell. The instance rewrote its
index page every fifteen seconds with a fresh `curl` to `https://controlplane.tailscale.com/`, and
the distribution used the managed `CachingDisabled` policy, so the body read at `2026-08-18
01:24:07 UTC` was at most fifteen seconds old:

```
ticket-20 vpc-origin test
utc: Tue Aug 18 01:24:07 UTC 2026
egress https://controlplane.tailscale.com -> 302
```

`302` rather than `200` is Tailscale's own redirect on that path and is not a defect. What the line
establishes is that DNS resolution, the outbound TCP connection, the TLS handshake and a complete
HTTP response all succeeded from the instance while it was serving as a VPC origin. Only a `FAIL` or
a `000` there would have meant no egress. So the Tailscale premise holds: the instance can reach the
control plane without a NAT Gateway, and CloudFront can still reach the instance privately.

This settles the first entry in section 11 of
[research 0002](../../../docs/research/0002-cloudfront-ec2-tailscale-ingress.md), which named it the
research's most consequential unverified claim. The circumstantial reading in section 2.1 was
correct: the `Private subnet` heading in the AWS prerequisites describes the intended deployment,
and the operative requirement is an available IPv4 address for the service-managed ENI, not a
route-table shape.

**Teardown verified 2026-08-18.** `list-vpc-origins` and `list-distributions` both return empty,
`i-0cc9ee95a30f39655` is `terminated`, and `sg-0be60cfd2344c2b9c` returns `InvalidGroup.NotFound`. A sweep of
`us-east-1` for orphans found no `available` volumes, no unattached ENIs and no elastic IPs. The
service-managed group `sg-06e52edd4b3cf614e` removed itself once the last VPC origin was deleted, so no
manual cleanup was needed there. The terminated instance record stays visible in the EC2 API for about an
hour and bills nothing.

Two notes for whoever writes the ingress Terraform. Pin the availability zone by ID, because
`us-east-1e` is `use1-az3` and is excluded from VPC origins; this test used `use1-az6` deliberately.
And budget more wall clock than section 9's twenty minutes suggests: the VPC origin took about nine
minutes to deploy and the distribution took longer, with the teardown needing a further deployment
cycle to disable the distribution before it can be deleted. The money cost was as estimated, a few
cents.
