output "vpc_id" {
  description = "VPC ID"
  value       = module.network.vpc_id
}

output "database_endpoint" {
  description = "RDS PostgreSQL endpoint"
  value       = module.database.endpoint
  sensitive   = false
}

output "database_port" {
  description = "RDS PostgreSQL port"
  value       = module.database.port
}

output "database_name" {
  description = "Database name"
  value       = module.database.database_name
}

output "redis_endpoint" {
  description = "ElastiCache Redis endpoint"
  value       = module.cache.endpoint
}

output "redis_port" {
  description = "ElastiCache Redis port"
  value       = module.cache.port
}

output "s3_bucket_name" {
  description = "S3 bucket for user uploads"
  value       = module.storage.bucket_name
}

output "kms_key_id" {
  description = "KMS key ID for encryption"
  value       = module.storage.kms_key_id
}

output "kms_key_arn" {
  description = "KMS key ARN"
  value       = module.storage.kms_key_arn
}

output "cloudfront_domain" {
  description = "CloudFront distribution domain (if enabled)"
  value       = try(module.edge.cloudfront_domain, "")
}

output "alb_dns" {
  description = "ALB DNS name (if ECS enabled)"
  value       = try(module.compute.alb_dns, "")
}
