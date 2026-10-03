import { z } from 'zod';
import { EmailSchema, PhoneE164Schema, UuidSchema } from './common.schema';

/**
 * Signup request payload
 */
export const SignupRequestSchema = z.object({
  email: EmailSchema,
  phone_e164: PhoneE164Schema,
  password: z.string().min(8).max(128).optional(),
  consent_version: z.string(),
  referral_code: z.string().trim().min(1).max(64).optional(),
});

export type SignupRequest = z.infer<typeof SignupRequestSchema>;

/**
 * OTP send request
 */
export const OtpSendRequestSchema = z.object({
  target: z.union([EmailSchema, PhoneE164Schema]),
  channel: z.enum(['EMAIL', 'SMS']),
  challenge_id: z.string().optional(),
});

export type OtpSendRequest = z.infer<typeof OtpSendRequestSchema>;

/**
 * OTP verify request
 */
export const OtpVerifyRequestSchema = z.object({
  target: z.union([EmailSchema, PhoneE164Schema]),
  code: z.string().regex(/^\d{6}$/),
  challenge_id: z.string().optional(),
});

export type OtpVerifyRequest = z.infer<typeof OtpVerifyRequestSchema>;

/**
 * Login request (OTP or password)
 */
export const LoginRequestSchema = z.object({
  email: EmailSchema.optional(),
  phone_e164: PhoneE164Schema.optional(),
  method: z.enum(['OTP', 'PASSWORD']),
  password: z.string().optional(),
  otp_code: z.string().regex(/^\d{6}$/).optional(),
}).refine(
  (data) => {
    if (data.method === 'OTP') {
      return !!(data.email || data.phone_e164) && data.otp_code;
    }
    if (data.method === 'PASSWORD') {
      return data.email && data.password;
    }
    return false;
  },
  { message: 'Invalid login method or missing required fields' }
);

export type LoginRequest = z.infer<typeof LoginRequestSchema>;

/**
 * Token pair response
 */
export const TokenPairSchema = z.object({
  access_token: z.string(),
  refresh_token: z.string(),
  expires_in: z.number().int().positive(),
  token_type: z.literal('Bearer'),
});

export type TokenPair = z.infer<typeof TokenPairSchema>;

/**
 * Refresh token request
 */
export const RefreshRequestSchema = z.object({
  refresh_token: z.string(),
});

export type RefreshRequest = z.infer<typeof RefreshRequestSchema>;

/**
 * Logout request
 */
export const LogoutRequestSchema = z.object({
  refresh_token: z.string().optional(),
});

export type LogoutRequest = z.infer<typeof LogoutRequestSchema>;

/**
 * JWT payload structure
 */
export const JwtPayloadSchema = z.object({
  sub: UuidSchema, // user ID
  email: EmailSchema,
  role: z.enum(['USER', 'SUPPORT', 'ADMIN', 'SUPERADMIN']),
  sid: z.string(), // session ID (refresh token family ID)
  iat: z.number(),
  exp: z.number(),
});

export type JwtPayload = z.infer<typeof JwtPayloadSchema>;
