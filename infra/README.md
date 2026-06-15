# EC2 Backend Deployment

This Terraform stack provisions a small, low-cost EC2 host for the DEVCON+ NestJS backend and prepares it for a simple production-style rollout:

- EC2 `t3.micro` in `ap-southeast-1`
- `nginx` reverse proxy on `80/443`
- NestJS container bound to `127.0.0.1:8000`
- Docker Compose installed during bootstrap on Amazon Linux 2023
- CloudWatch Agent + CloudWatch alarms for a lean monitoring baseline
- Let’s Encrypt readiness for `api.devcon.ph` once DNS exists

It intentionally does **not** add heavier infrastructure yet:

- no ALB
- no CloudFront
- no autoscaling
- no WAF
- no RDS
- no ECS/ECR

## What Terraform creates

- 1 `t3.micro` EC2 instance
- 1 security group exposing only `22`, `80`, and `443`
- 1 imported EC2 key pair
- 1 attached Elastic IP
- 1 IAM role + instance profile for SSM and CloudWatch Agent
- 4 CloudWatch log groups
- 2 CloudWatch alarms
- 1 SNS topic for alarm actions
- optional email subscription for alarm notifications

## Prerequisites

- AWS CLI authenticated as `admin-david`
- Terraform installed locally
- An SSH key pair on your machine
- A restricted public IP CIDR for SSH, e.g. `203.0.113.10/32`

Generate an SSH key if needed:

```powershell
ssh-keygen -t ed25519 -C "admin-david-ec2"
```

## 1. Configure Terraform variables

Copy the example file:

```powershell
Copy-Item terraform.tfvars.example terraform.tfvars
```

Fill in:

- `ssh_public_key`: contents of your `.pub` file
- `allowed_admin_cidr`: your current public IP with `/32`
- `api_domain`: planned TLS hostname, default `api.devcon.ph`

Optional:

- `alarm_email`: email to receive CloudWatch alarm notifications
- `subnet_id`: pin a specific default public subnet

## 2. Provision or update infrastructure

```powershell
terraform init
terraform fmt -check
terraform validate
terraform plan
terraform apply
```

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

Before the domain exists, use the EC2 Elastic IP in `.env.production`:

```env
PORT=8000
NODE_ENV=production
SERVER_URL=http://<elastic-ip>
APP_URL=https://plus-beta.devcon.ph
CORS_ORIGIN=https://plus-beta.devcon.ph,https://devconplusbeta-v1.vercel.app
```

Then start the backend:

```bash
docker compose -f docker-compose.ec2.yml up -d --build
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
- after TLS: `https://api.devcon.ph/api/health`

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

Do this only after `api.devcon.ph` points to the Elastic IP.

Recommended DNS flow:

1. Create a Cloudflare `A` record for `api.devcon.ph`
2. Set it to `DNS only` first
3. Wait for DNS to resolve publicly

Then on EC2:

```bash
sudo certbot --nginx --redirect -d api.devcon.ph
sudo systemctl status certbot-renew.timer --no-pager || sudo systemctl status certbot.timer --no-pager
```

After cert issuance, update `server/.env.production`:

```env
SERVER_URL=https://api.devcon.ph
CORS_ORIGIN=https://plus-beta.devcon.ph,https://devconplusbeta-v1.vercel.app
```

Then recreate the backend:

```bash
cd /opt/devcon-plus/repo/server
docker compose -f docker-compose.ec2.yml up -d --build
```

Verify:

```bash
curl https://api.devcon.ph/api/health
```

## 8. Ongoing operations

Normal deploy/update flow:

```bash
cd /opt/devcon-plus/repo
git pull origin dev
cd server
docker compose -f docker-compose.ec2.yml up -d --build
docker compose -f docker-compose.ec2.yml ps
docker compose -f docker-compose.ec2.yml logs --tail=200
```

Safe checks after reboot:

```bash
sudo systemctl status docker --no-pager
sudo systemctl status nginx --no-pager
docker compose -f /opt/devcon-plus/repo/server/docker-compose.ec2.yml ps
curl http://127.0.0.1:8000/api/health
curl http://<elastic-ip>/api/health
```
