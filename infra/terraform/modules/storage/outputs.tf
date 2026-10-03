output "bucket_name" {
  value = aws_s3_bucket.uploads.id
}

output "kms_key_id" {
  value = aws_kms_key.main.key_id
}

output "kms_key_arn" {
  value = aws_kms_key.main.arn
}
