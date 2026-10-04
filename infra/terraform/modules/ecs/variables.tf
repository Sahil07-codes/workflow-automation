variable "project_name" {
  type = string
}

variable "environment" {
  type = string
}

variable "aws_region" {
  type = string
}

variable "api_container_port" {
  type = number
}

variable "ecs_task_cpu" {
  type = number
}

variable "ecs_task_memory" {
  type = number
}

variable "ecs_desired_count" {
  type = number
}

variable "api_image_tag" {
  type = string
}

variable "runtime_secrets_arn" {
  description = "Secrets Manager JSON secret containing the API runtime environment values."
  type        = string

  validation {
    condition     = can(regex("^arn:[^:]+:secretsmanager:[^:]+:[0-9]{12}:secret:.+$", var.runtime_secrets_arn))
    error_message = "runtime_secrets_arn must be a Secrets Manager secret ARN."
  }
}

variable "runtime_secrets_kms_key_arn" {
  description = "Optional customer-managed KMS key used to encrypt the runtime secret."
  type        = string
  default     = null
}

variable "cors_origin" {
  description = "Comma-separated exact production frontend origins."
  type        = string

  validation {
    condition = length(trimspace(var.cors_origin)) > 0 && alltrue([
      for origin in split(",", var.cors_origin) : can(regex("^https://[A-Za-z0-9.-]+(:[0-9]{1,5})?$", trimspace(origin)))
    ])
    error_message = "cors_origin must contain comma-separated HTTPS origins."
  }
}

variable "s3_bucket_name" {
  type = string
}

variable "s3_bucket_arn" {
  type = string
}

variable "kms_key_arn" {
  type = string
}

variable "private_subnet_ids" {
  type = list(string)
}

variable "vpc_id" {
  type = string
}

variable "ecs_security_group_id" {
  type = string
}

variable "alb_arn" {
  type = string
}

variable "ecs_cluster_id" {
  type = string
}

variable "route53_zone_id" {
  description = "Route 53 hosted zone containing the API domain."
  type        = string

  validation {
    condition     = can(regex("^Z[A-Z0-9]+$", var.route53_zone_id))
    error_message = "route53_zone_id must be a hosted zone ID without the /hostedzone/ prefix."
  }
}

variable "api_domain" {
  description = "Public API DNS name, covered by the ACM certificate."
  type        = string

  validation {
    condition     = can(regex("^[A-Za-z0-9.-]+\\.[A-Za-z]{2,}$", var.api_domain))
    error_message = "api_domain must be a fully qualified DNS name."
  }
}

variable "alb_dns_name" {
  type = string
}

variable "alb_zone_id" {
  type = string
}
