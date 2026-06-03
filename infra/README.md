# EC2 Backend Deployment

This directory provisions a minimal, free-tier-conscious EC2 host for the DEVCON+ NestJS backend.

## What Terraform creates

- 1 `t3.micro` EC2 instance in `ap-southeast-1`
- 1 security group exposing only `22`, `80`, and `443`
- 1 imported EC2 key pair
- 1 attached Elastic IP

It intentionally does **not** create a custom VPC, NAT gateway, ALB, Route53 records, CloudWatch alarms, or remote Terraform state.

## Prerequisites

- AWS CLI already authenticated as `admin-david`
- Terraform installed locally
- An SSH key pair on your machine

Generate one if needed:

```powershell
ssh-keygen -t ed25519 -C "admin-david-ec2"
```

## 1. Prepare Terraform variables

Copy the example vars file and fill in your key + admin IP:

```powershell
Copy-Item terraform.tfvars.example terraform.tfvars
```

- `ssh_public_key`: paste the contents of your `.pub` file
- `allowed_admin_cidr`: set this to your current public IP in CIDR form, e.g. `203.0.113.10/32`

## 2. Provision infrastructure

```powershell
terraform init
terraform fmt -check
terraform validate
terraform plan
terraform apply
```

After apply, note:

- `public_ip`
- `public_dns`
- `ssh_command_hint`

## 3. First boot and app deployment

The instance cloud-init installs Docker, Docker Compose, nginx, git, and certbot, and prepares `/opt/devcon-plus`.

SSH in:

```powershell
ssh -i <path-to-private-key> ec2-user@<public-ip>
```

Then deploy:

```bash
sudo mkdir -p /opt/devcon-plus
sudo chown -R $USER:$USER /opt/devcon-plus
cd /opt/devcon-plus
git clone <your-repo-url> repo
cd repo/server
cp .env.production.example .env.production
# Fill in real production values before starting the app
docker compose -f docker-compose.ec2.yml up -d --build
```

Smoke test:

```bash
curl http://<public-ip>/api/health
docker compose -f /opt/devcon-plus/repo/server/docker-compose.ec2.yml logs -f
```

## 4. Domain + TLS cutover

Once the public-IP smoke test passes:

1. Point `api.devcon.ph` to the Elastic IP in Cloudflare
2. SSH into the box
3. Run certbot:

```bash
sudo certbot --nginx -d api.devcon.ph
```

4. Update `server/.env.production`:
   - `SERVER_URL=https://api.devcon.ph`
   - `CORS_ORIGIN=<vercel-url>,https://plus-beta.devcon.ph`
5. Recreate the backend container:

```bash
cd /opt/devcon-plus/repo/server
docker compose -f docker-compose.ec2.yml up -d --build
```

## Notes

- The backend stays behind nginx on `127.0.0.1:8000`
- Secrets are manual in `.env.production` for v1
- Keep exactly one attached Elastic IP and one EC2 instance to stay within the intended low-cost deployment shape
