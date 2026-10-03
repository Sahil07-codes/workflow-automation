environment = "staging"
aws_region  = "ap-south-1"

# Networking
vpc_cidr = "10.1.0.0/16"

# Database
db_instance_class   = "db.t4g.small"
allocated_storage   = 50
backup_retention_days = 7
database_multi_az   = false

# Cache
redis_node_type          = "cache.t4g.small"
redis_num_cache_clusters = 1
redis_automatic_failover = false

# Storage
s3_bucket_prefix = "autoapply-staging"

# Domain
api_domain = "api-staging.autoapply.app"

# ECS
ecs_desired_count = 2
ecs_task_cpu      = 512
ecs_task_memory   = 1024
