# Research: what the Demo Variant's API runtime actually costs

**Question.** Ticket 15 holds one decision: does the Demo Variant's API run as a container task or as a
serverless function? Every figure discussed during design was an estimate and none were checked. The
Operator also asked whether the Demo Variant could instead run for free on the existing homelab
server. This document prices three options and reports a fourth.

**Date of research:** 2026-08-17. Every AWS figure below comes from the AWS Price List API for
`us-east-1`, publication date `2026-08-12T23:47:45Z`, retrieved 2026-08-17. Non-AWS figures carry
their own retrieval date.

**Region.** All AWS prices are **US East (N. Virginia), `us-east-1`**. Nothing in the repository names a
region. `us-east-1` is picked because it is the cheapest US region for the services in question and
because the ticket already requires the CloudFront certificate to be issued there, so keeping the whole
stack in one region removes a cross-region seam from the Terraform.

**Note on sources.** The AWS pricing web pages render their tables in JavaScript and a fetcher gets an
empty table. The numbers here were pulled instead from the AWS Price List Bulk API, which is AWS's own
first-party pricing feed and is what those pages are generated from. Each figure cites the exact URL
and the `PriceDescription` string AWS ships with it.

---

## 1. Bottom line

The cheapest workable container shape costs about **$28.50 a month**. The Lambda shape, priced honestly
with RDS Proxy as the ticket's comments require, costs about **$36.00 a month**. So the serverless option
is not cheaper. It is roughly $7.50 a month more expensive, and it is the option that forces a Fastify
handler adapter and a second image entrypoint, which is the shape ADR-0002 rejects. On this evidence the
container task wins on cost and on architecture at the same time, which is a rare and comfortable place
to be.

The ticket's own framing is wrong in one specific way. It says a small single-AZ RDS Postgres "is the
entire recurring cost". It is not. RDS plus its storage is $13.98 of a $28.49 bill, which is 49 percent.
The other half is the container task, the thing in front of it, and one public IPv4 address.

The ticket's framing is right in the other way, and more strongly than it guessed. **The fronting choice
is a $24 a month swing, which is larger than the entire difference between the compute options.** An
Application Load Balancer costs $24.23 a month before it serves a single request. An API Gateway HTTP
API with a VPC link pointed at Cloud Map costs about $0.20 a month at demo traffic. Getting the fronting
right matters more than getting the runtime right.

**Option C, the homelab, is close to free and is architecturally possible but not cleanly so.** It cannot
serve `phillip-nguyen.dev` through Tailscale Funnel at all, it produces no Terraform, and the strong
form of isolation ticket 15 asks for is a hypervisor property rather than a Compose property. The
recommendation is not Option C, but the reason is portfolio value and honesty about isolation, not the
availability hand-wave.

---

## 2. Comparison table

Monthly, `us-east-1`, 730 hours. Fronting broken out as the ticket asked. Shared block is RDS, storage,
S3, ECR, CloudFront and EventBridge Scheduler; it is identical across every AWS row.

| # | Option | Compute | Fronting | Egress / public IP | Shared AWS | **Total / mo** |
|---|--------|---------|----------|--------------------|------------|----------------|
| A1 | **Fargate + HTTP API VPC link to Cloud Map, task in a public subnet** | $10.63 | **$0.20** | $3.65 | $14.01 | **$28.49** |
| A2 | Fargate + internet-facing ALB as the CloudFront origin | $10.63 | **$24.23** | $3.65 | $14.01 | **$52.52** |
| A3 | Fargate + HTTP API VPC link, task in a private subnet, NAT Gateway | $10.63 | $0.20 | $32.94 | $14.01 | **$57.78** |
| A4 | Fargate + HTTP API VPC link, private subnet, 3 interface endpoints (1 AZ) | $10.63 | $0.20 | $21.90 | $14.01 | **$46.74** |
| B1 | **Lambda + HTTP API + RDS Proxy** (the honest serverless price) | $0.00 | $0.05 | $21.90 (Proxy) | $14.01 | **$35.96** |
| B2 | Lambda + HTTP API, no Proxy, reserved concurrency instead | $0.00 | $0.05 | $0.00 | $14.01 | **$14.06** |
| C | Homelab Variant host, Cloudflare Tunnel or Tailscale Funnel | $0 | $0 | $0 | $0 | **~$0** plus electricity |
| D | Oracle Cloud Always Free (Ampere A1) | $0 | $0 | $0 | $0 | **$0**, with an idle-reclamation catch |

Row B1 places RDS Proxy in the egress column because it is the cost that exists only to make the
serverless option viable, which is the comparison the ticket asked for. Row B2 is included because it is
the number that would flatter Lambda if you stopped reading there, and because it is arguably defensible
at this traffic; section 5 argues both sides.

---

## 3. Shared AWS costs, priced once

These apply identically to Option A and Option B.

### RDS PostgreSQL, single-AZ, smallest instance

The smallest PostgreSQL instance class available in `us-east-1` is `db.t4g.micro` at 2 vCPU and 1 GiB.
Confirmed by enumerating every single-AZ on-demand PostgreSQL rate in the price list: `db.t4g.micro` at
$0.016/hr is the cheapest, ahead of `db.t3.micro` at $0.018 and `db.t2.micro` at $0.018.

- Instance: `$0.016 per hour`, `"InstanceUsage:db.t4g.micro"`, Single-AZ, PostgreSQL, No license required.
- Storage: `"$0.115 per GB-month of provisioned GP3 storage running PostgreSQL"`, Single-AZ.
- Backup beyond the free allocation: `"$0.095 per additional GB-month of backup storage exceeding free allocation running PostgreSQL"`.

Arithmetic, assuming the 20 GiB gp3 minimum and backups inside the free allocation:

```
instance   0.016 x 730 =  $11.68
storage    0.115 x 20  =   $2.30
backup                 =   $0.00
                          -------
                          $13.98
```

Source: https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/AmazonRDS/current/us-east-1/index.csv
(publication date 2026-08-12, retrieved 2026-08-17). Human-readable page:
https://aws.amazon.com/rds/postgresql/pricing/

### CloudFront

The always-free tier covers a demo completely. The pay-as-you-go page states:
`"Included in Always Free Tier: 1 TB of data transfer out to the internet per month, 10,000,000 HTTP or
HTTPS Requests per month, 2,000,000 CloudFront Function invocations per month"`. The price list carries
the matching line `"First 10 Million HTTP/S requests free each month under CloudFront free tier"`.
Beyond it, North America is $0.085/GB for the first 10 TB and $0.0100 per 10,000 HTTPS requests.

**CloudFront cost: $0.00/month.**

One wrinkle worth knowing before writing Terraform. CloudFront now also offers flat-rate plans (Free
$0/mo with 100 GB and 1 million requests, Pro $15, Business $200, Premium $1,000) alongside
pay-as-you-go. The always-free 1 TB / 10 M allowance belongs to **pay-as-you-go**, and pay-as-you-go is
still available. The flat-rate "Free" plan is a smaller allowance, not a better one. Pick pay-as-you-go.

Sources: https://aws.amazon.com/cloudfront/pricing/pay-as-you-go/ and
https://aws.amazon.com/cloudfront/pricing/ (retrieved 2026-08-17);
https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/AmazonCloudFront/current/index.csv

### S3 for the frontend bundle

- Storage: `"$0.023 per GB - first 50 TB / month of storage used"`
- PUT/POST/LIST: `"$0.005 per 1,000"`
- GET and all others: `"$0.004 per 10,000"`
- **Data transfer from S3 to CloudFront: `$0.0 per GB`.** Every `CloudFront-Out-Bytes` row in the S3 price
  list is zero. This matters because the ticket makes CloudFront the single origin.

