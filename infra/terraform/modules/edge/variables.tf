variable "project_name" { type = string }
variable "environment" { type = string }
variable "api_domain" { type = string; default = "" }
variable "enable_cloudfront" { type = bool; default = false }
