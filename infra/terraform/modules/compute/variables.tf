variable "project_name" { type = string }
variable "environment" { type = string }
variable "private_subnet_ids" { type = list(string) }
variable "alb_subnet_ids" { type = list(string) }
variable "alb_security_group_id" { type = string }
