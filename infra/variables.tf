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
