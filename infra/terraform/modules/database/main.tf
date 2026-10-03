resource "aws_db_instance" "postgres" {
  identifier              = "${var.project_name}-postgres-${var.environment}"
  engine                  = "postgres"
  engine_version          = "16.1"
  instance_class          = var.db_instance_class
  allocated_storage       = var.allocated_storage
  storage_type            = "gp3"
  storage_encrypted       = true
  db_name                 = var.db_name
  username                = var.db_username
  password                = var.db_password
  db_subnet_group_name    = var.db_subnet_group_id
  vpc_security_group_ids  = [var.db_security_group_id]
  multi_az                = var.multi_az
  backup_retention_period = var.backup_retention_days
  backup_window           = "03:00-04:00"
  maintenance_window      = "mon:04:00-mon:05:00"
  deletion_protection     = var.environment == "prod" ? true : false
  skip_final_snapshot     = var.environment != "prod"
  publicly_accessible     = false

  # Enable PostgreSQL extensions
  parameter_group_name = aws_db_parameter_group.postgres.name

  tags = {
    Name = "${var.project_name}-postgres-${var.environment}"
  }
}

resource "aws_db_parameter_group" "postgres" {
  name_prefix = "${var.project_name}-pg-"
  family      = "postgres16"

  parameter {
    name  = "shared_preload_libraries"
    value = "pgvector"
  }

  tags = {
    Name = "${var.project_name}-pg-params"
  }
}