A built bundle is a few megabytes. `0.005 GB x $0.023 = $0.0001`. Rounding up for requests and
deployment PUTs: **$0.01/month**.

Source: https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/AmazonS3/current/index.csv

### Route 53 hosted zone

`"$0.50 per Hosted Zone for the first 25 Hosted Zones"`.

The zone for `phillip-nguyen.dev` already exists and is already being paid for. Per the ticket comments
the Terraform reads it as a data source rather than managing it, so **this is a sunk cost, not a new
one**. It is not included in any total above. Records inside a zone are free; alias records pointing at
AWS resources such as a CloudFront distribution are not billed as queries.

Source: https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/AmazonRoute53/current/index.csv

### ACM certificate in us-east-1

Free, confirmed. The ACM pricing page states `"By default, ACM issues certificates at no cost for use
with services integrated with ACM"` and the pricing table lists `"Public certificate (non-exportable):
No cost"`. The ACM price list for `us-east-1` contains only AWS Private CA line items ($400/mo
general-purpose CA, $50/mo short-lived mode, $0.75/cert) and nothing for public certificates.

Caveat: ACM now charges $7 per domain for **exportable** public certificates. The CloudFront certificate
is non-exportable and used by an integrated service, so it is free.

**ACM cost: $0.00/month.** Sources: https://aws.amazon.com/certificate-manager/pricing/ and
https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/AWSCertificateManager/current/us-east-1/index.csv

### ECR image storage

`"$0.10 per GB-month of data storage"` for private repositories. The image is Node 24 Alpine plus a
production dependency tree plus the bundle, so call it 200 MB compressed with two or three tags retained.

```
0.2 GB x $0.10 = $0.02/month
```

**ECR cost: $0.02/month.** Pulling that image into a Fargate task in the same region is not charged as
data transfer. Source:
https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/AmazonECR/current/us-east-1/index.csv

### EventBridge Scheduler and the Seed restore

EventBridge Scheduler: `"$0 for the first 14 million scheduled invocations"`, then
`"$1.00 per million scheduled invocations"`. A daily Seed restore is 30 invocations a month.

**Scheduler cost: $0.00/month.**

What the schedule triggers is a separate matter. The cheapest shape is a scheduled ECS `RunTask` that
runs the same image with a different command, exactly the way `compose.yaml` runs `migrate`. A one-minute
task at 0.25 vCPU / 1 GB ARM, 30 times a month, is 0.5 vCPU-hours and 0.5 GB-hours, which is under two
cents a month. Treated as $0.01 and folded into the totals as noise.

Source: https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/AWSEvents/current/us-east-1/index.csv

### Shared block total

```
RDS instance + storage   $13.98
CloudFront                $0.00
S3                        $0.01
ECR                       $0.02
EventBridge Scheduler     $0.00
Seed restore task         $0.01
ACM                       $0.00
                         -------
                         $14.01   (Route 53 zone $0.50 excluded as pre-existing)
```

**So no, RDS is not "the entire recurring cost".** It is $13.98 of $28.49 in the cheapest workable
container shape. It is the largest single line, and it is the whole of the shared block, which is
probably what the sentence meant, but as written it understates the bill by half.

Not priced, and real: CloudWatch Logs ingestion and storage for the task's log group. At demo volume
this is cents, but it is not zero and the free allowance is legacy-only. See "Could not verify".

---

## 4. Option A: container task on AWS

### A.1 Fargate task size and price

Fargate's minimum is 0.25 vCPU with 0.5 to 2 GB of memory. The application is a long-running Fastify
server on Node 24 that also serves the frontend bundle from `@fastify/static` and holds a `pg` pool.
0.5 GB is the floor and it would probably work, but a Node 24 process with a static file handler and a
connection pool on a 512 MB container has very little headroom, and an out-of-memory kill on a demo that
must be always-on is exactly the failure the ticket is trying to avoid. **I priced 0.25 vCPU / 1 GB** and
show 0.5 GB alongside so the Operator can take the cheaper bet knowingly.

Rates, `us-east-1`:

| Usage type | Price | Description |
|---|---|---|
| `USE1-Fargate-vCPU-Hours:perCPU` | $0.04048 /hr | AWS Fargate - vCPU |
| `USE1-Fargate-GB-Hours` | $0.004445 /hr | AWS Fargate - Memory |
| `USE1-Fargate-ARM-vCPU-Hours:perCPU` | $0.03238 /hr | AWS Fargate - ARM - vCPU |
| `USE1-Fargate-ARM-GB-Hours` | $0.00356 /hr | AWS Fargate - ARM - Memory |
| `USE1-Fargate-EphemeralStorage-GB-Hours` | $0.000111 /hr | above the 20 GB included |

Source: https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/AmazonECS/current/us-east-1/index.csv
Human-readable page: https://aws.amazon.com/fargate/pricing/

Arithmetic at 730 hours:

```
x86, 0.25 vCPU / 1 GB
  vCPU   0.25 x 0.04048  x 730 =  $7.39
  memory 1.0  x 0.004445 x 730 =  $3.24
                                  ------
                                 $10.63

ARM, 0.25 vCPU / 1 GB
  vCPU   0.25 x 0.03238  x 730 =  $5.91
  memory 1.0  x 0.00356  x 730 =  $2.60
                                  ------
                                  $8.51

x86, 0.25 vCPU / 0.5 GB          =  $9.01
ARM, 0.25 vCPU / 0.5 GB          =  $7.21
```

Ephemeral storage is $0: 20 GB is included and the task writes nothing.

**Priced at $10.63 (x86, 0.25 vCPU / 1 GB).** Moving to ARM saves $2.12 a month. `node:24-alpine` publishes
an arm64 manifest so the Dockerfile would build unchanged, but the image would have to be built for
arm64 or built multi-arch, and ticket 13 records that the image does not build on the machine that opened
these tickets because the network inspects TLS. Taking the ARM saving means solving that first, so it is
listed as an option rather than baked into the headline.

### A.2 Does a VPC link to a Fargate service actually work, and what does it need?

Yes, and it does not require a load balancer. Checked in the AWS documentation rather than assumed.

From the HTTP API private integrations page: `"After you've created a VPC link V2, you can set up private
integrations that connect to an Application Load Balancer, Network Load Balancer, or resources registered
with an AWS Cloud Map service."` And specifically for ECS:
`"If you use Amazon ECS to populate entries in AWS Cloud Map, you must configure your Amazon ECS task to
use SRV records with Amazon ECS Service Discovery or turn on Amazon ECS Service Connect."`

So there are three targets, and **Cloud Map is the one that avoids a load balancer entirely**. ECS Service
Discovery registers the task's private IP into a Cloud Map service, API Gateway calls `DiscoverInstances`
to find it, and the VPC link's elastic network interfaces reach the task over its private address. No
ALB, no NLB.

Creating the VPC link itself takes only subnet IDs and security group IDs:
`aws apigatewayv2 create-vpc-link --name MyVpcLink --subnet-ids subnet-aaaa subnet-bbbb --security-group-ids sg1234 sg5678`.
Two operational notes from the same page worth carrying into the Terraform: VPC links V2 are immutable
(subnets and security groups cannot be changed after creation, so a change is a replace), and
`"If no traffic is sent over the VPC link for 60 days, it becomes INACTIVE"`, after which the first
request back has to wait a few minutes for network interfaces to be reprovisioned. For an always-on demo
that a Reviewer might hit after a quiet stretch, that 60-day timer is a real availability footgun. The
same scheduled rule that restores the Seed can be made to also curl the API, which keeps the link warm.

