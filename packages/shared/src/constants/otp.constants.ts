/**
 * OTP configuration constants
 */
export const OTP_CONFIG = {
  // OTP code generation
  LENGTH: 6,
  CHARSET: '0123456789',

  // Timing
  TTL_SECONDS: 300, // 5 minutes
  RESEND_COOLDOWN_SECONDS: 60, // 60 seconds between resends

  // Rate limiting
  MAX_ATTEMPTS: 5, // Max wrong attempts per challenge
  MAX_RESENDS_PER_HOUR: 5, // Max resend requests per target per hour
  MAX_CHALLENGES_PER_IP_PER_HOUR: 10, // Anti-spam for SMS pumping
  MAX_CHALLENGES_PER_PHONE_PER_HOUR: 5, // Per-phone anti-spam

  // Retry and backoff
  LOCKOUT_DURATION_SECONDS: 900, // 15 minutes after max attempts
  EXPONENTIAL_BACKOFF_MULTIPLIER: 2,
  BASE_BACKOFF_SECONDS: 1,

  // Delivery channels
  CHANNELS: {
    EMAIL: 'EMAIL',
    SMS: 'SMS',
  },
};

/**
 * Allowed country codes for SMS (India-first, expand later)
 */
export const ALLOWED_SMS_COUNTRIES = [
  'IN', // India
  'US',
  'GB',
  'DE',
  'AU',
];

/**
 * Blocked SMS patterns (disposable email providers, etc.)
 */
export const BLOCKED_EMAIL_DOMAINS = [
  'tempmail.com',
  '10minutemail.com',
  'guerrillamail.com',
  'mailinator.com',
  'throwaway.email',
];
