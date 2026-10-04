resource "aws_ecs_task_definition" "api" {
  family                   = "${var.project_name}-api-${var.environment}"
  network_mode             = "awsvpc"
  requires_compatibilities = ["FARGATE"]
  cpu                      = tostring(var.ecs_task_cpu)
  memory                   = tostring(var.ecs_task_memory)
  execution_role_arn       = aws_iam_role.ecs_task_execution_role.arn
  task_role_arn            = aws_iam_role.ecs_task_role.arn

  container_definitions = jsonencode([
    {
      name      = "api"
      image     = "${aws_ecr_repository.api.repository_url}:${var.api_image_tag}"
      essential = true

      portMappings = [
        {
          containerPort = var.api_container_port
          hostPort      = var.api_container_port
          protocol      = "tcp"
        }
      ]

      environment = [
        { name = "NODE_ENV", value = "production" },
        { name = "API_PORT", value = tostring(var.api_container_port) },
        { name = "AWS_REGION", value = var.aws_region },
        { name = "KMS_REGION", value = var.aws_region },
        { name = "S3_REGION", value = var.aws_region },
        { name = "S3_BUCKET", value = var.s3_bucket_name },
        { name = "CORS_ORIGIN", value = var.cors_origin },
        { name = "OTP_TRANSPORT", value = "ses" },
        { name = "SMS_OTP_TRANSPORT", value = "twilio" }
      ]

      secrets = [
        { name = "DATABASE_URL", valueFrom = "${var.runtime_secrets_arn}:DATABASE_URL::" },
        { name = "REDIS_URL", valueFrom = "${var.runtime_secrets_arn}:REDIS_URL::" },
        { name = "JWT_PRIVATE_KEY", valueFrom = "${var.runtime_secrets_arn}:JWT_PRIVATE_KEY::" },
        { name = "JWT_PUBLIC_KEY", valueFrom = "${var.runtime_secrets_arn}:JWT_PUBLIC_KEY::" },
        { name = "OTP_PEPPER", valueFrom = "${var.runtime_secrets_arn}:OTP_PEPPER::" },
        { name = "OTP_SENDER_EMAIL", valueFrom = "${var.runtime_secrets_arn}:OTP_SENDER_EMAIL::" },
        { name = "TWILIO_ACCOUNT_SID", valueFrom = "${var.runtime_secrets_arn}:TWILIO_ACCOUNT_SID::" },
        { name = "TWILIO_AUTH_TOKEN", valueFrom = "${var.runtime_secrets_arn}:TWILIO_AUTH_TOKEN::" },
        { name = "TWILIO_FROM_NUMBER", valueFrom = "${var.runtime_secrets_arn}:TWILIO_FROM_NUMBER::" },
        { name = "KMS_KEY_ID", valueFrom = "${var.runtime_secrets_arn}:KMS_KEY_ID::" },
        { name = "S3_ACCESS_KEY", valueFrom = "${var.runtime_secrets_arn}:S3_ACCESS_KEY::" },
        { name = "S3_SECRET_KEY", valueFrom = "${var.runtime_secrets_arn}:S3_SECRET_KEY::" },
        { name = "RAZORPAY_KEY_ID", valueFrom = "${var.runtime_secrets_arn}:RAZORPAY_KEY_ID::" },
        { name = "RAZORPAY_KEY_SECRET", valueFrom = "${var.runtime_secrets_arn}:RAZORPAY_KEY_SECRET::" },
        { name = "RAZORPAY_WEBHOOK_SECRET", valueFrom = "${var.runtime_secrets_arn}:RAZORPAY_WEBHOOK_SECRET::" }
      ]

      logConfiguration = {
        logDriver = "awslogs"
        options = {
          "awslogs-group"         = aws_cloudwatch_log_group.ecs_logs.name
          "awslogs-region"        = var.aws_region
          "awslogs-stream-prefix" = "ecs"
        }
      }

      healthCheck = {
        command = [
          "CMD-SHELL",
          "node -e \"fetch('http://127.0.0.1:${var.api_container_port}/v1/health/ready').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))\""
        ]
        interval    = 30
        timeout     = 5
        retries     = 3
        startPeriod = 60
      }
    }
  ])

  depends_on = [
    aws_iam_role_policy_attachment.ecs_task_execution_role_policy,
    aws_iam_role_policy.ecs_task_execution_secrets,
    aws_iam_role_policy.ecs_task_role_runtime,
    aws_cloudwatch_log_group.ecs_logs
  ]
}

resource "aws_iam_role" "ecs_task_execution_role" {
  name = "${var.project_name}-ecs-execution-${var.environment}"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "ecs-tasks.amazonaws.com"
        }
      }
    ]
  })
}

resource "aws_iam_role_policy_attachment" "ecs_task_execution_role_policy" {
  role       = aws_iam_role.ecs_task_execution_role.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

resource "aws_iam_role_policy" "ecs_task_execution_secrets" {
  name = "${var.project_name}-ecs-execution-secrets"
  role = aws_iam_role.ecs_task_execution_role.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = concat(
      [
        {
          Effect   = "Allow"
          Action   = ["secretsmanager:GetSecretValue"]
          Resource = var.runtime_secrets_arn
        }
      ],
      var.runtime_secrets_kms_key_arn == null ? [] : [
        {
          Effect   = "Allow"
          Action   = ["kms:Decrypt"]
          Resource = var.runtime_secrets_kms_key_arn
        }
      ]
    )
  })
}

resource "aws_iam_role" "ecs_task_role" {
  name = "${var.project_name}-ecs-task-${var.environment}"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "ecs-tasks.amazonaws.com"
        }
      }
    ]
  })
}

resource "aws_iam_role_policy" "ecs_task_role_runtime" {
  name = "${var.project_name}-ecs-runtime"
  role = aws_iam_role.ecs_task_role.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = ["kms:Decrypt", "kms:Encrypt", "kms:GenerateDataKey"]
        Resource = var.kms_key_arn
      },
      {
        Effect = "Allow"
        Action = ["s3:GetObject", "s3:PutObject"]
        Resource = "${var.s3_bucket_arn}/*"
      },
      {
        Effect   = "Allow"
        Action   = ["ses:SendEmail", "ses:SendRawEmail"]
        Resource = "*"
      }
    ]
  })
}

resource "aws_cloudwatch_log_group" "ecs_logs" {
  name              = "/ecs/${var.project_name}-api-${var.environment}"
  retention_in_days = 30
}

output "ecs_task_definition_arn" {
  value = aws_ecs_task_definition.api.arn
}

output "ecs_task_execution_role_arn" {
  value = aws_iam_role.ecs_task_execution_role.arn
}

output "ecs_task_role_arn" {
  value = aws_iam_role.ecs_task_role.arn
}
