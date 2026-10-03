variable "project_name" { type = string }
variable "environment" { type = string }
variable "redis_node_type" { type = string }
variable "redis_num_cache_clusters" { type = number }
variable "cache_subnet_group_id" { type = string }
variable "cache_security_group_id" { type = string }
variable "automatic_failover_enabled" { type = bool }
