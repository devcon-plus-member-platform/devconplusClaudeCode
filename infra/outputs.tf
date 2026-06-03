output "instance_id" {
  description = "EC2 instance ID for the backend host."
  value       = aws_instance.backend.id
}

output "public_ip" {
  description = "Elastic IP attached to the backend instance."
  value       = aws_eip.backend.public_ip
}

output "public_dns" {
  description = "Public DNS name assigned to the backend instance."
  value       = aws_instance.backend.public_dns
}

output "ssh_command_hint" {
  description = "SSH template for the initial login. Replace the key path with your local private key file."
  value       = "ssh -i <path-to-private-key> ec2-user@${aws_eip.backend.public_ip}"
}
