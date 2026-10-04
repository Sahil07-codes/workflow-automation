variable "project_name" {
  description = "Project name used for resource naming"
  type        = string
  default     = "autoapply"
}

variable "environment" {
  description = "Environment name: dev, staging, prod"
  type        = string
  validation {
    condition     = contains(["dev", "staging", "prod"], var.environment)
    error_message = "Environment must be dev, staging, or prod."
  }
}

variable "aws_region" {
  description = "AWS region (India first: ap-south-1)"
  type        = string
  default     = "ap-south-1"
}

# ============ NETWORKING ============
variable "vpc_cidr" {
  description = "CIDR block for VPC"
  type        = string
  default     = "10.0.0.0/16"
}

variable "public_subnet_cidrs" {
  description = "CIDR blocks for public subnets (one per AZ)"
  type        = list(string)
  default     = ["10.0.1.0/24", "10.0.2.0/24", "10.0.3.0/24"]
}

variable "private_subnet_cidrs" {
  description = "CIDR blocks for private subnets (one per AZ)"
  type        = list(string)
  default     = ["10.0.11.0/24", "10.0.12.0/24", "10.0.13.0/24"]
}

variable "data_subnet_cidrs" {
  description = "CIDR blocks for data subnets (databases, cache)"
  type        = list(string)
  default     = ["10.0.21.0/24", "10.0.22.0/24", "10.0.23.0/24"]
}

variable "restricted_subnet_cidr" {
  description = "CIDR for restricted subnet (scrapers, no egress)"
  type        = string
  default     = "10.0.30.0/24"
}

# ============ DATABASE ============
variable "db_name" {
  description = "PostgreSQL database name"
  type        = string
  default     = "autoapply"
  sensitive   = false
}

variable "db_username" {
  description = "PostgreSQL username"
  type        = string
  default     = "autoapply"
  sensitive   = false
}

variable "db_password" {
  description = "PostgreSQL password (should be overridden via tfvars or secrets)"
  type        = string
  sensitive   = true
}

variable "db_instance_class" {
  description = "RDS instance class (e.g., db.t4g.medium)"
  type        = string
  default     = "db.t4g.micro"  # dev; staging/prod override in tfvars
}

variable "allocated_storage" {
  description = "Allocated storage in GB"
  type        = number
  default     = 20
}

variable "backup_retention_days" {
  description = "RDS backup retention in days"
  type        = number
  default     = 7
}

variable "database_multi_az" {
  description = "Enable Multi-AZ for RDS"
  type        = bool
  default     = false  # true for prod
}

# ============ CACHE (REDIS) ============
variable "redis_node_type" {
  description = "ElastiCache node type (e.g., cache.t4g.micro)"
  type        = string
  default     = "cache.t4g.micro"
}

variable "redis_num_cache_clusters" {
  description = "Number of cache clusters (nodes)"
  type        = number
  default     = 1  # 2+ for automatic failover
}

variable "redis_automatic_failover" {
  description = "Enable automatic failover for Redis cluster"
  type        = bool
  default     = false  # true for prod
}

# ============ STORAGE (S3) ============
variable "s3_bucket_prefix" {
  description = "Prefix for S3 bucket names (must be globally unique)"
  type        = string
  default     = "autoapply"
  validation {
    condition     = can(regex("^[a-z0-9-]+$", var.s3_bucket_prefix))
    error_message = "S3 bucket prefix must contain only lowercase letters, numbers, and hyphens."
  }
}

# ============ DOMAIN & DNS ============
variable "api_domain" {
  description = "API domain (e.g., api.autoapply.app or api-staging.autoapply.app)"
  type        = string
  default     = ""  # Set in environment tfvars
}

variable "route53_zone_id" {
  description = "Route 53 hosted zone ID for the production API domain."
  type        = string
  default     = ""
}

variable "runtime_secrets_arn" {
  description = "ARN of a Secrets Manager JSON secret containing production API configuration."
  type        = string
  default     = ""
}

variable "runtime_secrets_kms_key_arn" {
  description = "Optional customer-managed KMS key ARN used to encrypt the runtime secrets."
  type        = string
  default     = null
}

variable "api_image_tag" {
  description = "Initial API image tag used by the ECS task definition."
  type        = string
  default     = "latest"
}

variable "cors_origin" {
  description = "Comma-separated exact production customer and admin frontend origins."
  type        = string
  default     = ""
}

# ============ COMPUTE (ECS) ============
variable "api_container_port" {
  description = "Container port for NestJS API"
  type        = number
  default     = 3000
}

variable "ecs_task_cpu" {
  description = "ECS task CPU in CPU units (256, 512, 1024, 2048, etc.)"
  type        = number
  default     = 256
}

variable "ecs_task_memory" {
  description = "ECS task memory in MB"
  type        = number
  default     = 512
}

variable "ecs_desired_count" {
  description = "Desired number of ECS tasks"
  type        = number
  default     = 1  # 2+ for prod
}
