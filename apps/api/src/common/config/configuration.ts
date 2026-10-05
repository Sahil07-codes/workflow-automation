import * as Joi from 'joi';

export interface AppConfig {
  node_env: 'development' | 'staging' | 'production' | 'test';
  app_name: string;
  api_port: number;
  log_level: string;

  database_url: string;
  redis_url: string;

  jwt_private_key: string;
  jwt_public_key: string;
  jwt_expiry: string;

  otp_length: number;
  otp_ttl: number;
  otp_max_attempts: number;
  otp_pepper: string;
  otp_transport: 'console' | 'ses' | 'smtp';
  sms_otp_transport: 'disabled' | 'twilio';
  otp_sender_email?: string;
  smtp_host?: string;
  smtp_port: number;
  smtp_secure: boolean;
  smtp_user?: string;
  smtp_password?: string;
  twilio_account_sid?: string;
  twilio_auth_token?: string;
  twilio_from_number?: string;
  otp_resend_cooldown: number;

  kms_key_id: string;
  kms_region: string;
  kms_endpoint?: string;

  s3_bucket: string;
  s3_endpoint?: string;
  s3_region: string;
  s3_access_key: string;
  s3_secret_key: string;

  razorpay_key_id: string;
  razorpay_key_secret: string;
  razorpay_webhook_secret: string;
  subscription_bypass: boolean;

  greenhouse_board_tokens: string;
  lever_company_ids: string;
  ashby_company_ids: string;
  embedding_similarity_threshold: number;
  llm_scoring_enabled: boolean;

  cors_origin: string;
  sentry_dsn?: string;
  sentry_environment?: string;
}

// Maps each AppConfig key (lowercase_snake_case) to the actual process.env
// variable name (UPPERCASE), matching .env.example exactly. This mapping is
// the piece that was missing before: @nestjs/config's `validate` hook
// receives the raw process.env object, whose keys are uppercase, so
// validating directly against a lowercase Joi schema rejected every field.
const ENV_KEY_MAP: Record<keyof AppConfig, string> = {
  node_env: 'NODE_ENV',
  app_name: 'APP_NAME',
  api_port: 'API_PORT',
  log_level: 'LOG_LEVEL',
  database_url: 'DATABASE_URL',
  redis_url: 'REDIS_URL',
  jwt_private_key: 'JWT_PRIVATE_KEY',
  jwt_public_key: 'JWT_PUBLIC_KEY',
  jwt_expiry: 'JWT_EXPIRY',
  otp_length: 'OTP_LENGTH',
  otp_ttl: 'OTP_TTL',
  otp_max_attempts: 'OTP_MAX_ATTEMPTS',
  otp_pepper: 'OTP_PEPPER',
  otp_transport: 'OTP_TRANSPORT',
  sms_otp_transport: 'SMS_OTP_TRANSPORT',
  otp_sender_email: 'OTP_SENDER_EMAIL',
  smtp_host: 'SMTP_HOST',
  smtp_port: 'SMTP_PORT',
  smtp_secure: 'SMTP_SECURE',
  smtp_user: 'SMTP_USER',
  smtp_password: 'SMTP_PASSWORD',
  twilio_account_sid: 'TWILIO_ACCOUNT_SID',
  twilio_auth_token: 'TWILIO_AUTH_TOKEN',
  twilio_from_number: 'TWILIO_FROM_NUMBER',
  otp_resend_cooldown: 'OTP_RESEND_COOLDOWN',
  kms_key_id: 'KMS_KEY_ID',
  kms_region: 'KMS_REGION',
  kms_endpoint: 'KMS_ENDPOINT',
  s3_bucket: 'S3_BUCKET',
  s3_endpoint: 'S3_ENDPOINT',
  s3_region: 'S3_REGION',
  s3_access_key: 'S3_ACCESS_KEY',
  s3_secret_key: 'S3_SECRET_KEY',
  razorpay_key_id: 'RAZORPAY_KEY_ID',
  razorpay_key_secret: 'RAZORPAY_KEY_SECRET',
  razorpay_webhook_secret: 'RAZORPAY_WEBHOOK_SECRET',
  subscription_bypass: 'SUBSCRIPTION_BYPASS',
  greenhouse_board_tokens: 'GREENHOUSE_BOARD_TOKENS',
  lever_company_ids: 'LEVER_COMPANY_IDS',
  ashby_company_ids: 'ASHBY_COMPANY_IDS',
  embedding_similarity_threshold: 'EMBEDDING_SIMILARITY_THRESHOLD',
  llm_scoring_enabled: 'LLM_SCORING_ENABLED',
  cors_origin: 'CORS_ORIGIN',
  sentry_dsn: 'SENTRY_DSN',
  sentry_environment: 'SENTRY_ENVIRONMENT',
};