Sources:
https://docs.aws.amazon.com/apigateway/latest/developerguide/http-api-develop-integrations-private.html
https://docs.aws.amazon.com/apigateway/latest/developerguide/apigateway-vpc-links-v2.html
(retrieved 2026-08-17)

### A.3 Fronting cost, both options priced

**Option A1: API Gateway HTTP API + VPC link to Cloud Map**

- HTTP API requests: `"$1/million requests - API Gateway HTTP API (first 300 million)"`, usage type
  `USE1-ApiGatewayHttpRequest`.
- **VPC link: no charge found.** There is no VPC link line item anywhere in the `us-east-1` API Gateway
  price list, and the documentation pages above describe no charge. The only PrivateLink-flavoured charge
  in the API Gateway pricing page is for *private APIs*, which is a different feature. I am reporting this
  as free but flagging it in "Could not verify", because absence from a price list is weaker evidence than
  a positive statement.
- Cloud Map: `"$0.10 per resource-month"` for the one registered task instance, plus
  `"$1.00 per million API calls"` for `DiscoverInstances`.

```
HTTP API    50,000 req x $1.00/M       = $0.05
Cloud Map   1 resource x $0.10         = $0.10
Cloud Map   50,000 discovery calls     = $0.05  (worst case, no caching)
                                         ------
                                         $0.20
```

**Option A2: internet-facing Application Load Balancer as the CloudFront origin**

- `"$0.0225 per Application LoadBalancer-hour (or partial hour)"`
- `"$0.008 per used Application load balancer capacity unit-hour"`
- An ALB **must span at least two Availability Zones**: `"You must select at least two Availability Zone
  subnets. Each subnet must be from a different Availability Zone."` And
  `"The Application Load Balancer has one IP address per enabled Availability Zone."`
- Since 2024-02-01 those public addresses are billed: `"Hourly charge for In-use Public IPv4 Address
  $0.005"`, and the VPC pricing page's own worked example bills `"One Elastic load balancer with two
  in-use public IPv4 address"`.

```
ALB hours        0.0225 x 730          = $16.43
LCU              trivial traffic       =  $0.50  (estimate, see below)
public IPv4      2 x 0.005 x 730       =  $7.30
                                          ------
                                         $24.23
```

The LCU figure is the only estimated number in this section. LCUs bill on the maximum of four dimensions
(new connections, active connections, processed bytes, rule evaluations) and a demo sits far below one
LCU on all four, but AWS bills fractional LCU-hours rather than rounding to zero. $0.50 is a deliberate
over-estimate; the true figure is likely under $0.10. Even at $0.00 the ALB path is $23.73.

**The gap is $24.03 a month.** The ticket's comment that "the fronting cost is most of the gap between
the two options" is correct, and understated: the fronting gap is larger than the entire compute gap
between Fargate and Lambda.

Sources:
https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/AmazonApiGateway/current/us-east-1/index.csv
https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/AWSELB/current/us-east-1/index.csv
https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/AWSCloudMap/current/us-east-1/index.csv
https://aws.amazon.com/vpc/pricing/
https://docs.aws.amazon.com/elasticloadbalancing/latest/application/application-load-balancers.html
https://aws.amazon.com/blogs/aws/new-aws-public-ipv4-address-charge-public-ip-insights/

### A.4 NAT Gateway: does this architecture need one?

This is the hidden cost and it is bigger than everything else on the page if you get it wrong.

The ECS documentation is explicit: `"For a task on Fargate to pull a container image, the task must have
a route to the internet."` It then lists exactly three ways to satisfy that:

1. `"When using a public subnet, you can assign a public IP address to the task ENI."`
2. `"When using a private subnet, the subnet can have a NAT gateway attached."`
3. `"When using container images that are hosted in Amazon ECR, you can configure Amazon ECR to use an
   interface VPC endpoint and the image pull occurs over the task's private IPv4 address."`

Priced, all three:

**Route 1, public subnet with a public IP.** `"Hourly charge for In-use Public IPv4 Address $0.005"`.

```
1 address x 0.005 x 730 = $3.65/month
```

The ECR pull travels over the internet gateway; same-region pulls from ECR are not charged as data
transfer, and the API's responses go back out through the VPC link, not the internet gateway, so there is
no per-GB charge on this path. **$3.65/month, and this is the cheapest.**

The obvious objection is that "public subnet" sounds like it undoes the isolation story. It does not have
to. The task's security group can allow inbound only from the VPC link's security group, so nothing on
the internet can open a connection to the task even though it holds a routable address. That is a
security-group property, which is Terraform, which is reviewable, which is the kind of thing the ticket
wants a Reviewer to be able to read. Worth a comment in the Terraform explaining exactly this, because a
Reviewer skimming for `assign_public_ip = true` will flinch.

**Route 2, private subnet with a NAT Gateway.** `"$0.045 per NAT Gateway Hour"` and
`"$0.045 per GB Data Processed by NAT Gateways"`, both `us-east-1`, effective 2026-08-01.

```
hours    0.045 x 730 = $32.85
data     ~2 GB x 0.045 =  $0.09
                         ------
                         $32.94/month
```

A NAT Gateway alone costs more than the entire rest of the recommended architecture. This is the classic
hidden cost the brief warned about and it is worth writing into the Terraform as a comment so nobody adds
one later out of habit.

**Route 3, private subnet with VPC interface endpoints.** `"$0.01 per VPC Endpoint Hour"` plus
`"$0.01 per GB for upto 1 PB monthly data processed by VPC Endpoints"`. The endpoint hour is billed per
endpoint **per Availability Zone**.

The ECR documentation says which endpoints are required:
`"Amazon ECS tasks hosted on Fargate using platform version 1.4.0 or later require both Amazon ECR VPC
endpoints and the Amazon S3 gateway endpoints"`, meaning `com.amazonaws.region.ecr.dkr` and
`com.amazonaws.region.ecr.api` (both interface, both billed) plus `com.amazonaws.region.s3` (gateway,
which is free: `"There are no data processing or hourly charges for using Gateway Type VPC endpoints"`).
And if the task uses the `awslogs` driver, which it will: `"Amazon ECS tasks using the Fargate launch
type that use a VPC without an internet gateway that also use the awslogs log driver ... require that you
create the com.amazonaws.region.logs interface VPC endpoint"`.

```
3 interface endpoints x 1 AZ x 0.01 x 730 = $21.90/month
(same across 2 AZs:                          $43.80/month)
```

Cheaper than NAT, still six times the public-IP route, and it drags four extra resources into the
Terraform for no benefit a Reviewer would notice.

**Conclusion: no NAT Gateway, no interface endpoints. Public subnet, public IP, tight security group,
$3.65 a month.**

Sources:
https://docs.aws.amazon.com/AmazonECS/latest/developerguide/fargate-task-networking.html
https://docs.aws.amazon.com/AmazonECR/latest/userguide/vpc-endpoints.html
https://aws.amazon.com/vpc/pricing/
NAT rates from https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/AmazonEC2/current/us-east-1/index.csv

### A.5 Option A total

```
Fargate 0.25 vCPU / 1 GB x86      $10.63
HTTP API + VPC link + Cloud Map    $0.20
public IPv4 on the task            $3.65
shared block                      $14.01
                                  ------
                                  $28.49/month
```

On ARM at 0.5 GB it drops to $25.07. With an ALB instead of the HTTP API it rises to $52.52.

---

## 5. Option B: serverless function on AWS

### B.1 Traffic assumptions, stated and justified

A portfolio demo linked from a CV and a personal site, seen by a handful of Reviewers. I assumed:

