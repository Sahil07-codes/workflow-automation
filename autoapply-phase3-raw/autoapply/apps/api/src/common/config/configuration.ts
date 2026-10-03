import * as Joi from 'joi';

export interface AppConfig {
  node_env: 'development' | 'staging' | 'production' | 'test';
  app_name: string;
  api_port: number;
  log_level: string;
  
  // Database
  database_url: string;
  
  // Redis
  redis_url: string;
  
  // JWT
  jwt_private_key: string;
  jwt_public_key: string;
  jwt_expiry: string;
  
  // OTP
  otp_length: number;
  otp_ttl: number;
  otp_max_attempts: number;
  otp_pepper: string;
  otp_resend_cooldown: number;
  
  // KMS
  kms_key_id: string;
  kms_region: string;
  kms_endpoint?: string;
  
  // S3
  s3_bucket: string;
  s3_endpoint?: string;
  s3_access_key: string;
  s3_secret_key: string;
  
  // CORS
  cors_origin: string;
  
  // Sentry (optional)
  sentry_dsn?: string;
}

export const validationSchema = Joi.object<AppConfig>({
  node_env: Joi.string()
    .valid('development', 'staging', 'production', 'test')
    .default('development'),
  app_name: Joi.string().required(),
  api_port: Joi.number().port().default(3000),
  log_level: Joi.string()
    .valid('error', 'warn', 'info', 'debug')
    .default('info'),
  
  // Database
  database_url: Joi.string().uri().required(),
  
  // Redis
  redis_url: Joi.string().uri().required(),
  
  // JWT
  jwt_private_key: Joi.string().required(),
  jwt_public_key: Joi.string().required(),
  jwt_expiry: Joi.string().default('15m'),
  
  // OTP
  otp_length: Joi.number().min(4).max(10).default(6),
  otp_ttl: Joi.number().min(60).max(3600).default(300),
  otp_max_attempts: Joi.number().min(1).max(10).default(5),
  otp_pepper: Joi.string().required(),
  otp_resend_cooldown: Joi.number().min(10).default(60),
  
  // KMS
  kms_key_id: Joi.string().required(),
  kms_region: Joi.string().required(),
  kms_endpoint: Joi.string().optional(),
  
  // S3
  s3_bucket: Joi.string().required(),
  s3_endpoint: Joi.string().optional(),
  s3_access_key: Joi.string().required(),
  s3_secret_key: Joi.string().required(),
  
  // CORS
  cors_origin: Joi.string().default('*'),
  
  // Sentry
  sentry_dsn: Joi.string().optional(),
}).unknown(true);

export function validate(config: Record<string, any>): AppConfig {
  const { error, value } = validationSchema.validate(config, {
    abortEarly: false,
  });

  if (error) {
    const messages = error.details.map(d => `${d.path.join('.')}: ${d.message}`);
    throw new Error(`Config validation failed:\n${messages.join('\n')}`);
  }

  return value as AppConfig;
}