const validationSchema = Joi.object<AppConfig>({
  node_env: Joi.string()
    .valid('development', 'staging', 'production', 'test')
    .default('development'),
  app_name: Joi.string().default('AutoApply'),
  api_port: Joi.number().default(3000),
  log_level: Joi.string().default('info'),

  database_url: Joi.string().required(),
  redis_url: Joi.string().required(),

  jwt_private_key: Joi.string().required(),
  jwt_public_key: Joi.string().required(),
  jwt_expiry: Joi.string().default('15m'),

  otp_length: Joi.number().min(4).max(10).default(6),
  otp_ttl: Joi.number().min(60).max(3600).default(300),
  otp_max_attempts: Joi.number().min(1).max(10).default(5),
  otp_pepper: Joi.string().required(),
  otp_transport: Joi.string()
    .valid('console', 'ses', 'smtp')
    .when('node_env', {
      is: 'production',
      then: Joi.valid('ses'),
    })
    .default('ses'),
  sms_otp_transport: Joi.string()
    .valid('disabled', 'twilio')
    .when('node_env', {
      is: 'production',
      then: Joi.valid('twilio'),
    })
    .default('disabled'),
  otp_sender_email: Joi.string()
    .email()
    .when('otp_transport', {
      is: Joi.valid('ses', 'smtp'),
      then: Joi.required(),
      otherwise: Joi.optional().allow(''),
    }),
  smtp_host: Joi.string().when('otp_transport', {
    is: 'smtp',
    then: Joi.required(),
    otherwise: Joi.optional().allow(''),
  }),
  smtp_port: Joi.number().port().default(465),
  smtp_secure: Joi.boolean().default(true),
  smtp_user: Joi.string().when('otp_transport', {
    is: 'smtp',
    then: Joi.required(),
    otherwise: Joi.optional().allow(''),
  }),
  smtp_password: Joi.string().when('otp_transport', {
    is: 'smtp',
    then: Joi.required(),
    otherwise: Joi.optional().allow(''),
  }),
  twilio_account_sid: Joi.string()
    .pattern(/^AC[0-9a-fA-F]{32}$/)
    .when('sms_otp_transport', {
      is: 'twilio',
      then: Joi.required(),
      otherwise: Joi.optional().allow(''),
    }),
  twilio_auth_token: Joi.string()
    .min(32)
    .when('sms_otp_transport', {
      is: 'twilio',
      then: Joi.required(),
      otherwise: Joi.optional().allow(''),
    }),
  twilio_from_number: Joi.string()
    .pattern(/^\+[1-9]\d{7,14}$/)
    .when('sms_otp_transport', {
      is: 'twilio',
      then: Joi.required(),
      otherwise: Joi.optional().allow(''),
    }),
  otp_resend_cooldown: Joi.number().min(10).default(60),

  kms_key_id: Joi.string().required(),
  kms_region: Joi.string().required(),
  kms_endpoint: Joi.string().optional().allow(''),

  s3_bucket: Joi.string().required(),
  s3_endpoint: Joi.string().optional().allow(''),
  s3_region: Joi.string().default('ap-south-1'),
  s3_access_key: Joi.string().required(),
  s3_secret_key: Joi.string().required(),

  razorpay_key_id: Joi.string().required(),
  razorpay_key_secret: Joi.string().required(),
  razorpay_webhook_secret: Joi.string().required(),
  subscription_bypass: Joi.boolean().default(true),

  greenhouse_board_tokens: Joi.string().allow('').default(''),
  lever_company_ids: Joi.string().allow('').default(''),
  ashby_company_ids: Joi.string().allow('').default(''),
  embedding_similarity_threshold: Joi.number().min(0).max(1).default(0.65),
  llm_scoring_enabled: Joi.boolean().default(true),

  cors_origin: Joi.string().default('*'),
  sentry_dsn: Joi.string().optional().allow(''),
  sentry_environment: Joi.string().optional().allow(''),
});

/**
 * Called by Nest's ConfigModule.forRoot({ validate }) with the raw
 * process.env object (uppercase keys). We first remap it into the
 * lowercase shape our schema and the rest of the app expect, validate
 * that, and return the validated, typed, lowercase config object.
 */
export function validate(rawEnv: Record<string, any>): AppConfig {
  const remapped: Record<string, any> = {};
  for (const [configKey, envKey] of Object.entries(ENV_KEY_MAP)) {
    const configuredValue =
      rawEnv[envKey] ??
      (configKey === 'cors_origin' ? rawEnv.CORS_ORIGINS : undefined);
    if (configuredValue !== undefined) {
      remapped[configKey] = configuredValue;
    }
  }

  const { error, value } = validationSchema.validate(remapped, {
    abortEarly: false,
  });

  if (error) {
    const messages = error.details.map((d) => `${d.path.join('.')}: ${d.message}`);
    throw new Error(`Config validation failed:\n${messages.join('\n')}`);
  }

  return value as AppConfig;
}