- **200 sessions a month.** Generous. A job search generates tens of link clicks, not thousands.
- **50 API requests per session.** The app is chatty by design: load Recipes, load Ingredients, load the
  Pantry, tick Pantry items, add a Recipe, delete it, recompute Best Matches. Fifty is a full exploration,
  not a bounce.
- That is 10,000 requests a month. **I priced 50,000**, five times higher, to absorb crawlers, uptime
  checks, and one Reviewer who really likes clicking.
- **200 ms average duration at 512 MB.** A Fastify route doing one or two parameterized queries against
  Postgres in the same VPC is tens of milliseconds warm; cold starts on a Node 24 container image are
  seconds. 200 ms averaged is a reasonable blend at this request rate, and the number barely matters
  because the total is dominated by everything else.

### B.2 Lambda compute

Rates, `us-east-1`:

- `"AWS Lambda - Total Requests"`: $0.20 per million ($0.0000002 per request)
- `"AWS Lambda - Total Compute - Tier-1"` x86: $0.0000166667 per GB-second
- `"AWS Lambda - Total Compute for ARM - Tier-1"`: $0.0000133334 per GB-second
- Free tier lines exist in the price list itself: `"AWS Lambda - Requests Free Tier - 1,000,000 Requests"`
  and `"AWS Lambda - Compute Free Tier - 400,000 GB-Seconds"`

```
GB-seconds  0.5 GB x 0.2 s x 50,000 = 5,000 GB-s
compute     5,000 x 0.0000166667    = $0.083
requests    50,000 x 0.0000002      = $0.010
                                      ------
                                      $0.093/month before free tier
                                      $0.000/month after it
```

**Lambda compute is free at this traffic and would be roughly nine cents if it were not.** The free tier
here is one of the genuinely always-free ones (section 6), so unlike the RDS free tier this one can
honestly be counted.

### B.3 API Gateway fronting Lambda

Same HTTP API rate, no VPC link needed for a Lambda integration.

```
50,000 x $1.00/M = $0.05/month
```

### B.4 RDS Proxy, priced properly

The pricing unit, quoted from the AWS page: `"RDS Proxy is priced based on the capacity of underlying
instances. For provisioned instances on Amazon Aurora, Amazon RDS for PostgreSQL, Amazon RDS for MySQL,
Amazon RDS for MariaDB, and Amazon RDS for SQL Server, RDS Proxy is priced per vCPU per hour."` The same
page's pricing table carries **`Minimum Charge: 2 vCPUs`** for provisioned instances.

The rate, from the price list, is unambiguous because AWS ships the sentence with it:

> SKU `AHVT2C6WP2BB5BXQ`, `USE1-RDS:ProxyUsage`, PostgreSQL, `$0.015` per `Hrs`:
> `"$0.015 per hour per vCPU of the RDS PostgreSQL instances associated with an RDS Proxy"`

`db.t4g.micro` has 2 vCPUs, so the 2-vCPU minimum is not even binding; you pay for exactly what the
instance has.

```
2 vCPU x $0.015 x 730 = $21.90/month
```

**RDS Proxy costs 1.9 times what the database it is protecting costs.** That is the whole story of Option
B. The ticket's comment that the Proxy costs "roughly what Lambda saved" is close; in fact it costs more
than double what Fargate costs, so it does not merely erase the saving, it inverts it.

Sources: https://aws.amazon.com/rds/proxy/pricing/ (retrieved 2026-08-17, quotes taken from the page's
own markup including the `Minimum Charge` table) and the RDS price list URL above.

### B.5 Is RDS Proxy strictly necessary at this traffic, and what does AWS actually say?

AWS's own words, not paraphrased.

From the Lambda developer guide: `"You can connect a Lambda function to an Amazon Relational Database
Service (Amazon RDS) database directly and through an Amazon RDS Proxy. Direct connections are useful in
simple scenarios, and proxies are recommended for production. A database proxy manages a pool of shared
database connections which enables your function to reach high concurrency levels without exhausting
database connections."` And: `"We recommend using Amazon RDS Proxy for Lambda functions that make
frequent short database connections, or open and close large numbers of database connections."`

From the RDS planning guide: `"AWS Lambda functions can also be good candidates for using a proxy. These
functions make frequent short database connections that benefit from connection pooling offered by RDS
Proxy."` And, relevant to this exact instance size: `"For DB instances that use smaller AWS instance
classes, such as T2 or T3, using a proxy can help avoid out-of-memory conditions."`

So: **recommended, never required.** "Recommended for production" is a strong hint, and the qualifier
that matters is "to reach high concurrency levels", which a demo does not.

The cheaper mitigation AWS does not sell you is **reserved concurrency on the function**. The connection
exhaustion mechanism is one connection per concurrent execution; capping concurrency caps connections
arithmetically. `db.t4g.micro` PostgreSQL gets `max_connections` from
`LEAST({DBInstanceClassMemory/9531392}, 5000)` per the RDS quotas page, which on 1 GiB lands somewhere
around a hundred (the exact figure depends on how much RDS reserves for the OS and its management
processes, and AWS explicitly warns that on small classes `"RDS reserves a significant portion of the
available memory"`; I did not verify the exact number for `db.t4g.micro`, see "Could not verify"). Setting
reserved concurrency to 5 or 10 bounds Lambda's share to 5 or 10 connections, which is nowhere near any
plausible ceiling, and it costs nothing.

That is an honest engineering answer at 50,000 requests a month, and it is what row B2 prices at $14.06.
Two things should be said about it plainly:

1. It is a guardrail expressed in Terraform, which fits ADR-0001's posture of bounding damage by refusing
   work rather than filtering it.
2. If you accept "skip the Proxy because the traffic does not warrant it", you must accept the identical
   argument for "skip the ALB because the traffic does not warrant it", and that argument lands on
   Option A1, not on Option B. Applied consistently, the cheap-because-tiny reasoning does not favour
   serverless.

Sources: https://docs.aws.amazon.com/lambda/latest/dg/configuration-database.html
https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/rds-proxy-planning.html
https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/CHAP_Limits.html (retrieved 2026-08-17)

### B.6 Option B total, and the non-cost costs

```
Lambda compute                     $0.00   (free tier; $0.09 without)
API Gateway HTTP API               $0.05
RDS Proxy                         $21.90
shared block                      $14.01
                                  ------
                                  $35.96/month
```

Not priced and small but nonzero: RDS Proxy authenticates to the database with a Secrets Manager secret
unless you use end-to-end IAM authentication. A secret is a per-secret monthly charge plus per-API-call
charges. I did not pull Secrets Manager's rate; see "Could not verify". It is well under a dollar and does
not change any conclusion.

Two architectural notes for the record, since the ticket asked the pricing work to carry them:

- RDS Proxy's default endpoint `"is provisioned across only two Availability Zones selected from the
  proxy's configured subnets"`, so the DB subnet group must span two AZs regardless.
- `us-east-1` has an AZ restriction: `"US East (N. Virginia) Region does not support RDS Proxy in the
  use1-az3 Availability Zone."` A Terraform module that picks subnets by index rather than by AZ ID will
  eventually pick `use1-az3` and fail. Worth pinning.

Source: https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/rds-proxy.html

---

## 6. Free tier: what it is now, and whether the Operator gets anything

AWS changed the Free Tier for new accounts in 2025 and the change is material, so both cases are covered
as the brief asked. Account age is unknown here.

### The structural change

From the AWS Billing documentation, "Choosing a plan": `"When you sign up for your AWS account, you can
choose between Free plan or Paid account plan. If you are new to AWS, you receive USD $100 in credits
after you create an account regardless of your account plan. You can also earn up to an additional USD
$100 in credits by completing activities."`

