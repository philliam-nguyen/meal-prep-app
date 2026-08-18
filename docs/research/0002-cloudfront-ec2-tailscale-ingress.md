# Research: CloudFront to a small EC2 proxy to the homelab over Tailscale

**Question.** The architecture is settled: an S3 bundle behind CloudFront at `meal-prep.phillip-nguyen.dev`,
CloudFront as the single origin, a `/api/*` behaviour pointed at a t4g.nano-class EC2 instance running a
reverse proxy, and that instance joining the Operator's tailnet and proxying onward to a Fastify API on the
homelab. This document settles the remaining unknowns: whether CloudFront VPC origins works when the
instance sits in a public subnet, what the fallback looks like, whether a TLS certificate is needed on the
instance and how to get one, exactly what Tailscale needs and what its tag isolation does and does not
enforce, what the whole thing costs, and what is going to bite.

**Date of research:** 2026-08-17. AWS prices come from the AWS Price List Bulk API for `us-east-1`, using the
same method as [0001](./0001-api-runtime-cost.md), referred to below as the prior research.
Publication dates differ per offer and are given with each
figure. Every figure retrieved 2026-08-17. Non-AWS figures carry their own retrieval date.

**Region and account.** `us-east-1`, account `<account>`, as the brief states. `us-east-1` supports VPC
origins, with one exception noted in section 1.

**Note on sources.** The AWS pricing web pages render their tables in JavaScript and a fetcher gets an empty
table, so numbers come from the Price List Bulk API and each carries the `PriceDescription` string AWS ships
with it. Tailscale figures come from Tailscale's own documentation, not from blog posts, except where a
Tailscale blog post is the only place a supported pattern is written down, in which case it is marked.

---

## 1. Bottom line

**VPC origins with a public-subnet instance: yes. Tested on 2026-08-18, and AWS still never says so.** This
was the document's central unknown and it has since been settled by running the test in section 9. A VPC
origin against a t4g.nano in a public subnet holding a public IPv4 address reached `Deployed` and served a
request through a distribution at HTTP 200, and the instance kept its outbound internet access while it did.
Section 2.1 records what was observed.

The documentation has not moved. There is still no first-party sentence saying "the resource may be in a
public subnet" and none saying it may not, and every marketing sentence still says "private subnet". The
strongest written evidence remains procedural rather than declarative: the CloudFront developer guide's own
migration runbook has you create the VPC origin, test it, promote it, and only then "Remove public access to
your VPC origin by making the subnet private", a step that is meaningless unless the VPC origin was working
while the subnet was still public. So the design rests on observed behaviour that AWS has not committed to
in writing, which is why the fallback in section 3 stays fully documented. See section 2 and "Could not
verify".

**A certificate on the instance is needed only if you take the fallback.** These two options are not
equivalent and the difference is exactly the certificate:

