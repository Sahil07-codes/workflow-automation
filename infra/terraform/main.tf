# AutoApply AWS Infrastructure as Code
# Phase 0-2: Foundation, Authentication, Profile

terraform {
  required_version = ">= 1.0"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }

  # Backend configuration moved to envs/*/backend.tf for environment-specific state
  # This allows separate state per environment while keeping main.tf generic
}

provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      Environment = var.environment
      Project     = var.project_name
      ManagedBy   = "Terraform"
      Phase       = "0-2"
    }
  }
}

# Data source for availability zones in the region
data "aws_availability_zones" "available" {
  state = "available"
}

# ============ NETWORKING ============
module "network" {
  source = "./modules/network"

  project_name           = var.project_name
  environment            = var.environment
  vpc_cidr               = var.vpc_cidr
  availability_zones     = data.aws_availability_zones.available.names
  public_subnet_cidrs    = var.public_subnet_cidrs
  private_subnet_cidrs   = var.private_subnet_cidrs
  data_subnet_cidrs      = var.data_subnet_cidrs
  restricted_subnet_cidr = var.restricted_subnet_cidr
}

# ============ DATABASE ============
module "database" {
  source = "./modules/database"

  project_name           = var.project_name
  environment            = var.environment
  db_name                = var.db_name
  db_username            = var.db_username
  db_password            = var.db_password
  db_instance_class      = var.db_instance_class
  allocated_storage      = var.allocated_storage
  vpc_id                 = module.network.vpc_id
  db_subnet_group_id     = module.network.db_subnet_group_id
  db_security_group_id   = module.network.db_security_group_id
  backup_retention_days  = var.backup_retention_days
  multi_az               = var.database_multi_az
}

# ============ CACHE (REDIS) ============
module "cache" {
  source = "./modules/cache"

  project_name              = var.project_name
  environment               = var.environment
  redis_node_type           = var.redis_node_type
  redis_num_cache_clusters  = var.redis_num_cache_clusters
  vpc_id                    = module.network.vpc_id
  cache_subnet_group_id     = module.network.cache_subnet_group_id
  cache_security_group_id   = module.network.cache_security_group_id
  automatic_failover_enabled = var.redis_automatic_failover
}

# ============ STORAGE (S3 + KMS) ============
module "storage" {
  source = "./modules/storage"

  project_name       = var.project_name
  environment        = var.environment
  s3_bucket_prefix   = var.s3_bucket_prefix
  kms_key_description = "KMS key for AutoApply ${var.environment}"
}

# ============ COMPUTE (ECS) ============
# Scaffolded for Phase 3; minimal until then
module "compute" {
  source = "./modules/compute"

  project_name       = var.project_name
  environment        = var.environment
  vpc_id             = module.network.vpc_id
  private_subnet_ids = module.network.private_subnet_ids
  alb_subnet_ids     = module.network.public_subnet_ids

  # Will be populated during Phase 3
  enable_ecs_service = false
}

# ============ EDGE (CloudFront + WAF) ============
# Scaffolded; enabled during Phase 3
module "edge" {
  source = "./modules/edge"

  project_name   = var.project_name
  environment    = var.environment
  api_domain     = var.api_domain
  enable_cloudfront = false  # Enabled in prod during Phase 3
}

# ============ SECRETS MANAGER ============
module "secrets" {
  source = "./modules/secrets"

  project_name = var.project_name
  environment  = var.environment
  # Actual secret values are NOT managed by TF (handled via AWS Console or CLI)
  # This module just defines the structure and references
}