**Free account plan:** `"Your free account plan ends after six months or when your credits are fully used
- whichever occurs first."` And, bluntly: `"After your free account plan expires, your account closes
automatically, and you lose access to your resources and data. AWS retains your content for 90 days
before permanently deleting your account."`

**Paid account plan:** the documentation's own comparison table grants it `"Access to Always free
services and short-term trial offers"`. Note what is absent from both columns: **the 12-months-free
tier**. It is not in the new program at all.

### Which model applies

From the AWS Free Tier announcement: `"If your AWS account was created before July 15, 2025, you'll
continue to be in the legacy Free Tier program, where you can access short-term trials, 12-month trials,
and always free tier services."` The Free Tier FAQ reinforces it: `"All the benefits of the existing Free
Tier program for existing customers will remain unchanged."`

**So:**

- **Account created before 2025-07-15:** legacy program. The 12-month offers apply, but the clock started
  at account creation. If the account is older than 12 months, which it very likely is if it predates
  July 2025, the 12-month offers have already expired and only the always-free ones remain.
- **Account created on or after 2025-07-15:** no 12-month free tier exists. Either a 6-month Free plan
  that closes the account at the end, which is disqualifying for an always-on demo, or a Paid plan whose
  only free-tier benefit is the always-free set plus short-term trials.

### What is actually always free, and does it help

| Service | Always free? | Effect on this bill |
|---|---|---|
| CloudFront | Yes: 1 TB out, 10 M requests, 2 M function invocations per month | Covers the demo entirely. Real, counted. |
| Lambda | Yes: 1 M requests, 400,000 GB-seconds per month (both appear as $0 line items in the price list) | Covers Option B's compute entirely. Real, counted. |
| EventBridge Scheduler | Yes: first 14 M scheduled invocations | Covers the Seed restore. Real, counted. |
| RDS | **No.** 750 hours of `db.t4g.micro` is a **12-month** legacy offer, not always-free | $13.98/month is the steady-state price. |
| Fargate / ECS | No always-free tier | $10.63/month stands. |
| ALB, NAT Gateway, VPC interface endpoints | No | Full price. |
| Public IPv4 | 750 hours/month is a **12-month** legacy offer | $3.65/month is the steady-state price. |
| ECR private storage | 500 MB for **one year**, not always-free | $0.02/month, immaterial either way. |
| S3 | 5 GB is a 12-month legacy offer | $0.01/month, immaterial. |

**Every number in this document is the steady-state price with 12-month offers excluded.** That is
deliberate: reporting a free-tier price as the steady-state price would set the Operator up to be
surprised in month thirteen, and the demo is meant to outlive a job search.

The $100 to $200 in credits, if the account is new and on a Paid plan, would cover roughly three to seven
months of the recommended architecture. That is a runway, not a price.

Sources (all retrieved 2026-08-17):
https://docs.aws.amazon.com/awsaccountbilling/latest/aboutv2/free-tier-plans.html
https://aws.amazon.com/free/free-tier-faqs/
https://aws.amazon.com/blogs/aws/aws-free-tier-update-new-customers-can-get-started-and-explore-aws-with-up-to-200-in-credits/
https://aws.amazon.com/about-aws/whats-new/2025/07/aws-free-tier-credits-month-free-plan/

---

## 7. Option C: run the Demo Variant on the existing homelab server

Cost is not the question here, so this section answers the four the brief posed.

### C.1 The isolation requirement

Ticket 15: *"The Demo Variant must be structurally unable to reach personal data. Isolation is a property
of the deployment, not a promise in a document."* Sorting the candidate mechanisms honestly into
structural and conventional:

**Separate Postgres containers with separate named volumes: structural, and the strongest cheap control.**
Two `postgres:17-alpine` containers, two volumes, two data directories, two processes. The Demo Variant's
`DATABASE_URL` names a host that resolves to a different container. Nothing shared. This one genuinely
holds.

**Separate databases inside one Postgres cluster: not structural, and disqualified.** PostgreSQL's own
documentation: `"Database roles are global across a database cluster installation (and not per individual
database)."` One cluster is one superuser, one process, one data directory, one set of roles. Separation
there is a `GRANT` statement, which is precisely a promise in a document. If Option C is taken, it must be
two Postgres containers, not two databases.

**Separate Docker networks: structural at the network layer, conventional at the management layer.**
Docker's documentation: `"by default, the Docker bridge driver automatically installs rules in the host
machine so that containers connected to different bridge networks can only communicate with each other
using published ports"` and `"Containers connected to the same user-defined bridge network effectively
expose all ports to each other."` Those are real iptables rules, not advice. But both stacks are managed
by one Docker daemon, and `docker network connect` re-joins them in one command with no ceremony. It is
enforced, and it is one typo from not being enforced.

**Rootless containers: hardening, not isolation.** Running the daemon as an unprivileged user shrinks the
blast radius of a container escape. It does nothing to separate the two Variants from each other. Worth
doing, does not answer the question.

**A separate virtual machine: the actual structural answer, and the one already rejected.** Separate
kernels, separate virtual NICs, separate Docker daemons, no shared control plane. This is what "a property
of the deployment" means in the strong sense. Ticket 13 records that a Proxmox rebuild was considered and
rejected because `"it replaces the host operating system, takes down an unrelated service already running
there, and does nothing for two containers"`. That reasoning was sound for two containers of one Variant.
It is less sound once the ask is hosting a public service beside personal data, because the thing it was
rejected for not providing is now the thing being asked for.

**Honest verdict.** On one host, without a hypervisor, you can build something quite good: two Postgres
containers, two volumes, two Compose projects on two networks, the Demo Variant's connection string simply
not naming the homelab database, and the Homelab Variant's port still bound to `127.0.0.1` as ticket 13
made it. What you cannot say is that the Demo Variant is *structurally unable* to reach personal data. It
is unable to reach it *as configured*. Both stacks share a kernel, a Docker daemon, a filesystem and a
root user. That is a weaker claim than the ticket makes, and the ticket's sentence is written precisely to
exclude the weaker claim.

Sources: https://www.postgresql.org/docs/17/database-roles.html
https://docs.docker.com/engine/network/drivers/bridge/ (retrieved 2026-08-17)

### C.2 The public ingress problem

ADR-0003: *"Any change that gives the homelab variant public ingress invalidates this ADR entirely and
must replace it rather than amend it."* Ticket 13 repeats it. So the crux is whether each option gives the
**Homelab Variant** public ingress, or gives a *different service on the same host* public ingress.

**Tailscale Funnel.** From Tailscale's own documentation: `"Tailscale Funnel is currently in beta."`
`"Tailscale Funnel is available for all plans"`, so the free Personal plan works. It is genuinely scoped:
it exposes one configured target, not the device. But the limitations are decisive here:

- `"Funnel can only use DNS names in your tailnet's domain (tailnet-name.ts.net)."`
- `"Funnel can only listen on ports 443, 8443, and 10000."`
- `"Funnel only works over TLS-encrypted connections."`
- `"Traffic sent over a Funnel is subject to non-configurable bandwidth limits."`

**The first bullet kills it for ticket 15 outright.** The ticket settled the demo's domain as
`phillip-nguyen.dev` in Route 53. Funnel serves only `something.tailnet-name.ts.net` and presents a
certificate for that name. A CNAME from `demo.phillip-nguyen.dev` to the `ts.net` name would produce a
certificate that does not match the requested host, so the Reviewer gets a TLS warning. There is no
supported way to put a custom domain in front of Funnel. A portfolio link that reads
`https://meal-prep.tailnet-1234.ts.net` also just reads worse.

