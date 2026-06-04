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

  log_group_names = {
    bootstrap    = "/devcon-plus/backend/bootstrap"
    docker       = "/devcon-plus/backend/docker"
    nginx_access = "/devcon-plus/backend/nginx/access"
    nginx_error  = "/devcon-plus/backend/nginx/error"
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

resource "aws_iam_role" "backend" {
  name = "${var.instance_name}-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Principal = {
          Service = "ec2.amazonaws.com"
        }
        Action = "sts:AssumeRole"
      },
    ]
  })

  tags = local.common_tags
}

resource "aws_iam_role_policy_attachment" "ssm" {
  role       = aws_iam_role.backend.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore"
}

resource "aws_iam_role_policy_attachment" "cloudwatch_agent" {
  role       = aws_iam_role.backend.name
  policy_arn = "arn:aws:iam::aws:policy/CloudWatchAgentServerPolicy"
}

resource "aws_iam_instance_profile" "backend" {
  name = "${var.instance_name}-instance-profile"
  role = aws_iam_role.backend.name

  tags = local.common_tags
}

resource "aws_sns_topic" "backend_alerts" {
  name = "${var.instance_name}-alerts"

  tags = local.common_tags
}

resource "aws_sns_topic_subscription" "backend_email" {
  count     = var.alarm_email == null ? 0 : 1
  topic_arn = aws_sns_topic.backend_alerts.arn
  protocol  = "email"
  endpoint  = var.alarm_email
}

resource "aws_cloudwatch_log_group" "bootstrap" {
  name              = local.log_group_names.bootstrap
  retention_in_days = var.cloudwatch_log_retention_days

  tags = local.common_tags
}

resource "aws_cloudwatch_log_group" "docker" {
  name              = local.log_group_names.docker
  retention_in_days = var.cloudwatch_log_retention_days

  tags = local.common_tags
}

resource "aws_cloudwatch_log_group" "nginx_access" {
  name              = local.log_group_names.nginx_access
  retention_in_days = var.cloudwatch_log_retention_days

  tags = local.common_tags
}

resource "aws_cloudwatch_log_group" "nginx_error" {
  name              = local.log_group_names.nginx_error
  retention_in_days = var.cloudwatch_log_retention_days

  tags = local.common_tags
}

resource "aws_instance" "backend" {
  ami                         = data.aws_ami.amazon_linux_2023.id
  instance_type               = "t3.micro"
  subnet_id                   = local.selected_subnet_id
  vpc_security_group_ids      = [aws_security_group.backend.id]
  iam_instance_profile        = aws_iam_instance_profile.backend.name
  key_name                    = aws_key_pair.backend.key_name
  associate_public_ip_address = true
  user_data = templatefile("${path.module}/templates/user_data.sh.tftpl", {
    api_domain      = var.api_domain
    compose_version = var.docker_compose_version
    deploy_user     = var.deploy_user
    deployment_dir  = var.deployment_dir
    cloudwatch_config = templatefile("${path.module}/templates/cloudwatch-agent.json.tftpl", {
      bootstrap_log_group    = local.log_group_names.bootstrap
      docker_log_group       = local.log_group_names.docker
      nginx_access_log_group = local.log_group_names.nginx_access
      nginx_error_log_group  = local.log_group_names.nginx_error
    })
    nginx_main_config = templatefile("${path.module}/templates/nginx.conf.tftpl", {})
    nginx_http_config = templatefile("${path.module}/templates/nginx-http.conf.tftpl", {
      api_domain = var.api_domain
    })
    nginx_logrotate  = templatefile("${path.module}/templates/logrotate-nginx.conf.tftpl", {})
    docker_logrotate = templatefile("${path.module}/templates/logrotate-docker.conf.tftpl", {})
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

  depends_on = [
    aws_iam_role_policy_attachment.ssm,
    aws_iam_role_policy_attachment.cloudwatch_agent,
    aws_cloudwatch_log_group.bootstrap,
    aws_cloudwatch_log_group.docker,
    aws_cloudwatch_log_group.nginx_access,
    aws_cloudwatch_log_group.nginx_error,
  ]
}

resource "aws_eip" "backend" {
  domain   = "vpc"
  instance = aws_instance.backend.id

  tags = merge(local.common_tags, {
    Name = "${var.instance_name}-eip"
  })
}

resource "aws_cloudwatch_metric_alarm" "cpu_high" {
  alarm_name          = "${var.instance_name}-cpu-high"
  alarm_description   = "Alarm when backend EC2 CPU stays elevated."
  comparison_operator = "GreaterThanOrEqualToThreshold"
  evaluation_periods  = 2
  metric_name         = "CPUUtilization"
  namespace           = "AWS/EC2"
  period              = 300
  statistic           = "Average"
  threshold           = 70
  treat_missing_data  = "notBreaching"
  alarm_actions       = [aws_sns_topic.backend_alerts.arn]
  ok_actions          = [aws_sns_topic.backend_alerts.arn]

  dimensions = {
    InstanceId = aws_instance.backend.id
  }

  tags = local.common_tags
}

resource "aws_cloudwatch_metric_alarm" "status_check_failed" {
  alarm_name          = "${var.instance_name}-status-check-failed"
  alarm_description   = "Alarm when backend EC2 status checks fail."
  comparison_operator = "GreaterThanOrEqualToThreshold"
  evaluation_periods  = 2
  metric_name         = "StatusCheckFailed"
  namespace           = "AWS/EC2"
  period              = 60
  statistic           = "Maximum"
  threshold           = 1
  treat_missing_data  = "notBreaching"
  alarm_actions       = [aws_sns_topic.backend_alerts.arn]
  ok_actions          = [aws_sns_topic.backend_alerts.arn]

  dimensions = {
    InstanceId = aws_instance.backend.id
  }

  tags = local.common_tags
}
