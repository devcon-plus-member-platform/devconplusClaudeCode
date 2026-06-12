variable "aws_region" {
  description = "AWS region for the EC2 deployment."
  type        = string
  default     = "ap-southeast-1"
}

variable "instance_name" {
  description = "Name tag for the backend EC2 instance."
  type        = string
  default     = "devcon-plus-api"
}

variable "api_domain" {
  description = "Desired public hostname for the backend once DNS is ready."
  type        = string
  default     = "api.devcon.ph"
}

variable "ssh_public_key" {
  description = "OpenSSH public key material that will be imported as an EC2 key pair."
  type        = string
  sensitive   = true
}

variable "allowed_admin_cidr" {
  description = "CIDR allowed to SSH into the instance. Restrict this to your public IP whenever possible."
  type        = string
  default     = "0.0.0.0/0"
}

variable "subnet_id" {
  description = "Optional override for the default public subnet. Leave null to use the first default subnet in the region."
  type        = string
  default     = null
}

variable "deploy_user" {
  description = "Non-root user created by cloud-init for app deployment tasks."
  type        = string
  default     = "deploy"
}

variable "deployment_dir" {
  description = "Directory on the instance where the repo will be cloned and the backend will run."
  type        = string
  default     = "/opt/devcon-plus"
}

variable "docker_compose_version" {
  description = "Docker Compose plugin version installed during EC2 bootstrap."
  type        = string
  default     = "2.39.2"
}

variable "cloudwatch_log_retention_days" {
  description = "Retention in days for CloudWatch log groups created for the backend host."
  type        = number
  default     = 14
}

variable "github_repository" {
  description = "GitHub repository (owner/name) allowed to assume the deploy role via OIDC."
  type        = string
  default     = "devcon-plus-member-platform/devconplusClaudeCode"
}

variable "alarm_email" {
  description = "Optional email address subscribed to backend CloudWatch alarm notifications."
  type        = string
  default     = null
}