Beta status and non-configurable bandwidth limits are secondary but real for something billed as
always-on. Tailscale's own use-case page frames Funnel around sharing demos with clients, testing webhook
receivers, and exposing dev sites for review; it does not advise against production hosting, but it does
not endorse it either.

*ADR-0003 status:* if Funnel runs on the **same node** as the Homelab Variant and targets only the Demo
Variant's port, ADR-0003 is not invalidated by its own words, because the Homelab Variant still has no
public ingress. But its safety argument silently changes from "the service is not reachable from the
internet" to "a `tailscale funnel` config points somewhere else", which is the downgrade ticket 15
refuses. If Funnel runs on a **separate node** holding only the Demo Variant, ADR-0003 is untouched.
Either way the domain problem stands.

Sources: https://tailscale.com/kb/1223/funnel and https://tailscale.com/kb/1247/funnel-serve-use-cases
(retrieved 2026-08-17)

**Cloudflare Tunnel / `cloudflared`.** Cloudflare's documentation: it lets you `"connect your resources to
Cloudflare without a publicly routable IP address"` using an `"outbound-only connection model"` where
`cloudflared` dials out, so `"you can block all inbound access except from Cloudflare itself"`. It exposes
only the hostnames and local services named in the tunnel's ingress rules. The free plan permits this use.

Two constraints to plan around:

- **The zone must be on Cloudflare.** The get-started guide states: `"Before you publish an application
  through your tunnel, you must add a website to Cloudflare"`, and Cloudflare's DNS setup documentation
  says the full setup, where Cloudflare becomes the authoritative nameserver, is `"the only one available
  for Free or Pro plans"`. `phillip-nguyen.dev` lives in Route 53, and ticket 15's comment says the
  Terraform writes records into that zone and must not destroy it. Moving the apex zone to Cloudflare
  contradicts that. The workable path is to add `demo.phillip-nguyen.dev` to Cloudflare as its own zone and
  delegate it from Route 53 with `NS` records, which keeps the apex in Route 53. That works, and it is one
  more moving part in the story a Reviewer reads.
- **Content restriction.** Cloudflare's Service-Specific Terms: `"Cloudflare reserves the right to disable
  or limit your access to or use of the CDN ... if you use or are suspected of using the CDN without such
  Paid Services to serve video or a disproportionate percentage of pictures, audio files, or other large
  files."` A JSON API and a small JavaScript bundle are nowhere near this. Noted only so it is not a
  surprise later.

*ADR-0003 status:* the same reasoning as Funnel. On a separate node, untouched. On the shared host with
ingress rules naming only the Demo Variant's port, not literally invalidated, but the ADR should be
amended to say the host now answers the public internet, because a reader who finds `cloudflared` running
next to an app with no login will otherwise draw the wrong conclusion and be right to.

Sources: https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/
https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/get-started/create-remote-tunnel/
https://developers.cloudflare.com/dns/zone-setups/full-setup/
https://www.cloudflare.com/service-specific-terms-application-services/ (all retrieved 2026-08-17)

**Port forwarding plus a reverse proxy.** This is the one the ADRs rule out, and clearly. Forwarding 443
from the router puts the **host itself** on the public internet. The only thing then standing between a
stranger and the Homelab Variant is the reverse proxy's virtual-host configuration, running on the same
machine, on the same loopback interface the Homelab Variant publishes to. Ticket 13 moved the API's
published port from every host address to `127.0.0.1` specifically so that reachability would be `"a
property of the deployment rather than a sentence in a document"`, and this undoes that. ADR-0003 also
considered and rejected `"Public ingress with a single shared password"` as putting the instance on the
public internet; port forwarding is that with no password at all in front of the reverse proxy config.

*ADR-0003 status:* **invalidated.** Not amended. ADR-0003 says such a change `"must replace it rather than
amend it"`, and this is unambiguously that change. Separately, residential CGNAT may make it impossible
without paying the ISP for a routable IPv4, which I did not investigate because the ADR question settles
it first.

### C.3 Availability, without hand-waving

The requirement is a Reviewer clicking without warning at any hour, because a dead link reads worse than
no link. Compared honestly:

**What the homelab actually risks.** Residential power with no generator. Residential internet with no
service-level agreement and no second path. A single host with no redundancy, which ticket 13 records is
already running an unrelated service, so the demo's uptime is coupled to whatever that service does and to
every reboot it causes. Host kernel updates. A Docker daemon restart. And the on-call rotation is one
person who may be asleep, at work, or on a plane precisely when a hiring manager clicks. Neither Funnel nor
Cloudflare Tunnel is troubled by a changing residential IP, since both are outbound connections, so the
dynamic-IP worry is not the real one. Power, ISP and host reboots are.

**What AWS actually risks.** It is not zero. A single-AZ RDS instance takes maintenance windows and
patching restarts. A single-task Fargate service has a gap during deployment unless the service is
configured for a rolling replacement with a healthy minimum, and at one task with a 100 percent minimum
healthy percent you need capacity for two tasks briefly. The VPC link's 60-day inactivity timeout
described in section A.2 is a genuine always-on hazard specific to this design. None of these are
residential-power sized.

**The honest gap.** I could not find a primary source quantifying residential ISP or residential power
availability, and I am not going to invent one. What can be said without a citation: the AWS option's
failure modes are known, bounded, and fixable in Terraform, while the homelab option's are external,
unbounded, and fixable only by being at home. For a link whose entire purpose is to work the first time
an unknown person clicks it, that difference is the requirement, not a nice-to-have.

**A middle path worth naming.** Nothing forces the two to be exclusive. The Demo Variant could run on the
homelab now, for free, while the Terraform is written, and cut over when it is ready. That costs nothing
and de-risks ticket 17.

### C.4 The portfolio problem

This is the real cost of the free option and it should not be softened.

Ticket 15's first acceptance box is: *"`terraform apply` from empty produces a reachable demo, and the
Terraform reads well as a portfolio artifact."* Option C fails that box completely. It produces no
Terraform, because there is no cloud infrastructure to describe. It also removes, in one move:

- The CloudFront distribution and the single-origin path routing, which is the interesting bit of the design.
- The S3 bucket and its origin access configuration.
- RDS, its subnet group, its parameter group, its security group.
- Every IAM role and policy, which is where a Reviewer actually looks to judge whether someone understands
  least privilege.
- The AWS Budgets alarm and the hard ceilings on task count and database storage, which are the concrete
  expression of ADR-0001. Without them, ADR-0001 becomes a document describing a system that does not
  exist.
- The EventBridge Scheduler rule that restores the Seed with no Operator involvement.

What survives is a Compose file, which ticket 13 already delivers, and which already demonstrates the
containerisation work. Option C therefore adds nothing to the portfolio that the repository does not
already contain, while removing the half of the demo that ticket 15 says it exists for: *"Terraform they
can read to judge the infrastructure work and not only the app."*

Put plainly: Option C saves $28.50 a month and deletes the reason the ticket was written. If the demo's
purpose were only to let someone try the app, Option C would be the obvious answer. It is not.

---

## 8. Option D: genuinely free or near-free third-party hosting

Short, as instructed, and skeptical.

**Oracle Cloud Always Free: the only one that plausibly clears the bar, with one catch.** Oracle's
documentation states `"All Oracle Cloud Infrastructure accounts (whether free or paid) have a set of
resources that are free of charge in the home region of the tenancy, for the life of the account."` The
Always Free allowance includes Ampere A1 Arm compute at 1,500 OCPU hours and 9,000 GB hours per month,
which is about 2 OCPUs and 12 GB running continuously, plus 200 GB of block storage and 10 TB of outbound
transfer per month. That comfortably runs the existing `compose.yaml` unchanged with a real public IP and
a real domain, for $0, forever.

