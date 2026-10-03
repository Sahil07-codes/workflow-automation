# AWS Secrets Manager (scaffolded)
# Actual secrets are NOT managed by Terraform; this just defines structure

# In production, secrets are created via AWS Console or CLI
# This module can be expanded to manage secret rotation, access policies, etc.

# Placeholder for JWT keys reference
resource "aws_secretsmanager_secret" "jwt_keys" {
  name                    = "${var.project_name}/jwt/keys"
  description             = "JWT RSA key pair for ${var.environment}"
  recovery_window_in_days = 7

  tags = {
    Name = "${var.project_name}-jwt-keys"
  }
}

resource "aws_secretsmanager_secret" "database_password" {
  name                    = "${var.project_name}/database/password"
  description             = "PostgreSQL password for ${var.environment}"
  recovery_window_in_days = 7

  tags = {
    Name = "${var.project_name}-db-password"
  }
}
