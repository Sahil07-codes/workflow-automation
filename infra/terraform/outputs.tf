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

output "ecr_repository_url" {
  description = "ECR repository URL for the API image."
  value       = try(module.ecs[0].ecr_repository_url, "")
}

output "ecs_cluster_name" {
  description = "ECS cluster name for the API service."
  value       = try(module.compute.cluster_name, "")
}

output "ecs_service_name" {
  description = "ECS service name for the API."
  value       = try(module.ecs[0].ecs_service_name, "")
}

output "ecs_task_execution_role_arn" {
  description = "ECS task execution role ARN; scope GitHub iam:PassRole to this and ecs_task_role_arn."
  value       = try(module.ecs[0].ecs_task_execution_role_arn, "")
}

output "ecs_task_role_arn" {
  description = "ECS API task role ARN."
  value       = try(module.ecs[0].ecs_task_role_arn, "")
}

output "api_https_url" {
  description = "Production API DNS name provisioned through Route 53."
  value       = try("https://${trimsuffix(module.ecs[0].api_domain, ".")}", "")
}
