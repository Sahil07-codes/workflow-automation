output "cloudfront_domain" {
  value = try(aws_cloudfront_distribution.api[0].domain_name, "")
}

output "cloudfront_id" {
  value = try(aws_cloudfront_distribution.api[0].id, "")
}
