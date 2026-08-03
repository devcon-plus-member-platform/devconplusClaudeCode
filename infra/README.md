# EC2 Backend Deployment

This Terraform stack provisions a small, low-cost EC2 host for the DEVCON+ NestJS backend and prepares it for a simple production-style rollout:

- EC2 `t3.small` in `ap-southeast-1`
- `nginx` reverse proxy on `80/443`
- NestJS container bound to `127.0.0.1:8000`
- Docker Compose installed during bootstrap on Amazon Linux 2023
- CloudWatch Agent + CloudWatch alarms for a lean monitoring baseline
- Let’s Encrypt readiness for `api.devcon.plus` once DNS exists

> **The app image is not built on the host.** It is pulled from GitHub Container Registry
> (`ghcr.io/devcon-plus-member-platform/devcon-plus-api`, a public package — no registry
> login required). The git clone on the box exists only to supply the `docker-compose.*.yml`
> files and the `server/.env.production` that Compose reads.

It intentionally does **not** add heavier infrastructure yet:

- no ALB
- no CloudFront
- no autoscaling
- no WAF
- no RDS
- no ECS/ECR

## What Terraform creates

- 1 `t3.small` EC2 instance
- 1 security group exposing only `22`, `80`, and `443`
- 1 imported EC2 key pair
- 1 attached Elastic IP
- 1 IAM role + instance profile for SSM and CloudWatch Agent
- 4 CloudWatch log groups
- 2 CloudWatch alarms
- 1 SNS topic for alarm actions
- optional email subscription for alarm notifications

## Prerequisites

- Terraform installed locally
- An SSH key pair on your machine
- A restricted public IP CIDR for SSH, e.g. `203.0.113.10/32`
- A **named** AWS CLI profile for the target account (see below)

### AWS accounts and profiles

The provider pins `profile = var.aws_profile` so an apply can never silently target
whichever account the shared `default` CLI profile happens to point at. Each account
gets its own named profile **and its own Terraform workspace**, so state never mixes:

| Account | Profile | Workspace | Notes |
|---------|---------|-----------|-------|
| `216833405172` (`admin-devcon`) | `devcon-target` | `devcon-target` | current home of the stack |
| `484907520476` (`admin-david`) | `devcon-current` | `default` | legacy account, being decommissioned |

```powershell
aws configure --profile devcon-target   # region: ap-southeast-1
aws sts get-caller-identity --profile devcon-target
```

Always confirm `terraform workspace show` before an apply. The workspace and the
`aws_profile` value must refer to the same account.

Generate an SSH key if needed:

```powershell
ssh-keygen -t ed25519 -C "devcon-plus-api"
```

## 1. Configure Terraform variables

Copy the example file:

```powershell
Copy-Item terraform.tfvars.example terraform.tfvars
```

Fill in:

- `ssh_public_key`: contents of your `.pub` file
- `allowed_admin_cidr`: your current public IP with `/32`
- `api_domain`: planned TLS hostname, default `api.devcon.plus`

Optional:

- `alarm_email`: email to receive CloudWatch alarm notifications
- `subnet_id`: pin a specific default public subnet

## 2. Provision or update infrastructure

```powershell
terraform init
terraform fmt -check
terraform validate

terraform workspace select devcon-target
terraform plan  -var aws_profile=devcon-target -var-file=devcon-target.tfvars -out=devcon-target.tfplan
terraform apply devcon-target.tfplan
```

`*.tfvars` files are git-ignored (they carry the SSH public key and admin CIDR);
only `terraform.tfvars.example` is tracked. State is **local** — `terraform.tfstate`
for the `default` workspace and `terraform.tfstate.d/<workspace>/` for the others.
There is no remote backend, so back these files up: losing them means losing the
ability to cleanly destroy what Terraform created.

Useful outputs after apply:

- `public_ip`
- `public_dns`
- `instance_id`
- `alarm_topic_arn`

## 3. What bootstrap does for you

On first boot, `user_data` now:

- installs Docker, nginx, git, certbot, and CloudWatch Agent
- installs Docker Compose in an Amazon Linux 2023-safe way
- enables Docker and nginx
- creates the deploy directory and non-root deploy user
- writes the nginx reverse-proxy baseline
- configures Docker and nginx log rotation
- starts CloudWatch Agent with backend log and metric collection
- enables certbot renewal if the timer unit exists

This means a fresh instance should no longer need manual Docker Compose setup.

## 4. Deploy the app

SSH in:

```powershell
ssh -i <path-to-private-key> ec2-user@<public-ip>
```

Clone and start:

```bash
sudo mkdir -p /opt/devcon-plus
sudo chown -R $USER:$USER /opt/devcon-plus
cd /opt/devcon-plus
git clone --branch dev --single-branch <your-repo-url> repo
cd repo/server
cp .env.production.example .env.production
```

