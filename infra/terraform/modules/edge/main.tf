# CloudFront and WAF (scaffolded for Phase 3)
# Minimal for Phase 0-2

resource "aws_wafv2_ip_set" "rate_limit_whitelist" {
  name              = "${var.project_name}-rate-limit-whitelist"
  scope             = "CLOUDFRONT"
  ip_address_version = "IPV4"
  addresses          = []

  tags = {
    Name = "${var.project_name}-rate-limit-whitelist"
  }
}

# CloudFront distribution (disabled in Phase 0-2)
resource "aws_cloudfront_distribution" "api" {
  count = var.enable_cloudfront ? 1 : 0

  origin {
    domain_name = var.api_domain
    origin_id   = "api"

    custom_origin_config {
      http_port              = 80
      https_port             = 443
      origin_protocol_policy = "https-only"
      origin_ssl_protocols   = ["TLSv1.2"]
    }
  }

  enabled = true
  is_ipv6_enabled = true
  default_root_object = ""

  default_cache_behavior {
    allowed_methods  = ["GET", "HEAD", "OPTIONS", "PUT", "POST", "PATCH", "DELETE"]
    cached_methods   = ["GET", "HEAD"]
    target_origin_id = "api"

    forwarded_values {
      query_string = true

      cookies {
        forward = "all"
      }

      headers = ["*"]
    }

    viewer_protocol_policy = "redirect-to-https"
    min_ttl                = 0
    default_ttl            = 0
    max_ttl                = 0
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  viewer_certificate {
    cloudfront_default_certificate = true
  }

  tags = {
    Name = "${var.project_name}-cdn"
  }
}