- **VPC origin path:** the CloudFront-to-origin hop does not cross the public internet. AWS: "User requests
  go from CloudFront to the VPC origins over a private, secure connection." `origin_protocol_policy =
  "http-only"` is defensible there and **no certificate is needed on the instance at all**.
- **Prefix-list-locked public instance:** the hop crosses the public internet. HTTP means the entire API
  request and response, including any shared-secret header CloudFront adds, travels in cleartext across the
  open internet. AWS's own guidance on that pattern says the viewer and origin protocol policies together
  are what "ensure that the custom headers are encrypted in transit". So the fallback **requires** a
  certificate on the instance.

**Verified monthly total: $7.36.** t4g.nano on-demand $3.07, one in-use public IPv4 address $3.65, an 8 GB
gp3 root volume $0.64, data transfer from EC2 to CloudFront $0.00, VPC origin charge $0.00. Add the S3
bundle at about $0.01 and CloudFront at $0.00 and the whole AWS bill for this design is about **$7.37 a
month**, against **$28.49** for the Fargate option in the prior research. The public IPv4 address costs more
than the instance does.

**The hazard that matters most is not key expiry.** Key expiry turns out to be a non-problem if the nodes
are tagged, because Tailscale disables key expiry on a device the first time it is tagged and authenticated.
The hazard that matters is the **failure latency when the homelab is offline**. With CloudFront defaults, a
dead origin costs the browser up to 30 seconds (3 connection attempts at 10 seconds) before it sees a 502,
and CloudFront then caches that error for only 10 seconds by default. A frontend with a degraded read-only
mode that triggers on `/api/*` failure will sit spinning for half a minute on the first request and then
re-pay that cost every 10 seconds. Section 7 gives the numbers and the fix.

---

## 2. CloudFront VPC origins with a public-subnet instance

### 2.1 The direct question, answered honestly

> **Settled by hand on 2026-08-18: yes, it works.** The rest of this section is the documentary evidence as
> it stood before the test, kept because it explains why the test was necessary and what the AWS
> documentation does and does not commit to. What was observed, in account `<account>`, `us-east-1`:
>
> | | |
> |---|---|
> | Instance | t4g.nano, Amazon Linux 2023 arm64, in the default VPC |
> | Subnet | public, auto-assign public IPv4 on, in `us-east-1a` = `use1-az6` |
> | Public IPv4 | assigned and held for the whole test |
> | Origin domain | the instance's private DNS name |
> | Security group | created with no inbound rules, then the service-managed group as the sole source on :80 |
> | VPC origin | `http-only`, port 80, `Deploying` for about nine minutes, then `Deployed` |
> | Request through the distribution | **HTTP 200**, `x-cache: Miss from cloudfront`, body served by the instance |
> | Outbound from the instance, during that request | `https://controlplane.tailscale.com/` returned `302` |
>
> `create-vpc-origin` accepted the instance ARN with no subnet-type validation, no warning, and no mention
> of the subnet in the response. The `302` is Tailscale's own redirect on that path, not a defect: it proves
> DNS resolution, the outbound TCP connection, the TLS handshake and a complete HTTP response all succeeded
> from the instance while it was serving as a VPC origin.

I could not find a first-party sentence that says either "yes, a public subnet is supported" or "no, the
subnet must be private". Everything AWS publishes is framed around private subnets, and the brief is right
to be suspicious of that framing, because it is a description of the intended benefit rather than a
constraint statement.

**What AWS actually states as a prerequisite** (CloudFront developer guide, "Restrict access with VPC
origins"):

> **Private subnet with at least one available IPv4 address** - CloudFront routes to your subnet by using a
> service-managed elastic network interface (ENI) that CloudFront creates after you define your VPC origin
> resource with CloudFront. You must have at least one available IPv4 address in your private subnet so that
> the ENI creation process can succeed. The IPv4 address can be private, and there is no additional cost for
> it.

Read carefully, the operative requirement is "at least one available IPv4 address" and "the IPv4 address can
be private". The word "private" in the heading is descriptive of the intended deployment, and the sentence
that follows imposes an address-availability requirement, not a route-table requirement.

**The positive evidence, and it is first-party.** The same page's procedure "Create a VPC origin (existing
distribution)" ends with this step:

> Remove public access to your VPC origin by making the subnet private. After you do this, the VPC origin
> won't be discoverable over the internet, but CloudFront will still have private access to it.

That step only makes sense if the preceding steps, which include creating the VPC origin, waiting for it to
reach `Deployed`, adding it as an origin, and testing it through a staging distribution, all happened while
the subnet was still public. AWS is documenting a supported migration in which a VPC origin serves traffic
from a resource in a public subnet. That is as close to a positive statement as the documentation gets.

**Corroborating structural evidence:**

- `CreateVpcOrigin` takes an ARN of the ALB, NLB, or EC2 instance. It takes no subnet parameter and performs
  no stated subnet-type validation. (`VpcOriginEndpointConfig` in the CloudFront API reference: required
  fields are `Arn`, `Name`, `HTTPPort`, `HTTPSPort`, `OriginProtocolPolicy`.)
- The origin domain for an EC2 VPC origin is the instance's **private** IP DNS name: "If your VPC origin is
  an EC2 instance, copy and paste the **Private IP DNS name** of the instance into the **Origin domain**
  field." An instance in a public subnet with a public IPv4 address still has a private IPv4 address and a
  private DNS name. Having a public address does not remove the private one, so nothing in the addressing
  model conflicts.
- The VPC must have an internet gateway anyway: "You need to add an internet gateway to the VPC that has
  your VPC origin resources. The internet gateway is required to denote that the VPC can receive traffic
  from the internet. The internet gateway is not used for routing traffic to origins inside the subnet, and
  you don't need to update the routing policies."

**Verdict: supported in practice, still not stated in the documentation.** The circumstantial reading above
turned out to be the correct one, and the test in section 9 confirmed it on 2026-08-18. `CreateVpcOrigin`
accepted the instance ARN with no subnet-type validation, no warning and no mention of the subnet in the
response. Treat the `Private subnet` prerequisite heading as a description of AWS's intended deployment; the
operative requirement is the sentence under it, an available IPv4 address for the service-managed ENI. Since
AWS has still committed to nothing in writing, this is a behaviour that could change without a deprecation
notice, and the fallback in section 3 stays documented for that reason.

Sources: https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/private-content-vpc-origins.html
and https://docs.aws.amazon.com/cloudfront/latest/APIReference/API_VpcOriginEndpointConfig.html (retrieved
2026-08-17)

### 2.2 Does the instance keep outbound internet access?

**Yes, and this one is not really in doubt**, though the reasoning is inference rather than a quoted
sentence, so it is flagged as such.

A VPC origin adds two things to your VPC: a CloudFront service-managed ENI in the subnet, and a
service-managed security group you reference as an inbound source. It does not modify the subnet's route
table. AWS says so explicitly in the internet gateway prerequisite quoted above: "you don't need to update
the routing policies." Outbound internet access from an EC2 instance is a function of the subnet's route
table having a `0.0.0.0/0` route to the internet gateway plus the instance holding a public IPv4 address.
Nothing in the VPC origins feature touches either. Egress security group rules are yours and are untouched.

So the instance in a public subnet, with a public IP, an IGW default route, and permissive egress rules,
keeps normal outbound internet access and `tailscaled` can dial out.

**Confirmed by observation on 2026-08-18.** During the section 9 test the instance rewrote its served page
every fifteen seconds with a fresh `curl` to `https://controlplane.tailscale.com/`, and the distribution ran
the managed `CachingDisabled` policy, so the body fetched through CloudFront carried a live egress result
rather than a boot-time one. It returned Tailscale's `302` redirect, which means DNS resolution, the
outbound TCP connection, the TLS handshake and a complete HTTP response all succeeded from the instance
while it was serving as a VPC origin. The reasoning above was right, and it is no longer only reasoning.

### 2.3 What a VPC origin actually requires

Collected from the developer guide page, quoted:

| Requirement | What AWS says |
|---|---|
| Resource types | "You can use Application Load Balancers (ALBs), Network Load Balancers (NLBs), and EC2 instances in private subnets as VPC origins." |
| Resource state | "The resource you launch must be fully deployed and in Active status before you can use it for a VPC origin." |
| Internet gateway | Required on the VPC, "not used for routing traffic to origins inside the subnet" |
| Free IPv4 address in the subnet | Required, for the service-managed ENI |
| Security group on the resource | "Your VPC origin resources ... must have a security group attached." |
| Service-managed SG | "CloudFront automatically creates a service-managed security group with the naming pattern `CloudFront-VPCOrigins-Service-SG`. This security group is fully managed by AWS, and should not be edited." |
| Inbound rule, option 1 | Allow the CloudFront managed prefix list. "This can be done before VPC origin created as well." |
| Inbound rule, option 2 | Allow `CloudFront-VPCOrigins-Service-SG`. "This can be done only after the VPC origin is created ... This configuration is further restrictive as it restricts the traffic only to your CloudFront distributions." |
| Naming collision | "Do not create your own security group with a name starting with `CloudFront-VPCOrigins-Service-SG`." |
| Deployment time | "Wait for your VPC origin status to change to **Deployed**. This can take up to 15 minutes." |
| Same account | Cross-account is now supported via AWS RAM: "CloudFront supports sharing VPC origins across AWS accounts". Not needed here, single account `<account>`. |
| Region | `us-east-1` is supported, **"except AZ use1-az3"**. |
| Protocols and ports | `OriginProtocolPolicy` valid values: `http-only \| match-viewer \| https-only`. `HTTPPort` default 80, `HTTPSPort` default 443, both required fields. |
| Not supported | gRPC traffic; Lambda@Edge origin request and origin response triggers; inbound NACL rules are not evaluated, but "outbound NACL rules are evaluated on the return path and must allow traffic on ephemeral TCP ports (1024-65535) to `0.0.0.0/0` or to the CloudFront origin-facing IP ranges." |
| Quotas | 25 VPC origins per account, 50 distributions per VPC origin. |

The `use1-az3` exclusion is the same AZ restriction the prior research found for RDS Proxy. A Terraform
module that picks a subnet by index rather than by AZ ID will eventually pick `use1-az3` and the VPC origin
will fail. Pin the AZ by ID.

Option 2 is materially better than option 1 and worth stating plainly: allowing the CloudFront managed
prefix list admits **every CloudFront distribution in the world**, including one a stranger creates pointing
at your origin. Allowing `CloudFront-VPCOrigins-Service-SG` "restricts the traffic only to your CloudFront
distributions". That difference is the second-largest reason to prefer the VPC origin path over the fallback.

Sources: https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/private-content-vpc-origins.html
and https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/cloudfront-limits.html

### 2.4 Is there a charge for a VPC origin?

**No. $0.00.** Two independent first-party confirmations plus a negative from the price list.

- AWS What's New, "Amazon CloudFront announces VPC origins" (2024-11): `"There is no additional cost for
  using VPC origins with CloudFront."`
- CloudFront pay-as-you-go pricing page: origin fetches are `"Free for origin fetches from any AWS origin
  such as Amazon Simple Storage Service (S3), Amazon Elastic Compute Cloud (EC2), or Elastic Load
  Balancers"`, and the same page includes `"including origins in private subnets through VPC origins"`.
- The `AmazonCloudFront` price list (publication date `2025-07-01T21:16:47Z`) contains **zero** line items
  matching `vpc`, case-insensitive. Absence from a price list is weaker evidence than a statement, but here
  there are two statements as well.

Sources: https://aws.amazon.com/about-aws/whats-new/2024/11/amazon-cloudfront-vpc-origins/,
https://aws.amazon.com/cloudfront/pricing/pay-as-you-go/,
https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/AmazonCloudFront/current/index.csv

### 2.5 Terraform support

The AWS provider has a first-class resource. `aws_cloudfront_vpc_origin`:

```terraform
resource "aws_cloudfront_vpc_origin" "api" {
  vpc_origin_endpoint_config {
    name                   = "meal-prep-api-origin"
    arn                    = aws_instance.proxy.arn
    http_port              = 80
    https_port             = 443
    origin_protocol_policy = "http-only"

    origin_ssl_protocols {
      items    = ["TLSv1.2"]
      quantity = 1
    }
  }
}
```

`origin_ssl_protocols` is **required** by the provider even when `origin_protocol_policy = "http-only"`, so
it has to be present and is simply unused. Resource timeouts default to `15m` for create, update and delete,
matching AWS's "up to 15 minutes". The distribution's `origin` block then takes a `vpc_origin_config` instead
of a `custom_origin_config`.

One operational wrinkle worth writing into the Terraform as a comment: updating a VPC origin in the console
requires first disassociating it from every distribution that uses it. Expect `terraform apply` on a changed
port or protocol policy to be slow, and expect an instance replacement to force a VPC origin replacement,
because the config holds the instance ARN.

Sources:
https://github.com/hashicorp/terraform-provider-aws/blob/main/website/docs/r/cloudfront_vpc_origin.html.markdown
and .../cloudfront_distribution.html.markdown (retrieved 2026-08-17)

---

## 3. The fallback: a public instance locked to CloudFront by prefix list

### 3.1 The prefix list is the one you think it is

Confirmed, exact name, from the CloudFront developer guide:

> The CloudFront managed prefix lists are as follows:
> + `com.amazonaws.global.cloudfront.origin-facing` (IPv4)
> + `com.amazonaws.global.ipv6.cloudfront.origin-facing` (IPv6)

And its purpose, quoted:

> The CloudFront managed prefix list contains the IP address ranges of all of CloudFront's globally
> distributed origin-facing servers. If your origin is hosted on AWS and protected by an Amazon VPC security
> group, you can use the CloudFront managed prefix list to allow inbound traffic to your origin only from
> CloudFront's origin-facing servers, preventing any non-CloudFront traffic from reaching your origin.
> CloudFront maintains the managed prefix list so it's always up to date with the IP addresses of all of
> CloudFront's global origin-facing servers.

AWS gives an EC2 example that is exactly this use case: "imagine that your origin is an Amazon EC2 instance
in the Europe (London) Region (`eu-west-2`). If the instance is in a VPC, you can create a security group
rule that allows inbound HTTPS access from the CloudFront managed prefix list."

**Region and global behaviour.** The prefix list name is global (`com.amazonaws.global....`, no region
token) and it contains CloudFront's worldwide origin-facing ranges, not just the ranges near `us-east-1`. It
is enumerable and usable from every region through the regional `DescribeManagedPrefixLists` API, so a
Terraform data source in the `us-east-1` provider resolves it fine.

**The thing the prefix list does not do.** It proves a request came from CloudFront. It does not prove the
request came from *your* CloudFront distribution. Anyone can create a distribution pointing at your public
EC2 DNS name, and their requests will arrive from the same origin-facing ranges. This is why AWS's own
guidance for custom origins is a shared-secret header:

> If you use a custom origin, you can optionally set up custom headers to restrict access. ... After you've
> made these changes, update your application on your custom origin to only accept requests that include the
> custom headers that you've configured CloudFront to send.

And, crucially for the certificate question:

> The combination of **Viewer Protocol Policy** and **Origin Protocol Policy** ensure that the custom
> headers are encrypted in transit.

So the fallback is a three-part control, not one: prefix list, plus a secret header CloudFront adds and the
proxy checks, plus HTTPS to the origin so the secret header is not shouted across the internet.

Sources:
https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/LocationsOfEdgeServers.html#managed-prefix-list
and https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/private-content-overview.html

### 3.2 Referencing it in Terraform

The data source is `aws_ec2_managed_prefix_list`. It takes either `name` or a `filter` block whose `name`
values are valid `DescribeManagedPrefixLists` filter fields; the useful filter is `prefix-list-name`. Using
the `name` argument is simpler and is what the provider's own DynamoDB example does.

```terraform
data "aws_ec2_managed_prefix_list" "cloudfront_origin_facing" {
  name = "com.amazonaws.global.cloudfront.origin-facing"
}

resource "aws_vpc_security_group_ingress_rule" "from_cloudfront" {
  security_group_id = aws_security_group.proxy.id
  description       = "CloudFront origin-facing servers only. Weight 55 of the 60-rule SG quota."
  prefix_list_id    = data.aws_ec2_managed_prefix_list.cloudfront_origin_facing.id
  ip_protocol       = "tcp"
  from_port         = 443
  to_port           = 443
}
```

The equivalent filter form, if the `name` argument ever proves awkward:

```terraform
data "aws_ec2_managed_prefix_list" "cloudfront_origin_facing" {
  filter {
    name   = "prefix-list-name"
    values = ["com.amazonaws.global.cloudfront.origin-facing"]
  }
}
```

Source:
https://github.com/hashicorp/terraform-provider-aws/blob/main/website/docs/d/ec2_managed_prefix_list.html.markdown

### 3.3 The rule quota, and yes it matters

The CloudFront prefix list has a **weight of 55**, and AWS calls this out as unusual:

> The CloudFront managed prefix list is unique in how it applies to Amazon VPC quotas.

> For example, the weight of a Amazon CloudFront managed prefix list is 55. Here's how the this affects your
> Amazon VPC quotas:
> + **Security groups** - The default quota is 60 rules, leaving room for only 5 additional rules in a
>   security group. You can request a quota increase for this quota.
> + **Route tables** - The default quota is 50 routes, so you must request a quota increase before you can
>   add the prefix list to a route table.

For this design it is survivable but tight: one prefix list ingress rule consumes 55 of 60, leaving 5. That
is enough for what this box needs, since Tailscale needs no inbound rules at all. But it means the security
group holding the prefix list rule must hold **nothing else of consequence**, and it means adding an IPv6
rule from `com.amazonaws.global.ipv6.cloudfront.origin-facing` (weight 55 as well) is impossible in the same
group without a quota increase. Put the prefix list rule in its own security group attached to the instance
alongside a second, ordinary group, or request the increase.

Source: https://docs.aws.amazon.com/vpc/latest/userguide/working-with-aws-managed-prefix-lists.html

### 3.4 Two more things the fallback drags in

- **The origin must be publicly resolvable.** "Your origin domain must have a publicly resolvable DNS name
  that routes requests from clients to targets over the internet." The EC2 public DNS name
  (`ec2-203-0-113-25.compute-1.amazonaws.com`) satisfies this, and AWS lists exactly that form as a valid
  origin domain. But that name is derived from the public IPv4 address, which changes on stop/start unless
  you attach an Elastic IP. An Elastic IP associated with a running instance bills at the same
  `$0.005 per In-use public IPv4 address per hour`, so it is not an extra charge, just an extra resource.
- **A certificate is required**, because of the cleartext argument in section 4. Which means a name that the
  certificate can cover, which means a Route 53 record pointing at the instance, which means the origin's
  hostname is public and discoverable. That is not a security problem given the prefix list, but it is
  another moving part a Reviewer will see.

Source:
https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/DownloadDistValuesOrigin.html

---

## 4. The CloudFront-to-origin protocol

### 4.1 The options, and yes plain HTTP is permitted

For a custom origin, CloudFront offers three origin protocol policies, quoted from the origin settings page:

> + **HTTP only:** CloudFront uses only HTTP to access the origin.
> + **HTTPS only:** CloudFront uses only HTTPS to access the origin.
> + **Match viewer:** CloudFront communicates with your origin using HTTP or HTTPS, depending on the
>   protocol of the viewer request.

Ports are configurable: "Valid values include ports 80, 443, and 1024 to 65535. The default value is port
80" for HTTP, and the same range defaulting to 443 for HTTPS. So yes, CloudFront will happily speak plain
HTTP to a custom origin. It is not blocked, discouraged in the API, or gated.

The Terraform provider mirrors this: `origin_protocol_policy` is "One of `http-only`, `https-only`, or
`match-viewer`".

### 4.2 What HTTP over the public internet actually exposes

Plainly, because the brief asked for plainly. If the hop crosses the public internet in cleartext, then
every network between a CloudFront edge location and the EC2 instance, which is every transit provider on
that path, sees:

- The full request line and path, so every `/api/recipes/:id`, every query string.
- Every request and response header. Including any `X-Origin-Secret`-style shared header CloudFront adds to
  prove the request is genuine, which means the shared secret is not a secret, which means the prefix list
  is doing all the work on its own and the header adds nothing.
- Every request and response body. This app has no authentication (ADR-0003) and the Demo Variant holds only
  Seed data, so nothing personal leaks. What leaks is the secret and the integrity guarantee: an on-path
  attacker can modify responses in flight, and a Reviewer reading the Terraform will see `http-only` on an
  internet-crossing hop and correctly mark it down.

That last point is the one that matters for a portfolio artifact. The data is fake; the pattern is not.

AWS's own framing agrees: the guidance for restricting a custom origin says the viewer and origin protocol
policies together "ensure that the custom headers are encrypted in transit". That sentence only works if the
origin protocol policy is HTTPS.

### 4.3 Does the VPC origin path change the answer?

**Yes, and this is the crux of the whole document.**

AWS describes the VPC origin connection as private:

> User requests go from CloudFront to the VPC origins over a private, secure connection, providing
> additional security for your applications.

The mechanism supports that description: CloudFront reaches the origin through a service-managed ENI **inside
your VPC**, addressed to the instance's private IP DNS name. There is no internet transit on that hop.

`VpcOriginEndpointConfig.OriginProtocolPolicy` accepts `http-only`, and `HTTPPort` defaults to 80, so AWS
provisions the plain-HTTP case as a first-class option on this path.

**Conclusion: on the VPC origin path, `http-only` is acceptable and no certificate is needed on the
instance.** The reverse proxy listens on port 80 on the instance's private address, CloudFront terminates
viewer TLS with the existing ACM certificate covering `*.phillip-nguyen.dev`, and the only unencrypted hop is
inside your own VPC over an AWS-managed interface. The tailnet hop beyond the proxy is WireGuard, which is
encrypted by construction.

Sources:
https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/DownloadDistValuesOrigin.html,
https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/private-content-vpc-origins.html,
https://docs.aws.amazon.com/cloudfront/latest/APIReference/API_VpcOriginEndpointConfig.html

---

## 5. Getting a TLS certificate onto the instance, if one is needed

Only needed on the fallback path. Three options, priced and dated.

### 5.1 ACM exportable public certificates: they exist now, and they cost real money

They do exist, and they are new enough that the prior research file already caught the price change.

- **The mechanism.** ACM has an `ExportCertificate` API and a console **Export** action that returns "a
  base64-encoded, PEM-format certificate, also containing the certificate chain and encrypted private key".
  You supply a passphrase. So yes, an ACM public certificate can be installed on an EC2 instance.
- **The catch that disqualifies the existing certificate.** "ACM public certificates created prior to June
  17, 2025 cannot be exported." Exportability is a property fixed at request time. The platform stack's
  existing certificate covering the apex and `*.phillip-nguyen.dev` was issued for CloudFront, is
  non-exportable, and **cannot be turned into an exportable one**. A second, separate certificate would have
  to be requested.
- **The price.** From the ACM pricing page, retrieved 2026-08-17: `"Public certificate (non-exportable)"` is
  **No cost**. Exportable is **`$7.00 (upon issuance and again only on certificate renewal)`** per standard
  fully qualified domain name, and **`$79.00`** per wildcard domain.

For this design that is $7.00 for a single name such as `api-origin.phillip-nguyen.dev`, charged on issuance
and again on each renewal, so roughly $7 a year at a 13-month renewal cadence. Do **not** buy the wildcard;
$79 for a hop that could be free is absurd here.

Sources: https://docs.aws.amazon.com/acm/latest/userguide/export-public-certificate.html and
https://aws.amazon.com/certificate-manager/pricing/ (both retrieved 2026-08-17)

### 5.2 The option the brief did not name: ACM ACME

**This is the simpler option that was missed, and it is worth knowing about even if it does not win here.**

ACM now runs a managed ACME (RFC 8555) server, so standard clients such as Certbot and cert-manager can get
publicly trusted ACM certificates for infrastructure you manage yourself:

> ACM provides a managed ACME server that you access through ACME endpoints.

> **Use ACME when:** You want to use industry-standard ACME clients (Certbot, cert-manager). You need
> certificates for customer-managed infrastructure (on-premises, Kubernetes, hybrid). ... You must keep the
> private key on your own systems.

Characteristics that matter:

- **Validity is 45 days.** "The validity period for ACME-issued certificates is 45 days, which is shorter
  than the validity period for other ACM public certificates. This shorter validity is offset by the fact
  that ACME clients renew certificates automatically."
- **The private key never leaves the instance.** "The private key is generated and held by the ACME client.
  ACM never sees the private key."
- **Domain validation is done in advance by an administrator**, not per-request by the client: "the ACM ACME
  server uses domains that an administrator approves in advance", provisioning CNAME records. This is a real
  advantage over Let's Encrypt DNS-01, because the instance never needs Route 53 credentials at all. The
  EAB credentials it holds can only issue for pre-approved names.
- **These certificates cannot be used by CloudFront.** "ACME-issued certificates cannot be bound to Managed
  automation with integrated services such as Elastic Load Balancing, CloudFront, or API Gateway." Fine
  here; the CloudFront certificate is a different, existing, free one.
- **Price:** from the ACM pricing page, tiered per domain per month, first 1,000 FQDNs at **$1.00 per
  domain**. So about $1 a month for one name, "Charged again at each automatic renewal (valid max 45 days)".
  Read literally that is $1 per issuance, and with 45-day certs renewed on the usual two-thirds schedule
  that is roughly $1 a month. Treat $1/month as the planning figure.

So the ordering on the fallback path is: **ACM ACME at about $1/month with no Route 53 IAM at all**, then
Let's Encrypt at $0 with a scoped Route 53 role, then ACM exportable at $7 per issuance. ACM ACME buys away
the entire IAM question in section 5.3 for a dollar.

Sources: https://docs.aws.amazon.com/acm/latest/userguide/acm-acme.html and
https://aws.amazon.com/certificate-manager/pricing/ (retrieved 2026-08-17)

### 5.3 Let's Encrypt via DNS-01 against Route 53: exactly what is and is not scopeable

**The minimum permission set** is three actions, from the `certbot-dns-route53` plugin's own documentation:

```json
{
    "Version": "2012-10-17",
    "Id": "certbot-dns-route53 sample policy",
    "Statement": [
        {
            "Effect": "Allow",
            "Action": [
                "route53:ListHostedZones",
                "route53:GetChange"
            ],
            "Resource": ["*"]
        },
        {
            "Effect": "Allow",
            "Action": ["route53:ChangeResourceRecordSets"],
            "Resource": ["arn:aws:route53:::hostedzone/YOURHOSTEDZONEID"]
        }
    ]
}
```

**Can `ChangeResourceRecordSets` be scoped to a single record name rather than the whole zone? Yes.** Route
53 has three service-specific condition keys for exactly this, documented in "Resource record set
permissions":

> With the IAM policy conditions, `route53:ChangeResourceRecordSetsNormalizedRecordNames`,
> `route53:ChangeResourceRecordSetsRecordTypes`, and `route53:ChangeResourceRecordSetsActions`, you can grant
> granular administrative rights ... This allows you to grant someone permissions to:
> + A single resource record set.
> + All resource record sets of a specific DNS record type.
> + Resource record sets where the names contain a specific string.
> + Perform any, or all of the `CREATE | UPSERT | DELETE` actions

The three keys, from the condition key table:

| Key | Applies to | Type |
|---|---|---|
| `route53:ChangeResourceRecordSetsNormalizedRecordNames` | `ChangeResourceRecordSets` | Multi-valued |
| `route53:ChangeResourceRecordSetsRecordTypes` | `ChangeResourceRecordSets` | Multi-valued |
| `route53:ChangeResourceRecordSetsActions` | `ChangeResourceRecordSets` | Multi-valued |

**Normalization rules, which are mandatory and easy to get wrong:**

> **For `route53:ChangeResourceRecordSetsNormalizedRecordNames`:**
> + All letters must be lowercase.
> + The DNS name must be without the trailing dot.
> + Characters other than a-z, 0-9, - (hyphen), \_ (underscore), and . (period, as a delimiter between
>   labels) must use escape codes in the format \\three-digit octal code. For example, `\052` is the octal
>   code for character \*.

A DNS-01 challenge writes and deletes a `TXT` record at `_acme-challenge.<name>`. So the scoped policy for a
single origin hostname is:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": "route53:ChangeResourceRecordSets",
      "Resource": "arn:aws:route53:::hostedzone/ZONEID",
      "Condition": {
        "ForAllValues:StringEquals": {
          "route53:ChangeResourceRecordSetsNormalizedRecordNames": ["_acme-challenge.api-origin.phillip-nguyen.dev"],
          "route53:ChangeResourceRecordSetsRecordTypes": ["TXT"],
          "route53:ChangeResourceRecordSetsActions": ["CREATE", "UPSERT", "DELETE"]
        }
      }
    }
  ]
}
```

`ForAllValues:StringEquals` is the correct operator and AWS explains why: "The condition in the policy above
will allow the operation only when **all** changes in `ChangeResourceRecordSets` have the DNS name of
example.com." AWS also advises against inverting this into a Deny: "we recommend that you avoid using
deny-based policies because they are difficult to write correctly ... This is especially true for Route 53
due to text normalization that is required."

**What is not scopeable, stated plainly:**

- `route53:ListHostedZones` takes no resource and no condition key. It must be `"Resource": ["*"]`. The
  instance's role can therefore enumerate every hosted zone name and ID in the account. There is exactly one
  zone here, so the leak is nil, but it is not zero-privilege.
- `route53:GetChange` operates on `arn:aws:route53:::change/*` and has no condition key. Not scopeable.
- Route 53 has **no tag-based condition keys**: "Route 53 doesn't support tag-based condition keys."
- Route 53 supports **only identity-based policies**: "Amazon Route 53 doesn't support attaching policies to
  resources." So there is no zone-side policy to add as a second layer.
- One stale page to ignore. The Route 53 "Overview of managing access permissions" page still says "There
  are no condition keys specific to Route 53" and "You can't grant or deny access to ... Individual records".
  That is contradicted by the dedicated "Resource record set permissions" and "Using IAM policy conditions
  for fine-grained access control" pages, which document the three keys with worked examples. The
  fine-grained pages are the current ones. Noting the contradiction so nobody reads the stale page and
  concludes it cannot be done.

Sources: https://certbot-dns-route53.readthedocs.io/en/stable/ (retrieved 2026-08-17),
https://docs.aws.amazon.com/Route53/latest/DeveloperGuide/resource-record-sets-permissions.html,
https://docs.aws.amazon.com/Route53/latest/DeveloperGuide/specifying-conditions-route53.html,
https://docs.aws.amazon.com/Route53/latest/DeveloperGuide/access-control-overview.html

### 5.4 The simplest option of all

**Use a VPC origin and need no certificate.** Section 4.3. Every option above costs either money, an IAM
role with an unscopeable action on the account's only hosted zone, or a renewal job on a box you would
rather not log into. The VPC origin path deletes the entire question.

---

## 6. Tailscale on the EC2 instance

### 6.1 What `tailscaled` needs outbound

Quoted from Tailscale's firewall ports FAQ, last validated by Tailscale 2026-02-02, retrieved 2026-08-17:

> Most of the time, you **don't need to open any firewall ports** for Tailscale.

For outbound, the four rules Tailscale asks for:

> Let your internal devices start TCP connections to `*:443`. Connections to the coordination server and
> other backend systems and data connections to the DERP relays use HTTPS on port 443. The set of DERP
> relays, in particular, grows over time. We recommend `*:443` because attempting to enumerate the set of
> permitted destinations is almost certain to break your connectivity in the future in ways which won't
> immediately resemble a firewall issue.

> Let your internal devices start UDP **from** `:41641` to `*:*`. Direct WireGuard tunnels use UDP with a
> source port that defaults to `41641`.

> Let your internal devices start UDP to `*:3478`. The STUN protocol lets a machine behind NAT ask a machine
> on the open internet what IP address it sees ... `tailscaled` only sends STUN to DERP servers, but the set
> of DERP servers expands over time so we recommend `*:3478` in the rule.

> Let your internal devices start HTTP (TCP) connections to `*:80`. Connections to the coordination server
> prefer to use HTTP on port 80 with an efficient encrypted transport. However, if the coordination server
> doesn't respond on this port, the client will fall back to using HTTPS on port 443. ... It is not mandatory
> to permit these connections, and you can choose to drop them in your firewall rules, resulting in a
> timeout. If disabled, clients might experience delays when connecting to Tailscale and captive portal
> detection won't function properly.

**Can it run with a restrictive egress security group?** Yes, with an honest caveat. A minimal working egress
group is:

| Direction | Protocol | Port | Destination | Why |
|---|---|---|---|---|
| Egress | TCP | 443 | `0.0.0.0/0` | Coordination server and DERP relays |
| Egress | UDP | 3478 | `0.0.0.0/0` | STUN, to DERP servers only |
| Egress | UDP | 41641 | `0.0.0.0/0` | Direct WireGuard, if a direct path exists |
| Egress | TCP | 80 | `0.0.0.0/0` | Optional. Faster control-plane connect, captive portal detection |

The caveat: a security group filters by CIDR or prefix list, never by DNS name, and Tailscale explicitly
warns against pinning IPs, so all four rules go to `0.0.0.0/0`. What you are actually restricting is
**ports**, not destinations. That is still worth doing (it stops a compromised proxy from exfiltrating over
arbitrary ports, and it stops it reaching the Postgres or SMTP port of anything), but do not describe it as
"locked down to Tailscale" in the Terraform comment, because it is not.

Tailscale does publish static ranges if IP-based rules are unavoidable: control plane IPv4 `192.200.0.0/24`,
IPv6 `2606:B740:49::/48`; logging IPv4 `199.165.136.0/24`, IPv6 `2606:B740:1::/48`. But those cover the
control plane only, not DERP, so a DERP-relayed connection would break. Do not use them.

Also worth planning for: the EC2 instance is behind AWS's NAT-free public addressing and the homelab is
behind residential NAT. If a direct path cannot be established, the connection falls back to DERP and pays a
relay hop, which adds latency to every `/api/*` request. `tailscale status` reports `direct` or
`relay <city>` per peer, and that check belongs in the runbook.

Source: https://tailscale.com/kb/1082/firewall-ports

### 6.2 AWS EC2 guidance and arm64

**There is official guidance**, at https://tailscale.com/kb/1021/install-aws. It is written around a subnet
router, which is more than this design needs, but the relevant posture points are there: it tells you to
allow inbound SSH only during setup and then "once your EC2 instance is available over Tailscale you can
disable the open port in your public-facing firewall".

**arm64 is fully supported.** `https://pkgs.tailscale.com/stable/?mode=json`, retrieved 2026-08-17, version
1.102.2, ships static tarballs for `arm64` alongside `amd64`, `arm`, `riscv64` and others. Tailscale's own
apt and yum repositories carry arm64 packages, and the `tailscale/tailscale` container image is multi-arch.
So a Graviton `t4g` instance is not a compromise here.

### 6.3 Tag-based isolation: precisely what it does and does not enforce

This is the primary isolation control in the design, so here is the precision the brief asked for.

**It works, and the syntax is this.** Tailscale's current recommended syntax is **grants**, not the
first-generation `acls` array:

> Tailscale now secures access to resources using **grants**, a next-generation access control policy syntax.
> Grants provide **all original ACL functionality plus additional capabilities**. ACLs will continue to work
> **indefinitely** ... However, Tailscale recommends migrating to grants.

The grants structure, quoted:

```json
{
  "grants": [
    {
      "src": ["<list-of-sources>"],
      "dst": ["<list-of-destinations>"],
      "ip": ["<list-of-ports-or-protocols>"],
      "app": { "<capability-identifier>": [ { "<parameter-name>": "<parameter-value>" } ] },
      "srcPosture": ["<list-of-posture-conditions>"],
      "via": ["<list-of-routing-devices>"]
    }
  ]
}
```

`src` and `dst` both accept `tag:<tagName>`: "`tag:<tagName>` - Select all devices with a specific tag". The
documentation's own worked example is exactly the shape this design needs:

```json
{
  "grants": [
    {
      "src": ["tag:engineering"],
      "dst": ["tag:database"],
      "ip": ["tcp:5432"]
    }
  ]
}
```

For this design, with the proxy tagged `tag:proxy` and the Demo Variant's homelab node tagged `tag:demo`:

```json
{
  "tagOwners": {
    "tag:proxy": ["autogroup:admin"],
    "tag:demo":  ["autogroup:admin"]
  },
  "grants": [
    {
      "src": ["tag:proxy"],
      "dst": ["tag:demo"],
      "ip":  ["tcp:8080"]
    }
  ]
}
```

**What that enforces.** Four properties, each quoted:

- **Deny by default.** "Grants follow a deny-by-default principle, meaning access is only permitted if
  explicitly granted." Nothing else in the tailnet reaches `tag:demo` on any port.
- **Directional.** "Allowing a source to connect to a destination doesn't mean the destination can connect
  to the source (unless a policy explicitly enables it)." So `tag:demo` cannot dial back into the proxy.
  Good: it means a compromised Demo Variant cannot use the proxy as a way out.
- **Locally enforced.** "A device enforces incoming connections based on the access rules distributed to all
  devices in your tailnet. Rule enforcement happens on each device directly, without further involvement
  from Tailscale's coordination server." This is a real packet filter in `tailscaled` on the receiving node,
  not advice. It is the closest thing here to the "structural rather than a promise in a document" bar
  ticket 15 sets.
- **Tags replace user identity.** "Applying a tag to a device removes any user-based authentication."

**What it does not enforce, and this is the part to be careful about:**

1. **The default policy allows everything.** "When you first create your tailnet, the default tailnet policy
   file enables communication between all devices within the tailnet", and "in the absence of an `acls`
   section in the tailnet policy file, Tailscale applies the default allow all policy." If the Operator's
   tailnet is still on the default policy, `tag:demo` is reachable by every device on it, today. The
   isolation only exists once the policy file is edited. This is the single most likely way this control
   silently fails to exist.
2. **It does not isolate the Demo Variant from the Homelab Variant on the host.** The grant governs tailnet
   traffic between nodes. If both Variants run as containers on the same physical homelab host, they share a
   kernel, a Docker daemon, a filesystem and a root user, and section C.1 of the prior research already
   established that this is weaker than "structurally unable". A tailnet grant does nothing about
   `localhost`, Docker bridge networks, or bind mounts. To make `tag:demo` a genuinely separate node, the
   Demo Variant needs its own network identity, which in practice means its own Tailscale sidecar and its
   own container network, and ideally its own VM.
3. **It does not affect local network traffic.** "ACLs do not affect what a device can or cannot access on
   its local network." The Demo Variant's node can still reach the Operator's LAN.
4. **Tags are not free at every scale.** The Personal plan allows "Up to 50 tagged resources to start" and
   "Up to 3 ACL groups". Two tags is nowhere near either.
5. **The policy file is not in this repository.** It lives in the Tailscale admin console. That is a gap for
   a portfolio artifact whose selling point is reviewable infrastructure. Tailscale supports GitOps for the
   tailnet policy file, and checking the policy into the repo would put the design's primary isolation
   control next to the Terraform where a Reviewer can read it. Worth a ticket.

Sources: https://tailscale.com/kb/1018/acls, https://tailscale.com/docs/reference/syntax/grants,
https://tailscale.com/kb/1068/tags, https://tailscale.com/pricing (all retrieved 2026-08-17)

### 6.4 Tailscale in Docker, as a sidecar

**The supported pattern.** Tailscale's documentation covers running `tailscale/tailscale` as its own
container with a persistent state volume, and documents the environment variables. The netns-sharing sidecar
form, where another container joins the Tailscale container's network namespace, is shown in Tailscale's own
engineering blog rather than in the docs pages, so it is marked as first-party-but-not-documentation:

```yaml
services:
  ts-nginx-test:
    image: tailscale/tailscale:latest
    hostname: nginx-test
    environment:
      - TS_AUTHKEY=tskey-auth-...
      - TS_STATE_DIR=/var/lib/tailscale
    volumes:
      - ${PWD}/ts-nginx-test/state:/var/lib/tailscale
    devices:
      - /dev/net/tun:/dev/net/tun
    cap_add:
      - net_admin
      - sys_module

  nginx-test:
    image: nginx
    network_mode: service:ts-nginx-test
```

The documented (non-sidecar) form in the docs pages uses `cap_add: [net_admin, net_raw]` and no `devices`
block, because it defaults to userspace networking.

**Environment variables that matter**, from Tailscale's Docker configuration parameters page:

| Variable | What Tailscale says |
|---|---|
| `TS_AUTHKEY` | "Authenticates a container to your tailnet." |
| `TS_STATE_DIR` | "Specifies where `tailscaled` stores its state. The `TS_STATE_DIR` volume ensures the container keeps its identity across restarts" |
| `TS_HOSTNAME` | "Sets a custom hostname for your container on the tailnet" |
| `TS_EXTRA_ARGS` | "Pass other Tailscale CLI flags you want to use with the `tailscale up` command" |
| `TS_USERSPACE` | "Controls whether to use userspace networking instead of kernel networking. Enabled by default" |
| `TS_AUTH_ONCE` | "Controls login behavior. Set to false by default, which forces login every time the container starts" |
| `TS_ENABLE_HEALTH_CHECK` | "Set to true to enable an unauthenticated `/healthz` endpoint" |

And the warning that matters: "This directory must persist across container restarts or your container will
appear as a new node each time."

**How a tag gets applied via the auth key.** Two ways, and either works:

- Generate the auth key in the admin console with tags attached: "Enable Tags to automatically tag devices
  that use the auth key."
- Pass `TS_EXTRA_ARGS=--advertise-tags=tag:demo`.

The auth-key-with-tags route is preferable because of the removal limitation: "You cannot remove tags using
the `--advertise-tags` flag if the device uses an auth key. Instead, generate a new auth key with the latest
set of tags."

**Ephemeral versus persistent: use persistent here, and it matters.** Tailscale: "Ephemeral devices are
auto-removed anywhere normally from 30 to 60 minutes after the last activity." Both the proxy and the Demo
Variant node are always-on, so ephemeral is wrong for both. Tailscale's own framing agrees: devices present
four or more hours "will not count against your balance of ephemeral minutes, and will count as a standard
tagged device instead." Persistent nodes with a durable `TS_STATE_DIR` and a tagged auth key is the correct
shape, and it is also the shape that gets key expiry disabled automatically (section 8.5).

`TS_ENABLE_HEALTH_CHECK` is worth turning on for the proxy's own container health check, since the reverse
proxy being up says nothing about the tailnet being up.

Sources: https://tailscale.com/docs/features/containers/docker/docker-params,
https://tailscale.com/docs/features/containers/docker/how-to/connect-docker-container,
https://tailscale.com/kb/1111/ephemeral-nodes, https://tailscale.com/kb/1085/auth-keys,
https://tailscale.com/kb/1068/tags, and https://tailscale.com/blog/docker-tailscale-guide for the
`network_mode: service:` form (Tailscale blog, not documentation; marked accordingly)

### 6.5 Tailscale SSH with no inbound port 22

**Yes, and confirmed.** From Tailscale's own documentation, enabling it with `tailscale set --ssh`:

> generates a host key pair, shares its public half with the Tailscale control plane for distribution to
> clients, and configures `tailscaled` to intercept all traffic from your tailnet that is routed to port
> `22`.

It intercepts traffic **from the tailnet** only. Nothing needs to listen on the instance's public interface,
so the security group can have no inbound port 22 rule at all, and the AWS EC2 guide's own advice is to
remove the temporary one once Tailscale is up.

Access is granted in the `ssh` section of the policy file:

```json
{
  "action": "accept",
  "src": ["group:sre"],
  "dst": ["tag:prod"],
  "users": ["ubuntu", "root"]
}
```

**Caveats, all quoted or directly derived:**

- Server side is Linux and macOS only. That is fine for an EC2 Linux instance.
- Direction matters: "Devices with a tag-based identity can only SSH into other tagged devices; they cannot
  SSH into devices with a user-based identity." The Operator's laptop has a user identity and the instance
  is tagged, so laptop to instance works. Instance to laptop does not, which is desirable.
- "SSH rules from tagged devices cannot use check mode."
- "At this time, there is no way to configure Tailscale SSH to use a different port."
- On multi-user machines any OS user can connect using Tailscale's credentials; the mitigation is check
  mode, which is unavailable from tagged sources. On a single-purpose proxy box this is moot.
- The real caveat for this design is the bootstrap. If Tailscale fails to come up on first boot, and there
  is no inbound SSH, there is no way in except EC2 Instance Connect or the serial console. Section 8.4.

Sources: https://tailscale.com/kb/1193/tailscale-ssh, https://tailscale.com/kb/1068/tags,
https://tailscale.com/kb/1021/install-aws

---

## 7. Verified cost

All figures `us-east-1`, 730 hours a month, on-demand, tax excluded, retrieved 2026-08-17.

### 7.1 The line items

**t4g.nano, on-demand, Linux, shared tenancy.** SKU `DU8E8NJG743V3F8M`,
`"$0.0042 per On Demand Linux t4g.nano Instance Hour"`, `BoxUsage:t4g.nano`, 2 vCPU, 0.5 GiB, AWS Graviton.
Price list `AmazonEC2`, `us-east-1`, publication date `2026-08-17T20:36:27Z`.

**One in-use public IPv4 address.** `"$0.005 per In-use public IPv4 address per hour"`. Price list
`AmazonVPC`, `us-east-1`, publication date `2026-07-24T15:42:25Z`. The same list carries
`"$0.005 per Idle public IPv4 address per hour"`, so an Elastic IP left unattached bills identically. Do not
leave one lying around after a `terraform destroy` that half-succeeds.

**8 GB gp3 root volume.** `"$0.08 per GB-month of General Purpose (gp3) provisioned storage - US East (N.
Virginia)"`, SKU `JG3KUJMBRGHV3N8G`, same EC2 price list. Provisioned IOPS above baseline are
`"$0.005 per provisioned IOPS-month of gp3"` and throughput above baseline is
`"$0.04 per provisioned MiBps-month of gp3"`, but neither applies: the EBS pricing page states "All gp3
volumes include a free baseline performance of 3,000 provisioned IOPS ... and 125 provisioned MB/s
throughput." A proxy does no meaningful disk I/O.

**Data transfer out from EC2 to CloudFront: $0.00, and this is confirmed twice.**

- Price list `AWSDataTransfer`, publication date `2026-07-20T18:46:45Z`, SKU `TZPJVS2GCV8M5FXM`, usage type
  `USE1-CloudFront-Out-Bytes`: `"$0.00 per GB data transfer out of US East (Northern Virginia) to
  CloudFront"`, `PricePerUnit` `0.0000000000`.
- CloudFront pay-as-you-go pricing page: origin fetches are `"Free for origin fetches from any AWS origin
  such as Amazon Simple Storage Service (S3), Amazon Elastic Compute Cloud (EC2), or Elastic Load
  Balancers"`, and the same page extends that to `"including origins in private subnets through VPC
  origins"`.

So the zero rating holds on both the VPC origin path and the public-instance path. This mirrors what the
prior research found for S3, where every `CloudFront-Out-Bytes` row is zero.

**VPC origin charge: $0.00.** Section 2.4.

### 7.2 The arithmetic

```
t4g.nano on-demand    0.0042 x 730  =  $3.07
public IPv4 (in use)  0.005  x 730  =  $3.65
gp3 root, 8 GB        0.08   x 8    =  $0.64
EC2 -> CloudFront DTO               =  $0.00
VPC origin                          =  $0.00
                                      ------
ingress total                          $7.36 / month
```

Folding in the rest of the AWS footprint this design still carries:

```
ingress (above)                        $7.36
S3, frontend bundle                    $0.01   (from the prior research)
CloudFront                             $0.00   (always-free tier covers it)
ACM, CloudFront certificate            $0.00   (existing, non-exportable, integrated service)
Route 53 hosted zone                   ---     (pre-existing, excluded, as before)
                                      ------
                                       $7.37 / month
```

If the fallback is taken, add roughly **$1.00/month** for an ACM ACME certificate, or **$7.00 per issuance**
for an ACM exportable certificate, or **$0.00** for Let's Encrypt. Call the fallback $8.37/month at the ACM
ACME price.

### 7.3 Against the $28.49 Fargate option

```
Fargate + HTTP API + RDS + shared block   $28.49 / month   (prior research, option A1)
CloudFront + S3 + t4g.nano tailnet proxy   $7.37 / month
                                          --------
difference                                $21.12 / month cheaper, about 74 percent
```

**Two honesty notes, because these are not the same product.**

1. The $28.49 buys an AWS-hosted API and an AWS-hosted database with AWS's availability. The $7.37 buys an
   ingress box, and the API and database it fronts run on residential power and residential internet. The
   prior research's section C.3 declined to quantify residential availability and this document does the
   same. The saving is real; so is the transfer of the availability risk from AWS to the Operator's house.
2. The $7.37 design deletes RDS ($13.98), Fargate ($10.63), ECR ($0.02) and the API Gateway HTTP API and
   Cloud Map fronting ($0.20) from the bill and replaces them with $7.36 of EC2. It also deletes them from
   the Terraform, which is the portfolio cost the prior research warned about for Option C. This design gets
   some of that back, because a VPC, a subnet, a security group, an instance, a CloudFront distribution with
   two behaviours and an origin, an S3 bucket with origin access control, IAM roles, and a Budgets alarm are
   all still Terraform a Reviewer can read. It is a smaller portfolio artifact than Option A1, not an absent
   one.

### 7.4 Would a Savings Plan or Reserved Instance change this?

Retrieved from the price lists, same date:

| Commitment | Hourly | Monthly at 730 h | Saving vs on-demand |
|---|---|---|---|
| On-demand | $0.0042 | $3.07 | -- |
| Compute Savings Plan, 1yr, no upfront | $0.0030 | $2.19 | $0.88 |
| EC2 Instance Savings Plan (`t4g`), 1yr, no upfront | $0.0026 | $1.90 | $1.17 |
| Standard RI, 1yr, no upfront | $0.0026 | $1.90 | $1.17 |
| Standard RI, 1yr, all upfront | $22 upfront | $1.83 | $1.24 |
| Standard RI, 3yr, no upfront | $0.0018 | $1.31 | $1.75 |
| EC2 Instance Savings Plan (`t4g`), 3yr, all upfront | $0.0016 | $1.17 | $1.90 |
| Standard RI, 3yr, all upfront | $41 upfront | $1.14 | $1.93 |

Sources: `AmazonEC2` price list SKU `DU8E8NJG743V3F8M` reserved terms; `AWSComputeSavingsPlan` price list
`us-east-1`, publication date `2026-08-14T01:14:45Z`, rates whose `discountedSku` is `DU8E8NJG743V3F8M`.

**Answer: no, not meaningfully.** The very best case, a three-year all-upfront standard RI, saves **$1.93 a
month** and turns a $7.37 bill into $5.44. That is a 26 percent saving on a bill whose largest single line
is not the instance at all. **The public IPv4 address at $3.65 costs more than the instance at $3.07**, and
no compute commitment touches it. Committing three years to save under two dollars a month, on a demo whose
whole point is that it can be torn down and rebuilt from Terraform, is the wrong trade. Not recommending
one, as instructed, and the numbers agree.

One unverified idea that would save more than any commitment: an IPv6-only instance with an egress-only
internet gateway would remove the $3.65 public IPv4 charge entirely, and egress-only internet gateways carry
no hourly charge (there is no such line item in the `AmazonVPC` `us-east-1` price list). But VPC origins
requires IPv4 (`"IPv6 is not supported VPC private origins. With VPC origins you need private IPv4
addresses"`, CloudFront FAQ), and I did not verify that `tailscaled` can reach the coordination server and
DERP over IPv6 only. Listed in "Could not verify", not in any total.

---

## 8. Anything that bites

### 8.1 The failure mode and its latency, which is the important one

The brief flags this and it deserves the most space, because the frontend's degraded read-only mode makes
the *timing* of the failure a user-visible design parameter, not just an ops detail.

**What CloudFront returns, and when.** Three defaults compose, all quoted from the CloudFront documentation:

- **Connection attempts:** "You can specify 1, 2, or 3 as the number of attempts. The default number (if you
  don't specify otherwise) is 3."
- **Connection timeout:** "You can specify a number of seconds between 1 and 10 (inclusive). The default
  timeout (if you don't specify otherwise) is 10 seconds."
- Together: "By default, CloudFront waits as long as 30 seconds (3 attempts of 10 seconds each) before
  attempting to connect to the secondary origin or returning an error response."
- **Response timeout:** "For response timeout, the default is 30 seconds", range 1 to 120.

And the status codes:

- **502 Bad Gateway** when CloudFront cannot connect at all: "CloudFront returns a HTTP 502 status code (Bad
  Gateway) when CloudFront wasn't able to serve the requested object because it couldn't connect to the
  origin server."
- **504 Gateway Timeout** when it connects but gets no answer in time: "CloudFront will return an HTTP 504
  status code if traffic is blocked to the origin by a firewall or security group, or if the origin isn't
  accessible on the internet", or "The origin didn't respond before the request expired."

**So, mapped onto this design's three distinct failure modes:**

| What broke | What CloudFront does | What the browser sees | How long |
|---|---|---|---|
| The EC2 instance is stopped, crashed, or the proxy is not listening | Cannot establish TCP | **502** | Up to **30 s** (3 x 10 s) |
| The instance is up, the security group or the VPC origin is misconfigured, packets are dropped rather than refused | Connect hangs | **504** | Up to **30 s** connect, then the response timeout |
| The instance is up and the tailnet is up, but the **homelab is offline** | The proxy answers. What it answers is up to the proxy. | Whatever the proxy returns, most likely **502** | **Entirely determined by the proxy's own upstream timeout** |

The third row is the one the design actually hits, and it is the one the Operator controls. If the reverse
proxy has no explicit upstream timeout, or a generous default, then a dead homelab means CloudFront waits on
the proxy, the proxy waits on the tailnet, and the browser waits on both. With the CloudFront response
timeout at its 30 second default, a request can burn 30 seconds before the frontend's read-only mode
triggers, which reads as "broken", not "degraded".

**The fix is two numbers and it is free.** Set the reverse proxy's upstream connect and read timeouts to
something small, 2 to 3 seconds, so the proxy returns 502 fast and CloudFront passes it straight through.
Then optionally lower CloudFront's own `connection_attempts` to 1 or 2 and `connection_timeout` to 3 to 5
seconds, so the case where the *instance* is dead also fails fast. Both are Terraform attributes. A frontend
that flips to read-only in three seconds is a feature; one that flips after thirty is a bug report.

**And the caching wrinkle, which cuts the other way.** "CloudFront caches error responses for a default
duration of 10 seconds." So during an outage CloudFront will re-ask the origin every 10 seconds per edge
location per URL, and during a *recovery* the frontend may keep seeing the cached error for up to 10 seconds
after the homelab comes back. Ten seconds is a sane default and I would leave it, but it should be a
deliberate decision recorded next to the read-only mode's behaviour, because the two interact: if the
frontend retries faster than 10 seconds it will get the cached error and conclude the API is still down.

Sources:
https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/DownloadDistValuesOrigin.html,
https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/http-502-bad-gateway.html,
https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/http-504-gateway-timeout.html,
https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/custom-error-pages-expiration.html

### 8.2 A tailnet round trip against the CloudFront timeout

The response timeout defaults to 30 seconds and the quota allows 1 to 120. A healthy tailnet round trip from
`us-east-1` to a residential homelab is tens of milliseconds if the path is direct and rather more if it
falls back to DERP, plus the app's own query time. Thirty seconds is enormous headroom and nothing here
needs an increase.

What can go wrong is the opposite of a timeout: **the connection going quiet**. CloudFront's keep-alive
timeout to a custom or VPC origin defaults to 5 seconds, and Tailscale peer connections can transition
between direct and relayed. If the proxy holds long-lived upstream connections to the homelab, make sure it
reconnects rather than reusing a dead socket after a path change. This is a reverse-proxy configuration
concern, not an AWS one, but it is the kind of thing that produces one 502 every few hours and no
explanation.

### 8.3 Instance patching, and the thing that makes it worse

A t4g.nano running a reverse proxy is a long-lived internet-adjacent Linux box that nobody logs into. That is
the classic unpatched-forever machine. Two options, both fine:

- Unattended upgrades on the distro (Ubuntu's `unattended-upgrades`, or Amazon Linux with `dnf-automatic`).
  Cheap, no AWS dependency, and the security-only channel makes reboots rare.
- AWS Systems Manager Patch Manager, which is more Terraform and more IAM but is auditable and shows up in
  the portfolio artifact.

The thing that makes it worse here: **a kernel update needs a reboot, and after a reboot the box has no
inbound SSH.** If Tailscale fails to come up, the machine is unreachable by design. Whatever is chosen,
`tailscaled` must be enabled as a boot service with its state persisted, and the recovery path must be
written down before it is needed. EC2 Instance Connect and the EC2 serial console both work with no inbound
port 22 and no Tailscale, and one of them belongs in the runbook. Note that EC2 Instance Connect over the
public path needs an ingress rule from `com.amazonaws.<region>.ec2-instance-connect`, weight 2, which fits
in the 5 rules left over after the CloudFront prefix list on the fallback path.

### 8.4 The instance is a single point of failure, and what its failure looks like

It is, unambiguously. One instance, one AZ, no Auto Scaling group, no health check that does anything, no
origin group. Its failure modes:

- **Instance stop or crash:** everything under `/api/*` returns 502 after up to 30 seconds. The bundle keeps
  serving from S3 through CloudFront, so the Reviewer gets the app shell and the degraded read-only mode.
  That is a genuinely good failure shape and it is worth saying out loud, because it means the frontend
  keeps working and the demo does not go to a blank page.
- **Instance retirement or AZ event:** AWS can schedule a t4g instance for retirement. On a stop/start the
  public IPv4 address changes unless an Elastic IP is attached, and on the fallback path that silently
  breaks the origin domain name. On the VPC origin path the private IP DNS name also changes on
  stop/start-to-new-host, and the VPC origin holds the instance's **ARN**, so a replacement instance means a
  new VPC origin and a distribution update, which is 15 minutes of deployment.
- **What it does not do:** it does not take the frontend down, and it does not endanger the homelab. The
  tailnet grant is directional, so a compromised proxy can reach `tag:demo` on one TCP port and nothing else.

An Auto Scaling group of one across two AZs would fix instance retirement, but on the VPC origin path the
origin is an instance ARN, so a replacement instance breaks the VPC origin. That is a known rough edge for
this feature. Do not try to solve it with an ALB unless the $16.43 a month plus two public IPv4 addresses is
worth it, which at this traffic it is not. Accept the single point of failure, and write into the runbook
that recovery is `terraform apply`.

### 8.5 Tailscale key expiry: the good news, and the one way it still bites

**The default is 180 days and expiry is fatal:**

> The default expiration period depends on your domain setting. By default, new domains are set with an
> expiry period of 180 days.

> If reauthentication does not occur, keys expire and connections to/from the given endpoint will stop
> working.

That is precisely the silent months-later outage the brief is worried about: the demo works for six months
and then dies on a Tuesday with no deploy, no change, and no obvious cause.

**But tagging solves it automatically.** From the tags documentation:

> When you apply a tag to a device for the first time and authenticate it, the tagged device's key expiry is
> disabled by default.

> If you change the tags on the device from the admin console, Tailscale CLI, or the Tailscale API, the
> device's key expiry will not change unless you re-authenticate. After you re-authenticate, Tailscale
> disables the device's key expiry.

Since this design tags both nodes (`tag:proxy` and `tag:demo`) in order to get the isolation grant in
section 6.3, **both nodes get key expiry disabled as a side effect of the isolation control**. The two
requirements happen to line up.

**The three ways it still bites, in decreasing likelihood:**

1. **The node was authenticated as a user first and tagged afterwards without re-authenticating.** Then
   expiry is still on. The docs are explicit that changing tags does not change expiry "unless you
   re-authenticate". Anyone who brings the box up with `tailscale up` under their own account to test, then
   adds the tag later, has a 180-day fuse burning and no warning.
2. **Nobody verified it.** The fix is a 10-second check, and it belongs in the ticket's acceptance criteria,
   not in a comment: open the Machines page of the admin console and confirm both nodes read as having key
   expiry disabled. The explicit control is also there: "Select the menu at the far right and select the
   **Disable Key Expiry** option ... Done. The keys for that device will no longer expire."
3. **Recovery from an expired key on a headless box is genuinely awkward**, which is why prevention matters.
   Tailscale: "for remote devices that you've restricted to Tailscale-only traffic, signing in again without
   Tailscale access can be difficult or impossible." Their escape hatch is "Temporarily extend key", which
   gives 30 minutes, and it "only appears for devices with expired keys". And the CLI fix carries its own
   warning: "`tailscale up --force-reauth` might bring down the tailnet connection and thus should not be
   done remotely over SSH or RDP without an alternate means to log in if the connection is lost." On a box
   whose only management path is Tailscale SSH, that is a bootstrap trap.

Separately and less severely: the **auth key** used to enrol the node expires within 1 to 90 days, "If you
don't specify an expiry time, the auth key will expire after the maximum of 90 days." That does not
disconnect a running node, because "If an auth key expires, any device authorized by it remains authorized
until its node key expires." But it does mean a `terraform apply` that rebuilds the instance more than 90
days after the key was minted will fail to enrol, with an error that looks nothing like "your key expired".
Store the key in SSM Parameter Store or Secrets Manager as a `SecureString`, never in the Terraform, and put
its expiry date in a comment.

Sources: https://tailscale.com/kb/1028/key-expiry, https://tailscale.com/kb/1068/tags,
https://tailscale.com/kb/1085/auth-keys

### 8.6 Five smaller ones, found along the way

- **`use1-az3` is excluded from VPC origins**, exactly as it is excluded from RDS Proxy. Pin the subnet's AZ
  by AZ ID, not by index. A module that takes `data.aws_availability_zones.available.names[2]` will
  eventually land there and the VPC origin will simply refuse to deploy.
- **Outbound NACL rules are evaluated for VPC origin return traffic.** "Inbound NACL rules are not evaluated
  for traffic from CloudFront to your VPC origin. However, outbound NACL rules are evaluated on the return
  path and must allow traffic on ephemeral TCP ports (1024-65535) to `0.0.0.0/0`." The default NACL allows
  everything, so this only bites if someone hardens the NACL later. Worth a comment.
- **`TRUST_PROXY` must be `true` and `CORS_ORIGIN` must be the CloudFront name.** `.env.example` already says
  "On for the Demo Variant behind CloudFront", but note the subtlety this design adds: there are now **two**
  proxies in front of the API, CloudFront and the EC2 reverse proxy. The reverse proxy must append to
  `X-Forwarded-For` rather than replace it, or every visitor shares one rate-limit bucket keyed on the
  proxy's tailnet address, which is the exact failure `.env.example` warns about for the homelab case.
- **The CloudFront distribution is the single origin, so `CORS_ORIGIN` is
  `https://meal-prep.phillip-nguyen.dev`** with no port. Getting it wrong makes the app refuse its own saves,
  and `packages/api/src/config.js` deliberately has no fallback.
- **The Tailscale policy file is infrastructure that is not in the repository.** Said in section 6.3, repeated
  here because it is an operational hazard as well as a portfolio one: the primary isolation control lives in
  a web console, has no version history in git, and can be changed by anyone with tailnet admin. Tailscale
  supports GitOps for it. That is a ticket.

---

## 9. How to settle question 1 in twenty minutes

> **This was run on 2026-08-18 and it passed. You do not need to run it again.** Kept as the record of what
> was actually done, and because it is the procedure to repeat if AWS's behaviour ever changes. Results are
> in section 2.1.
>
> Two corrections from running it. The heading's twenty minutes is optimistic: the VPC origin took about
> nine minutes to deploy and the distribution took longer, and the teardown needs a further deployment cycle
> to disable the distribution before it can be deleted, so budget 45 to 60 minutes of mostly waiting. And
> step 7's shell check is avoidable: have the instance rewrite its served page with a fresh outbound `curl`
> every few seconds and put the distribution on the managed `CachingDisabled` policy, and then one fetch
> through CloudFront proves the origin path and the live egress together, with no key pair and no instance
> profile. The under-five-cents figure held.

The whole recommendation hinges on one unverified fact, so here is the smallest experiment that settles it,
by hand, before any Terraform is written.

1. Launch a t4g.nano in a **public subnet** with **auto-assign public IPv4 enabled**, in an AZ that is not
   `use1-az3`. Put anything on port 80 (`python3 -m http.server 80` is enough).
2. Give it a security group with no inbound rules at all.
3. `aws cloudfront create-vpc-origin` with the instance ARN, `HTTPPort` 80, `OriginProtocolPolicy`
   `http-only`. Wait for `Deployed`, up to 15 minutes.
4. If it reaches `Deployed`, the answer is yes. If it fails, read the error; a subnet-type rejection would
   say so.
5. Add the service-managed security group `CloudFront-VPCOrigins-Service-SG` as an inbound source on port 80.
6. Create a distribution with that VPC origin and fetch a file through it.
7. From the instance, `curl https://controlplane.tailscale.com` to confirm egress still works.
8. `aws cloudfront delete-vpc-origin`, terminate, done. Cost of the experiment: under five cents.

If step 4 or 6 fails, take the fallback in section 3, and budget the certificate.

---

## 10. Assumptions used

1. **Region `us-east-1`**, account `<account>`, consistent with the prior research and required for the
   CloudFront certificate.
2. **730 hours a month** for everything hourly.
3. **One t4g.nano, one AZ, one public IPv4 address, one 8 GB gp3 root volume.** 8 GB is the assumed root
   size; Amazon Linux 2023 and Ubuntu minimal both fit comfortably. Each extra GB is $0.08 a month.
4. **The instance runs only a reverse proxy and `tailscaled`.** No application code, no database client, no
   container registry pulls beyond the Tailscale image if the Docker form is used.
5. **The Demo Variant's API and Postgres run on the homelab**, so no RDS, no Fargate, no ECR appear in this
   design's bill. This is what makes the $7.37 versus $28.49 comparison a comparison of two architectures
   rather than of two line items.
6. **Traffic is negligible**, consistent with the prior research's 50,000 requests a month. Every
   request-priced and per-GB line here is zero or free-tier covered, so a tenfold traffic error changes no
   conclusion.
7. **All prices are steady-state**, with 12-month free-tier offers deliberately excluded and only
   always-free allowances counted, exactly as the prior research did. In particular the 750 free public IPv4
   hours a month are a 12-month legacy offer, so the $3.65 stands.
8. **All figures exclude tax.**
9. **The Operator's tailnet is on the free Personal plan.** Tailscale's pricing page, retrieved 2026-08-17,
   lists Personal at "$0 Free forever" with "Up to 6 users", unlimited user devices, "Up to 3 ACL groups"
   and "Up to 50 tagged resources to start". Two tags and two tagged nodes are far inside that.
10. **The reverse proxy is Caddy, nginx, or similar.** Nothing in this document depends on which, except
    that section 8.1's fix requires it to have configurable upstream timeouts, which all of them do.

---

## 11. Could not verify

Listed explicitly rather than papered over. Entries 1 and 2 were the important ones, and both have since
been settled by running the section 9 test; they are kept in place, marked resolved, so the numbering and
the audit trail survive. Entries 3 onward remain open.

1. ~~**Whether CloudFront VPC origins formally supports a resource in a public subnet.**~~ **Resolved
   2026-08-18: yes, in practice.** Observations in section 2.1. The original entry read: this is the central unknown and the honest answer is that AWS does
   not say. Everything in the marketing and in the prerequisites heading says "private subnet". The one
   piece of positive first-party evidence is the migration procedure's final step, "Remove public access to
   your VPC origin by making the subnet private", which is only coherent if the VPC origin was already
   working while the subnet was public. Supporting but circumstantial: `CreateVpcOrigin` takes an instance
   ARN and no subnet parameter, and the origin domain is the instance's private DNS name, which a
   public-subnet instance also has. I found no AWS statement, no API error documentation, and no quota or
   limitation page that either permits or forbids it. **That last part is still true after the test.** The
   behaviour was confirmed; the documentation was not changed by confirming it, so the fallback in section 3
   stays documented against the day AWS starts enforcing the heading.
2. ~~**Whether the instance retains internet gateway egress while serving as a VPC origin.**~~ **Resolved
   2026-08-18: yes.** Observed live through the distribution during the same test, see section 2.2. The
   original entry read: reasoned rather than quoted. VPC origins adds a service-managed ENI and a
   service-managed security group; it does not modify route tables, and AWS says "you don't need to update
   the routing policies." Outbound access is a route table plus public IP property. I am confident, but
   there is no sentence saying so. The confidence was justified.
3. **The exact billing treatment of CloudFront-to-VPC-origin bytes.** The `USE1-CloudFront-Out-Bytes` rate
   is $0.00 and the pricing page explicitly names VPC origins as free for origin fetches, so this is as
   verified as it can be from the price list. What I could not confirm is whether traffic over the
   service-managed ENI is metered under that same usage type at all or is simply unmetered. Either way it is
   zero.
4. **Whether ACM ACME's "$1.00 per domain" is charged per issuance or per month.** The pricing page's
   heading says "Tiered pricing per domain issued monthly" and the renewal note says "Charged again at each
   automatic renewal (valid max 45 days)". Read one way that is $1 per certificate issuance, so roughly $8 a
   year for a 45-day certificate renewed on schedule; read another way it is $1 a month. I used $1 a month
   as the conservative planning figure. It is a dollar; it changes nothing.
5. **Whether `tailscaled` works on an IPv6-only instance with no IPv4 egress.** Tailscale publishes IPv6
   ranges for its control plane and DERP servers have AAAA records, which is suggestive, but I found no
   Tailscale statement that an IPv6-only client is supported. If it is, an egress-only internet gateway
   (no hourly charge in the `AmazonVPC` price list) would remove the $3.65 public IPv4 charge, which is
   larger than any compute commitment saving in section 7.4. It would also rule out VPC origins, which
   requires IPv4. Not counted anywhere.
6. **The netns-sharing Docker sidecar form.** `network_mode: service:<tailscale-service>` appears in
   Tailscale's own engineering blog with a complete working example, but not in the documentation pages,
   which show the standalone container form instead. Marked as first-party but not documentation. The
   environment variables, the state directory requirement and the tagged-auth-key mechanism are all
   documented; only the netns-sharing composition is blog-only.
7. **Whether a direct (non-DERP) path will actually be established** between an `us-east-1` EC2 instance and
   a residential homelab behind consumer NAT. It usually will, since the EC2 side has a public address, but
   this depends on the Operator's router and cannot be established from documentation. If it falls back to
   DERP, every `/api/*` request pays a relay hop. `tailscale status` reports which.
8. **CloudWatch costs.** No log group is strictly required for this design and none is priced. If the
   instance ships logs, that is a real if tiny cost, and the free allowance is a legacy 12-month offer.
9. **Whether an Auto Scaling group of one can be made to work with a VPC origin**, given the origin holds an
   instance ARN. AWS's own re:Post has an open question on exactly this. Not investigated further because
   the recommendation is to accept the single instance.
10. **AWS EC2 instance retirement frequency for t4g instances.** No first-party rate published. Section 8.4
    treats it qualitatively.

---

## 12. What this means for the design

### 12.1 The recommendation: VPC origin first, prefix list as a documented fallback

**Take the public-subnet VPC origin. Section 9's verification was run on 2026-08-18 and it passed, so this
is now a settled recommendation rather than a conditional one.** The prefix-list-locked public instance,
with an ACM ACME certificate for a dollar a month, stays documented in section 3 as the fallback, because
the behaviour is observed rather than promised and section 3 is what you reach for if AWS ever starts
enforcing the "private subnet" heading.

The reasoning, in order of weight:

1. **It deletes the certificate problem entirely.** The CloudFront-to-origin hop is private, `http-only` is
   defensible, and there is nothing to issue, install, renew, or scope an IAM role for. Section 5 exists
   only to serve the fallback.
2. **It is a strictly better authorization story.** The service-managed security group "restricts the
   traffic only to your CloudFront distributions". The prefix list admits every CloudFront distribution in
   the world, which is why AWS pairs it with a shared-secret header, which is why the fallback needs HTTPS,
   which is why it needs a certificate. Three controls collapse into one.
3. **The security group is cleaner.** No 55-of-60 rule weight, no juggling which rules fit in the leftover
   five, no separate group for the prefix list.
4. **It is cheaper by whatever the certificate costs**, which is $0 to $12 a year. Small, but it is money
   spent to solve a problem the other option does not have.
5. **It reads better as a portfolio artifact.** A Reviewer who sees `aws_cloudfront_vpc_origin` with an
   instance in a public subnet, a security group with a single inbound rule sourced from
   `CloudFront-VPCOrigins-Service-SG`, and a comment explaining that the public IP exists solely for
   Tailscale egress and that no NAT Gateway was needed, is reading someone who understood the cost model and
   the security model at the same time. That is the thing ticket 15 is trying to demonstrate.

The one thing the VPC origin costs is the risk in "Could not verify" item 1. Section 9 retires that risk for
five cents and twenty minutes, which is why it is a verification step and not a reason to choose the other
option.

**The comment the Terraform needs**, because a Reviewer skimming for `associate_public_ip_address = true`
will flinch exactly as the prior research predicted for the Fargate task:

> This instance sits in a public subnet with a public IPv4 address for one reason: `tailscaled` must dial
> out to Tailscale's coordination servers and DERP relays, and the alternative is a NAT Gateway at $32.85 a
> month, which is four times the cost of everything else here combined. Nothing on the internet can open a
> connection to it: the only inbound rule is sourced from CloudFront's service-managed security group, which
> admits only this account's CloudFront distributions.

### 12.2 Is a certificate needed on the instance?

**On the recommended path, no. None. Not one.** CloudFront terminates viewer TLS with the platform stack's
existing free, non-exportable, ACM certificate covering `*.phillip-nguyen.dev`. The CloudFront-to-origin hop
is private and speaks HTTP. The proxy-to-homelab hop is WireGuard. There is no hop that needs a certificate
the instance would have to hold.

**On the fallback path, yes, and the order of preference is:**

1. **ACM ACME**, about $1 a month, Certbot on the instance, the private key never leaves it, and crucially
   **no Route 53 IAM at all** because an administrator pre-approves the domain out of band. 45-day
   certificates, renewed automatically.
2. **Let's Encrypt DNS-01**, $0, with the scoped policy in section 5.3. Costs nothing but gives the instance
   a role holding `route53:ListHostedZones` on `*` and `route53:GetChange` on `*`, neither of which can be
   scoped. `ChangeResourceRecordSets` scopes down to a single `_acme-challenge` `TXT` record name, which is
   as tight as Route 53 allows and is genuinely tight.
3. **ACM exportable**, $7 per issuance and per renewal, requires a **new** certificate because the existing
   one predates exportability or was requested non-exportable. Manual export and installation, so a renewal
   job the Operator has to remember. Worst of the three.

### 12.3 What the ticket and the ADRs should record

- **The runtime decision changes shape.** Ticket 15's open question was container task versus serverless
  function. In this architecture the API runs on the homelab, so neither wins; what runs on AWS is an
  ingress proxy. That is a bigger change than ticket 15 anticipated and it deserves its own ADR, because it
  changes what ticket 16 publishes and what ticket 17 cuts over into.
- **ADR-0003's status needs a decision.** The prior research established the test: does the change give the
  **Homelab Variant** public ingress? Here it does not. The homelab accepts no inbound connections; Tailscale
  dials out; the tailnet grant is directional and admits only `tag:proxy` to `tag:demo` on one port. On the
  prior research's own reasoning this is the clean case, equivalent to "a separate node holding only the
  Demo Variant", **provided the Demo Variant genuinely is a separate node with its own tagged Tailscale
  identity and not a second container sharing the Homelab Variant's netns.** If it shares a host with the
  Homelab Variant, everything section C.1 of the prior research said about shared kernels, shared Docker
  daemons and shared root still applies, and the tailnet grant does nothing about it. The tag isolation is a
  real, locally enforced packet filter between **nodes**. It is not a hypervisor.
- **The frontend's degraded read-only mode now has a latency budget.** Section 8.1. Two timeout numbers on
  the reverse proxy and two on the CloudFront origin turn a 30-second hang into a 3-second graceful
  degrade. That is a frontend requirement expressed as infrastructure configuration, and it should be
  written down somewhere both halves can see it.
- **The Tailscale policy file should be in the repository.** It is the design's primary isolation control,
  it is currently a web console setting with no version history, and Tailscale supports GitOps for it. For a
  ticket whose first acceptance box is "the Terraform reads well as a portfolio artifact", having the most
  important access-control decision live somewhere a Reviewer cannot read is a gap.
- **Two acceptance checks worth adding to ticket 15**, both ten seconds each and both preventing a silent
  months-later outage: confirm in the Tailscale admin console that both nodes show key expiry disabled, and
  confirm the tailnet policy file has a non-empty `grants` section, because the default policy allows
  everything and the isolation does not exist until it is edited.
