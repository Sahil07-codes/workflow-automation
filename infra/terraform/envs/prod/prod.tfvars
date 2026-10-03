environment = "prod"
aws_region  = "ap-south-1"

# Networking
vpc_cidr = "10.2.0.0/16"

# Database (High availability)
db_instance_class   = "db.t4g.medium"
allocated_storage   = 200
backup_retention_days = 30
database_multi_az   = true

# Cache (Automatic failover)
redis_node_type          = "cache.t4g.small"
redis_num_cache_clusters = 2
redis_automatic_failover = true

# Storage
s3_bucket_prefix = "autoapply-prod"

# Domain
api_domain = "api.autoapply.app"

# ECS (High availability)
ecs_desired_count = 3
ecs_task_cpu      = 1024
ecs_task_memory   = 2048