The catch is explicit and it aims straight at this use case: **Oracle reclaims idle Always Free compute
instances.** The stated trigger is a 7-day window in which the 95th-percentile CPU utilisation is under 20
percent, network utilisation is under 20 percent, and (on A1 shapes) memory utilisation is under 20
percent. A demo that nobody visits for a week is idle by exactly that definition. There is no supported
way to be always-on and idle at the same time on Always Free; you would be manufacturing synthetic load to
keep the instance alive, which is both against the spirit of the offer and a thing that silently stops
working. Also worth noting for planning: A1 capacity availability in popular regions is widely reported to
be poor, but I could only find that in secondary sources, so treat it as unverified.

It does have one advantage over the homelab that is easy to miss: Oracle has a first-party Terraform
provider, so Option D preserves some of the "infrastructure you can read" value that Option C destroys.

Source: https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier_topic-Always_Free_Resources.htm
(retrieved 2026-08-17)

**Render: fails the always-on requirement outright, twice.** Render's own free-tier documentation:
`"Render spins down a Free web service that goes 15 minutes without receiving any inbound traffic"`, and
waking it `"takes about one minute"` with a loading page shown meanwhile. A Reviewer clicking cold waits a
minute staring at a spinner, which is arguably worse than a dead link because it looks broken rather than
absent. And: `"Free Render Postgres databases expire 30 days after creation."` Disqualified.
Source: https://render.com/docs/free (retrieved 2026-08-17)

**Railway: no free always-on tier.** The Trial plan is `"$1 of free credit per month"` plus `"a free
one-time grant of $5"`; Hobby is `$5/month` including `"$5 of resource usage per month"`. Nothing sleeps,
which is good, but a Node container plus Postgres running continuously will consume more than $5 of
resource a month, so the real cost is Hobby plus overage.
Source: https://docs.railway.com/reference/pricing/plans (retrieved 2026-08-17)

**Fly.io: no general free tier any more, and the database is expensive.** The legacy free allowances are
gone (the pricing page routes readers to a "Discontinued Plans" document). A `shared-cpu-1x` 256 MB machine
is about `$2.02/month`, which is cheap, but Managed Postgres starts at `$38.00/month` for the Basic plan
(Shared-2x CPU, 1 GB) plus `$0.28 per provisioned GB` of storage. That is more than the entire recommended
AWS architecture. Running Postgres yourself in a second Fly machine with a volume would be far cheaper but
unmanaged, which trades away the thing you were paying for.
Source: https://fly.io/docs/about/pricing/ and https://fly.io/docs/mpg/ (retrieved 2026-08-17)

**Neon (database only): free but sleeps.** Free plan is 0.5 GB storage per project and 100 compute-hours,
with `"Compute suspends automatically after inactivity (scale-to-zero); no CU-hours accrue while
suspended"`, at 5 minutes on the free plan. The first request after a suspend pays a cold start. For a
demo whose whole promise is that it works when clicked, that is a visible delay on the exact request that
matters most. Usable if paired with a warming ping; not clean.
Source: https://neon.com/pricing (retrieved 2026-08-17)

**Supabase (database only): free but pauses.** Free plan is 500 MB database and up to 2 active projects,
and `"Free projects are paused after 1 week of inactivity."` A paused project needs manual resumption.
Same failure shape as Oracle's reclamation, on a shorter fuse. Disqualified for always-on.
Source: https://supabase.com/pricing (retrieved 2026-08-17)

**Summary of Option D:** every "free" tier except Oracle's either sleeps the app, pauses the project, or
expires the database. Oracle's does none of those but reclaims the instance for being idle, which is the
same problem wearing a different hat. The pattern is consistent enough to be a finding in itself: free
always-on hosting for something that receives almost no traffic is the exact case free tiers are now
designed to exclude.

---

## 9. Assumptions used

1. **Region `us-east-1`**, consistently, for every AWS figure. Nothing in the repository specifies a
   region; `us-east-1` is the cheapest US region here and is already required for the CloudFront
   certificate.
2. **730 hours per month** for everything hourly.
3. **50,000 API requests per month**, five times my honest estimate of 200 sessions at 50 requests each,
   to absorb crawlers and monitors. Every request-priced line is so small that a tenfold error changes no
   conclusion.
4. **Fargate task at 0.25 vCPU / 1 GB, x86.** 0.5 GB is the platform minimum and is priced alongside;
   1 GB is chosen for headroom on a Node 24 process serving static files and holding a `pg` pool. ARM
   pricing is shown but not assumed, because ticket 13 records that the image does not currently build on
   the Operator's machine.
5. **RDS `db.t4g.micro`, single-AZ, 20 GiB gp3**, with automated backups inside the free allocation. 20
   GiB is the RDS minimum for gp3.
6. **Lambda at 512 MB and 200 ms average duration**, x86.
7. **One Fargate task, one Availability Zone for the task**, with the ALB comparison priced across the two
   AZs an ALB requires.
8. **ALB LCU consumption estimated at $0.50/month.** This is the only estimated figure in the document.
   The true number at demo traffic is almost certainly lower; the over-estimate is deliberate so the ALB
   comparison is not accused of being rigged.
9. **The Route 53 hosted zone is excluded from all totals** as an existing, already-paid cost, per the
   ticket's comment that the zone is a data source rather than a managed resource.
10. **Image size 200 MB in ECR**, roughly 2 GB of monthly egress attributed to the NAT scenario.
11. **All prices are steady-state**, with 12-month free-tier offers deliberately excluded and only
    always-free allowances counted.
12. **All figures exclude tax.**

---

## 10. Could not verify

Listed explicitly rather than papered over.

1. **Whether an API Gateway VPC link V2 carries any standing charge.** There is no VPC link line item
   anywhere in the `us-east-1` API Gateway price list, and neither the private-integration nor the VPC
   links V2 documentation page mentions a charge. I am treating it as free, but I could not find a
   positive first-party statement saying "VPC links for HTTP APIs are free". This is the single figure
   most worth confirming in the console's pricing calculator before `terraform apply`, because the
   recommendation partly rests on it. If it turned out to cost, say, $0.01 per hour per AZ, Option A1
   would rise by $7.30 and land at $35.79, which is a tie with Option B rather than a win.
2. **The exact `max_connections` value on `db.t4g.micro` PostgreSQL.** The formula
   `LEAST({DBInstanceClassMemory/9531392}, 5000)` is documented, but AWS also documents that
   `DBInstanceClassMemory` subtracts reserved memory and that on small classes `"RDS reserves a
   significant portion"`. A naive division gives about 112; the real figure is lower and I did not
   measure it. Nothing in the recommendation depends on the exact number, only on it being comfortably
   above single-digit reserved concurrency.
3. **Whether RDS Proxy excludes any small instance class.** I searched the RDS Proxy quotas and
   limitations page, the planning page, the concepts page and the FAQ. Instance-class exclusions for
   `db.t2.micro`, `db.t3.micro` or `db.t4g.micro` are documented nowhere I could find, so I priced Option
   B assuming `db.t4g.micro` is supported. If it is not, Option B needs a larger instance and gets more
   expensive, not less, so the conclusion is unaffected in direction.
4. **Secrets Manager cost for the RDS Proxy secret.** Not pulled. Under a dollar a month and immaterial to
   any conclusion, but it is a real line item Option B carries and Option A does not.
