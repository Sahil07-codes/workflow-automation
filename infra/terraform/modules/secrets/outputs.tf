output "jwt_keys_secret_arn" {
  value = aws_secretsmanager_secret.jwt_keys.arn
}

output "database_password_secret_arn" {
  value = aws_secretsmanager_secret.database_password.arn
}
