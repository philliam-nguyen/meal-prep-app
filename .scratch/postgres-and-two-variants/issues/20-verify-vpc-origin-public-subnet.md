# 20 - Verify a VPC origin serves an instance in a public subnet

Status: ready-for-human

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

- [ ] A VPC origin is created against an instance in a public subnet that holds a public IPv4 address
- [ ] A request through the distribution reaches the instance, or fails in a way that is recorded
- [ ] The instance's outbound internet access is confirmed to still work while it serves as an origin
- [ ] The answer, the date and the observed behaviour are written into the comments below
- [ ] Every resource created for the test is destroyed
