data "aws_vpc" "default" {
  default = true
}

data "aws_subnets" "default_public" {
  filter {
    name   = "vpc-id"
    values = [data.aws_vpc.default.id]
  }

  filter {
    name   = "default-for-az"
    values = ["true"]
  }
}

data "aws_ami" "amazon_linux_2023" {
  most_recent = true
  owners      = ["amazon"]

  filter {
    name   = "name"
    values = ["al2023-ami-2023.*-x86_64"]
  }

  filter {
    name   = "architecture"
    values = ["x86_64"]
  }

  filter {
    name   = "root-device-type"
    values = ["ebs"]
  }

  filter {
    name   = "virtualization-type"
    values = ["hvm"]
  }

  filter {
    name   = "free-tier-eligible"
    values = ["true"]
  }
}

locals {
  selected_subnet_id = coalesce(var.subnet_id, sort(data.aws_subnets.default_public.ids)[0])

  common_tags = {
    Project     = "devcon-plus"
    Environment = "production"
    Owner       = "admin-david"
    ManagedBy   = "terraform"
  }
}

resource "aws_key_pair" "backend" {
  key_name   = "${var.instance_name}-key"
  public_key = var.ssh_public_key

  tags = local.common_tags
}

resource "aws_security_group" "backend" {
  name        = "${var.instance_name}-sg"
  description = "Security group for the DEVCON+ backend EC2 instance."
  vpc_id      = data.aws_vpc.default.id

  ingress {
    description = "SSH admin access"
    from_port   = 22
    to_port     = 22
    protocol    = "tcp"
    cidr_blocks = [var.allowed_admin_cidr]
  }

  ingress {
    description = "HTTP"
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  ingress {
    description = "HTTPS"
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  egress {
    description = "All outbound traffic"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = merge(local.common_tags, {
    Name = "${var.instance_name}-sg"
  })
}

resource "aws_instance" "backend" {
  ami                         = data.aws_ami.amazon_linux_2023.id
  instance_type               = "t3.micro"
  subnet_id                   = local.selected_subnet_id
  vpc_security_group_ids      = [aws_security_group.backend.id]
  key_name                    = aws_key_pair.backend.key_name
  associate_public_ip_address = true
  user_data = templatefile("${path.module}/templates/user_data.sh.tftpl", {
    deploy_user    = var.deploy_user
    deployment_dir = var.deployment_dir
  })

  metadata_options {
    http_endpoint = "enabled"
    http_tokens   = "required"
  }

  root_block_device {
    volume_type           = "gp3"
    volume_size           = 8
    delete_on_termination = true
    encrypted             = true
  }

  tags = merge(local.common_tags, {
    Name = var.instance_name
  })
}

resource "aws_eip" "backend" {
  domain   = "vpc"
  instance = aws_instance.backend.id

  tags = merge(local.common_tags, {
    Name = "${var.instance_name}-eip"
  })
}
