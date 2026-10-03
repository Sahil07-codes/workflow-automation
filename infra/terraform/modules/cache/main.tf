resource "aws_elasticache_cluster" "redis" {
  cluster_id           = "${var.project_name}-redis-${var.environment}"
  engine               = "redis"
  node_type            = var.redis_node_type
  num_cache_nodes      = var.redis_num_cache_clusters
  parameter_group_name = "default.redis7"
  engine_version       = "7.0"
  port                 = 6379
  subnet_group_name    = var.cache_subnet_group_id
  security_group_ids   = [var.cache_security_group_id]
  at_rest_encryption_enabled = true
  transit_encryption_enabled = false  # Can enable in prod with auth_token

  auto_failover_enabled = var.automatic_failover_enabled

  maintenance_window = "mon:03:00-mon:04:00"
  notification_topic_arn = ""

  tags = {
    Name = "${var.project_name}-redis-${var.environment}"
  }
}
