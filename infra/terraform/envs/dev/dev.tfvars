environment = "dev"
aws_region  = "ap-south-1"

# Networking
vpc_cidr = "10.0.0.0/16"

# Database (minimal for dev)
db_instance_class   = "db.t4g.micro"
allocated_storage   = 20
backup_retention_days = 1
database_multi_az   = false

# Cache
redis_node_type          = "cache.t4g.micro"
redis_num_cache_clusters = 1
redis_automatic_failover = false

# Storage
s3_bucket_prefix = "autoapply-dev"

# Domain
api_domain = "api-dev.autoapply.local"

# ECS (disabled)
ecs_desired_count = 1
ecs_task_cpu      = 256
ecs_task_memory   = 512