Before the domain points here, use the EC2 Elastic IP in `.env.production`:

```env
PORT=8000
NODE_ENV=production
SERVER_URL=http://<elastic-ip>
APP_URL=https://devcon.plus
CORS_ORIGIN=https://devcon.plus,https://www.devcon.plus,https://staging.devcon.plus,https://devconplusbeta-v1.vercel.app
```

`.env.production` is **not in git** and is not created by Terraform. Copy it from a backup
or rebuild it from `.env.production.example`, then lock it down:

```bash
sudo chown root:root .env.production && sudo chmod 600 .env.production
```

Then start the backend — the image is pulled from GHCR, not built here:

```bash
docker compose -f docker-compose.ec2.yml pull
docker compose -f docker-compose.ec2.yml up -d
```

## 5. Smoke-test the host

On EC2:

```bash
docker compose -f docker-compose.ec2.yml ps
docker compose -f docker-compose.ec2.yml logs --tail=200
docker compose -f docker-compose.ec2.yml exec api node -e "fetch('http://127.0.0.1:8000/api/health').then(r => r.text().then(console.log))"
sudo systemctl status docker --no-pager
sudo systemctl status nginx --no-pager
sudo nginx -t
```

From your laptop:

```powershell
curl http://<public-ip>/api/health
```

Expected runtime URLs:

- before TLS: `http://<elastic-ip>/api/health`
- after TLS: `https://api.devcon.plus/api/health`

## 6. Monitoring and logs

CloudWatch Agent ships:

- `/var/log/user-data.log`
- `/var/log/nginx/devcon-plus.access.log`
- `/var/log/nginx/devcon-plus.error.log`
- `/var/lib/docker/containers/*/*.log`

CloudWatch alarms created by Terraform:

- CPU high
- status check failed

If `alarm_email` is set, confirm the SNS email subscription after apply.

Useful host logs:

```bash
docker compose -f /opt/devcon-plus/repo/server/docker-compose.ec2.yml logs -f
sudo tail -n 200 /var/log/nginx/devcon-plus.error.log
sudo tail -n 200 /var/log/user-data.log
```

## 7. TLS cutover later, once DNS exists

Do this only after `api.devcon.plus` points to the Elastic IP.

**DNS for `devcon.plus` is managed at Namecheap, not Cloudflare.** The nameservers are
`dns1.registrar-servers.com` / `dns2.registrar-servers.com` (Namecheap BasicDNS). There is
no proxy layer, so no "DNS only / proxied" toggle to worry about — the HTTP-01 challenge
reaches the instance directly.

DNS flow:

1. Namecheap → Domain List → `devcon.plus` → **Advanced DNS** → Host Records
2. Edit the `api` **A Record** to the instance's Elastic IP
3. Set TTL to `1 min` before a planned cutover so a rollback is fast
4. Wait for public resolvers to converge — verify with
   `nslookup api.devcon.plus 1.1.1.1`

Only the `api` record points at EC2. `@`, `www`, and `staging` are Vercel records for the
frontend — leave them alone.

> Expect a split window during propagation: some resolvers return the old IP and some the
> new one until caches expire. Both hosts talk to the same Supabase and Redis, so a split
> is harmless — but do not destroy the old host until every resolver has converged.

Then on EC2:

```bash
sudo certbot --nginx --redirect -d api.devcon.plus
sudo systemctl status certbot-renew.timer --no-pager || sudo systemctl status certbot.timer --no-pager
```

After cert issuance, update `server/.env.production`:

```env
SERVER_URL=https://api.devcon.plus
CORS_ORIGIN=https://devcon.plus,https://www.devcon.plus,https://staging.devcon.plus,https://devconplusbeta-v1.vercel.app
```

Then recreate the backend:

```bash
cd /opt/devcon-plus/repo/server
docker compose -f docker-compose.ec2.yml up -d --force-recreate
```

Verify:

```bash
curl https://api.devcon.plus/api/health
```

## 8. Ongoing operations

Normal deploy/update flow:

```bash
cd /opt/devcon-plus/repo
git pull origin dev
cd server
docker compose -f docker-compose.ec2.yml pull
docker compose -f docker-compose.ec2.yml up -d
docker compose -f docker-compose.ec2.yml ps
docker compose -f docker-compose.ec2.yml logs --tail=200
```

In practice you rarely run this by hand — `.github/workflows/deploy-backend-staging.yml`
performs exactly these steps over SSM on every push to `dev`. That workflow hardcodes the
account ID and `INSTANCE_ID`, so both must be updated whenever the stack moves accounts.

Safe checks after reboot:

```bash
sudo systemctl status docker --no-pager
sudo systemctl status nginx --no-pager
docker compose -f /opt/devcon-plus/repo/server/docker-compose.ec2.yml ps
curl http://127.0.0.1:8000/api/health
curl http://<elastic-ip>/api/health
```