5. **CloudWatch Logs cost** for the Fargate task's log group or the Lambda function's. Cents at this
   volume, not zero, and the free allowance is a legacy 12-month offer rather than always-free. Not
   included in any total.
6. **Whether CloudFront can use an IPv6-only origin.** ALB now supports a
   `dualstack-without-public-ipv4` address type, which would remove the $7.30 public IPv4 charge from
   Option A2 if CloudFront can reach an IPv6-only origin. I did not verify that it can. If it can, Option
   A2 drops to about $45.22, still far behind A1.
7. **Residential internet and residential power availability.** No primary source. Section C.3 argues the
   comparison qualitatively and says so.
8. **Oracle Cloud Ampere A1 capacity availability.** Widely reported as difficult in popular regions, but
   only in secondary sources. Marked unverified.
9. **Whether Tailscale's non-configurable Funnel bandwidth limits would matter here.** Tailscale states
   the limits exist but publishes no figure. At demo traffic they almost certainly do not bind, but I
   cannot cite a number.
10. **Fly.io's current free trial allowance.** The pricing page references a free trial but routes the
    details to a separate document I did not fetch. Immaterial, since Fly's Managed Postgres price already
    rules it out.

---

## 11. What this means for ticket 15

### The runtime decision

**The evidence supports the container task, and it does so on cost as well as on architecture.**

Priced honestly, the way the ticket's own comments demand, Lambda plus RDS Proxy costs $35.96 a month and
Fargate plus an API Gateway HTTP API costs $28.49. The serverless option is about 26 percent more
expensive. It is only cheaper if you drop the Proxy, and dropping the Proxy is the flattering comparison
the ticket explicitly warned against.

This matters because it removes a tension the ticket was bracing for. ADR-0002 already argues against the
serverless shape: a Fastify handler adapter exists for one Variant only, and a Lambda container image
starts at the Runtime Interface Client rather than `node packages/api/src/server.js`, so the image forks
or grows a second entrypoint. The Operator was pricing the two options in case cost pulled the other way.
It does not. The container task runs the published image unchanged, the way ticket 03 assumed and the way
`compose.yaml` already does, and it is also the cheaper option. There is no trade to make.

Whichever way the Operator decides, the finding that should go in the ADR is the fronting one, not the
runtime one, because that is where the money is.

### Where the ticket's framing holds and where it does not

**Contradicted:** *"A small single-AZ RDS Postgres holds the data and is the entire recurring cost."*
RDS plus storage is $13.98 of $28.49, which is 49 percent. It is the largest single line and the whole of
the shared block, but the sentence as written understates the bill by half. Worth correcting in the ticket
so nobody sizes the Budgets alarm against $14.

**Supported, and more strongly than stated:** *"the fronting cost is most of the gap between the two
options."* The fronting choice is a $24.03 a month swing, larger than the entire Fargate-versus-Lambda
compute difference. This is the most important number in the document.

**Supported:** *"Lambda against RDS opens a connection per concurrent execution, which is what RDS Proxy
exists to fix, at roughly what Lambda saved."* Correct in mechanism and conservative in magnitude. The
Proxy costs $21.90 a month against a $13.98 database, so it does not merely erase Lambda's saving, it
overtakes Fargate's whole compute cost by more than double.

**New, and not anticipated by the ticket:** three things.

- **The NAT Gateway trap.** Putting the task in a private subnet costs either $32.94 a month for a NAT
  Gateway or $21.90 a month for three interface endpoints. A public subnet with one public IPv4 address
  and a security group that admits only the VPC link costs $3.65. This is the difference between a $28
  demo and a $58 one, and it is invisible until the bill arrives.
- **Public IPv4 addresses are billed now.** $0.005 per address-hour since 2024-02-01. An internet-facing
  ALB across the two AZs it is required to span carries two of them, which is $7.30 a month on top of the
  $16.43 the ALB already costs.
- **The VPC link's 60-day inactivity timeout.** A link that carries no traffic for 60 days goes
  `INACTIVE` and its network interfaces are deleted, so the next request fails and then waits minutes for
  reprovisioning. On a demo that is meant to survive a quiet stretch and then work when a Reviewer clicks,
  this is exactly the failure the always-on requirement exists to prevent. The Seed-restore schedule can
  be extended to also hit the API, which solves it for free, but it has to be a deliberate line in the
  Terraform.

### Is Option C compatible with ADR-0002?

**Yes, and this is worth stating clearly so it is not used as an argument against Option C.** ADR-0002 puts
the difference between the Variants in infrastructure and keeps it out of application code. A second
Compose project on the same host is infrastructure. The Demo Variant would run the same published image,
read the same configuration values, set `PROTECTED` on Seed rows the way the Demo Variant does anywhere,
and carry a different `CORS_ORIGIN` and a different `DATABASE_URL`. No `isDemo`, no `MODE`, no branch.
ADR-0002 is untroubled by Option C.

What Option C troubles is ADR-0002's *rationale* rather than its rule. The ADR describes the two wrappers
as "a Compose file on one side, Terraform on the other". Option C makes it Compose on both sides and
deletes the Terraform, which is not a violation but does hollow out the sentence.

### Is Option C compatible with ADR-0003?

**It depends entirely on how the public ingress is done, and the three answers are genuinely different.**

- **Port forwarding plus a reverse proxy: ADR-0003 is invalidated.** Not amended, replaced. This puts the
  host on the public internet and makes a reverse-proxy config the only thing between a stranger and the
  Homelab Variant, undoing exactly what ticket 13 achieved by binding the API to `127.0.0.1`. ADR-0003's
  final paragraph specifies the consequence: such a change "invalidates this ADR entirely and must replace
  it rather than amend it".
- **Tailscale Funnel or Cloudflare Tunnel on a separate node holding only the Demo Variant: ADR-0003 is
  untouched.** The Homelab Variant retains no public ingress and tailnet membership remains its entire
  authorization model. This is the clean version of Option C, and note that "a separate node" is the same
  answer section C.1 reached on isolation grounds, which is a useful convergence: the thing that makes the
  isolation structural is the same thing that keeps ADR-0003 intact.
- **Tailscale Funnel or Cloudflare Tunnel on the shared host, scoped to the Demo Variant's port: ADR-0003
  is not invalidated by its own words, but should be amended.** The Homelab Variant still has no public
  ingress. What changes is that the host now answers the public internet, and the Homelab Variant's safety
  now rests on an ingress rule pointing elsewhere rather than on the host being unreachable. ADR-0003's
  own consequences section already anticipates the reader problem: "A reader encountering the API will find
  endpoints that mutate data with no credential check whatsoever, which looks like a critical
  vulnerability in isolation. It is safe only because of where the service is deployed." Once the host is
  publicly reachable, "where the service is deployed" has changed, and the ADR should say so.

And the flat blocker regardless of ADR compatibility: **Tailscale Funnel cannot serve
`phillip-nguyen.dev`.** Funnel is restricted to names in the tailnet's own `ts.net` domain. Since the
ticket has settled the domain, Funnel is out on that ground alone, before any ADR question is reached.
Cloudflare Tunnel can serve a custom domain, but only by moving `demo.phillip-nguyen.dev` onto Cloudflare
as a delegated zone, which is a Route 53 change ticket 15 did not plan for.

### The recommendation, in one line

Container task on Fargate, fronted by an API Gateway HTTP API with a VPC link to Cloud Map, task in a
public subnet with a security group admitting only the VPC link, no NAT Gateway and no ALB: **$28.49 a
month**, running `node packages/api/src/server.js` from the same image as the Homelab Variant, with
ADR-0002 intact. The decision is the Operator's; this document only prices it.
